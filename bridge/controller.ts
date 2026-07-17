import { Fun60Device } from "./device";
import { findMatchingGame, listWindowsProcesses } from "./processes";
import { loadSettings, saveSettings, type StoredSettings } from "./store";
import type { AutomationSettings, BridgeStatus, KeyboardProfile, KeyboardSettingsSnapshot, ProfileId } from "../src/lib/types";

export class Controller {
  private readonly device = new Fun60Device();
  private settings: StoredSettings = loadSettings();
  private activeProcess: string | null = null;
  private lastAppliedAt: string | null = null;
  private lastError: string | null = null;
  private transitionCandidate: ProfileId | null = null;
  private transitionStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private applying = false;

  async start(): Promise<void> {
    await this.scan().catch(() => undefined);
    this.timer = setInterval(() => void this.automationTick(), 2000);
    this.timer.unref();
  }

  status(): BridgeStatus {
    return {
      bridgeConnected: true,
      version: "0.2.0",
      device: this.device.status(),
      activeProfile: this.settings.activeProfile,
      activeProcess: this.activeProcess,
      lastAppliedAt: this.lastAppliedAt,
      lastError: this.lastError,
      automation: this.settings.automation,
      profiles: this.settings.profiles,
    };
  }

  async scan(): Promise<BridgeStatus> {
    try {
      await this.device.scan();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    return this.status();
  }

  saveProfile(id: ProfileId, profile: KeyboardProfile): BridgeStatus {
    if (id !== "office" && id !== "game") throw new Error("Unknown profile.");
    this.settings.profiles[id] = sanitizeProfile({ ...profile, id });
    saveSettings(this.settings);
    return this.status();
  }

  saveAutomation(automation: AutomationSettings): BridgeStatus {
    this.settings.automation = {
      enabled: Boolean(automation.enabled),
      gameProcesses: Array.from(new Set(automation.gameProcesses.map((value) => value.trim()).filter(Boolean))).slice(0, 200),
      switchDelayMs: Math.max(500, Math.min(30_000, Number(automation.switchDelayMs) || 2500)),
    };
    saveSettings(this.settings);
    return this.status();
  }

  async apply(id: ProfileId): Promise<BridgeStatus> {
    if (this.applying) throw new Error("A profile is already being written.");
    if (id !== "office" && id !== "game") throw new Error("Unknown profile.");
    this.applying = true;
    try {
      const firmware = await this.device.apply(this.settings.profiles[id]);
      this.settings.profiles[id].precisionFactor = firmware.precisionFactor;
      this.settings.activeProfile = id;
      this.lastAppliedAt = new Date().toISOString();
      this.lastError = null;
      saveSettings(this.settings);
      return this.status();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.applying = false;
    }
  }

  async retrieve(): Promise<KeyboardSettingsSnapshot> {
    if (this.applying) throw new Error("The keyboard is busy.");
    this.applying = true;
    try {
      const snapshot = await this.device.retrieve();
      this.lastError = null;
      return snapshot;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.applying = false;
    }
  }

  async factoryReset(confirmation: string): Promise<BridgeStatus> {
    if (confirmation !== "RESET") throw new Error('Factory reset requires the exact confirmation "RESET".');
    if (this.applying) throw new Error("The keyboard is busy.");
    this.applying = true;
    try {
      await this.device.factoryReset();
      this.settings.activeProfile = "office";
      this.lastAppliedAt = null;
      this.activeProcess = null;
      saveSettings(this.settings);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        await this.scan();
        if (this.device.status().connected) break;
      }
      this.lastError = this.device.status().connected ? null : "Factory reset completed; reconnect the keyboard to retrieve its defaults.";
      return this.status();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.applying = false;
    }
  }

  private async automationTick(): Promise<void> {
    if (!this.settings.automation.enabled || this.applying) return;
    try {
      const processes = await listWindowsProcesses();
      const matched = findMatchingGame(processes, this.settings.automation.gameProcesses);
      this.activeProcess = matched;
      const wanted: ProfileId = matched ? "game" : "office";
      if (wanted === this.settings.activeProfile) {
        this.transitionCandidate = null;
        return;
      }
      if (this.transitionCandidate !== wanted) {
        this.transitionCandidate = wanted;
        this.transitionStartedAt = Date.now();
        return;
      }
      if (Date.now() - this.transitionStartedAt < this.settings.automation.switchDelayMs) return;
      if (!this.device.status().connected) await this.scan();
      if (this.device.status().connected) await this.apply(wanted);
      this.transitionCandidate = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }
}

function sanitizeProfile(profile: KeyboardProfile): KeyboardProfile {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value)));
  const polling = [125, 250, 500, 1000, 2000, 4000, 8000].includes(profile.pollingRateHz) ? profile.pollingRateHz : 1000;
  const precision = [10, 100, 200].includes(profile.precisionFactor) ? profile.precisionFactor : 200;
  return {
    ...profile,
    name: String(profile.name).slice(0, 40),
    description: String(profile.description).slice(0, 160),
    actuationMm: clamp(profile.actuationMm, 0.05, 4),
    releaseMm: clamp(profile.releaseMm, 0.05, 4),
    rapidPressMm: clamp(profile.rapidPressMm, 0.05, 1),
    rapidReleaseMm: clamp(profile.rapidReleaseMm, 0.05, 1),
    topDeadzoneMm: clamp(profile.topDeadzoneMm, 0.05, 1),
    bottomDeadzoneMm: clamp(profile.bottomDeadzoneMm, 0.05, 1),
    pollingRateHz: polling,
    precisionFactor: precision,
    rapidTrigger: Boolean(profile.rapidTrigger),
  };
}
