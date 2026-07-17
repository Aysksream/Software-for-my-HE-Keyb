import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_AUTOMATION, DEFAULT_PROFILES, type AutomationSettings, type KeyboardProfile, type ProfileId } from "../src/lib/types";

export interface StoredSettings {
  activeProfile: ProfileId;
  profiles: Record<ProfileId, KeyboardProfile>;
  automation: AutomationSettings;
}

const defaults: StoredSettings = {
  activeProfile: "office",
  profiles: structuredClone(DEFAULT_PROFILES),
  automation: structuredClone(DEFAULT_AUTOMATION),
};

function settingsPath(): string {
  const root = process.env.APPDATA || path.join(os.homedir(), ".config");
  return path.join(root, "Fun60Control", "settings.json");
}

function validProfileId(value: unknown): value is ProfileId {
  return value === "office" || value === "game";
}

export function loadSettings(): StoredSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<StoredSettings>;
    return {
      activeProfile: validProfileId(parsed.activeProfile) ? parsed.activeProfile : defaults.activeProfile,
      profiles: {
        office: { ...defaults.profiles.office, ...parsed.profiles?.office, id: "office" },
        game: { ...defaults.profiles.game, ...parsed.profiles?.game, id: "game" },
      },
      automation: { ...defaults.automation, ...parsed.automation },
    };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveSettings(settings: StoredSettings): void {
  const target = settingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}
