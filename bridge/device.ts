import {
  buildCommand,
  COMMAND,
  decodeU16Values,
  FUN60_VENDOR_ID,
  isSupportedFun60,
  MAGNETISM,
  pollingRateFromProtocol,
  precisionFactorFromFirmware,
  profileToReports,
} from "../src/lib/protocol";
import type { DeviceSummary, KeyboardProfile, KeyboardSettingsSnapshot, RetrievedMetric } from "../src/lib/types";

type HidModule = {
  devices(): Array<{
    path?: string;
    vendorId: number;
    productId: number;
    product?: string;
    usagePage?: number;
    usage?: number;
    interface?: number;
  }>;
  HID: new (path: string) => {
    sendFeatureReport(data: number[]): number;
    getFeatureReport(reportId: number, reportLength: number): number[];
    close(): void;
  };
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class Fun60Device {
  private hid: HidModule | null = null;
  private handle: InstanceType<HidModule["HID"]> | null = null;
  private summary: DeviceSummary = { connected: false, supported: false };

  async scan(): Promise<DeviceSummary> {
    this.close();
    try {
      const imported = await import("node-hid");
      this.hid = ((imported as { default?: HidModule }).default ?? imported) as HidModule;
      const candidates = this.hid.devices().filter((device) => device.vendorId === FUN60_VENDOR_ID && isSupportedFun60(device.vendorId, device.productId));
      const device = candidates.find((item) =>
        (item.usagePage === 0xffff || item.usagePage === 0xff00) && (item.usage === 0x02 || item.interface === 2),
      ) ?? candidates.find((item) => item.interface === 2) ?? candidates[0];

      if (!device?.path) {
        this.summary = { connected: false, supported: false };
        return this.summary;
      }

      this.handle = new this.hid.HID(device.path);
      this.summary = {
        connected: true,
        supported: true,
        vendorId: device.vendorId,
        productId: device.productId,
        product: device.product ?? "MonsGeek FUN60",
        transport: "bridge",
      };
      return this.summary;
    } catch (error) {
      this.summary = { connected: false, supported: false };
      throw new Error("HID scan failed. Close other keyboard software, reconnect the device, and try again.", { cause: error });
    }
  }

  status(): DeviceSummary {
    return this.summary;
  }

  async apply(profile: KeyboardProfile): Promise<{ firmwareVersion: number; precisionFactor: 10 | 100 | 200 }> {
    if (!this.handle || !this.summary.supported) throw new Error("No supported FUN60 is connected.");
    const firmware = await this.getFirmwareInfo();
    const reports = profileToReports({ ...profile, precisionFactor: firmware.precisionFactor });
    try {
      for (const [index, report] of reports.entries()) {
        this.handle.sendFeatureReport(Array.from(report));
        await sleep(index === reports.length - 1 ? 220 : 35);
      }
      return firmware;
    } catch (error) {
      this.close();
      throw new Error("Keyboard write failed. Rescan the keyboard and try again.", { cause: error });
    }
  }

  async retrieve(keyCount = 61): Promise<KeyboardSettingsSnapshot> {
    if (!this.handle || !this.summary.supported) throw new Error("No supported FUN60 is connected.");

    const { firmwareVersion, precisionFactor } = await this.getFirmwareInfo();

    const pollingResponse = await this.query(COMMAND.getPollingRate);
    if (pollingResponse[0] !== COMMAND.getPollingRate) throw new Error("The keyboard returned an invalid polling-rate response.");
    const pollingRateHz = pollingRateFromProtocol(pollingResponse[1]);

    const pagesU16 = Math.ceil((keyCount * 2) / 64);
    const readMagnetism = async (subCommand: number, pages: number) => {
      const bytes: number[] = [];
      for (let page = 0; page < pages; page += 1) {
        bytes.push(...await this.query(COMMAND.getMultiMagnetism, [subCommand, 1, page], true));
      }
      return bytes;
    };

    // Feature-report queries share one endpoint and must remain serialized.
    const modesBytes = await readMagnetism(MAGNETISM.keyMode, Math.ceil(keyCount / 64));
    const actuationBytes = await readMagnetism(MAGNETISM.pressTravel, pagesU16);
    const releaseBytes = await readMagnetism(MAGNETISM.liftTravel, pagesU16);
    const rapidPressBytes = await readMagnetism(MAGNETISM.rapidPress, pagesU16);
    const rapidReleaseBytes = await readMagnetism(MAGNETISM.rapidLift, pagesU16);
    const bottomBytes = await readMagnetism(MAGNETISM.bottomDeadzone, pagesU16);
    const topBytes = await readMagnetism(MAGNETISM.topDeadzone, pagesU16);

    const raw = {
      actuation: decodeU16Values(actuationBytes, keyCount),
      release: decodeU16Values(releaseBytes, keyCount),
      rapidPress: decodeU16Values(rapidPressBytes, keyCount),
      rapidRelease: decodeU16Values(rapidReleaseBytes, keyCount),
      topDeadzone: decodeU16Values(topBytes, keyCount),
      bottomDeadzone: decodeU16Values(bottomBytes, keyCount),
      modes: modesBytes.slice(0, keyCount),
    };
    const metrics = {
      actuation: summarizeMetric(raw.actuation, precisionFactor, true),
      release: summarizeMetric(raw.release, precisionFactor, true),
      rapidPress: summarizeMetric(raw.rapidPress, precisionFactor, true),
      rapidRelease: summarizeMetric(raw.rapidRelease, precisionFactor, true),
      topDeadzone: summarizeMetric(raw.topDeadzone, precisionFactor, false),
      bottomDeadzone: summarizeMetric(raw.bottomDeadzone, precisionFactor, false),
    };

    return {
      retrievedAt: new Date().toISOString(),
      firmwareVersion,
      precisionFactor,
      keyCount,
      pollingRateHz,
      rapidTriggerKeys: raw.modes.filter((mode) => (mode & 0x80) !== 0).length,
      values: {
        actuationMm: metrics.actuation.representativeMm,
        releaseMm: metrics.release.representativeMm,
        rapidPressMm: metrics.rapidPress.representativeMm,
        rapidReleaseMm: metrics.rapidRelease.representativeMm,
        topDeadzoneMm: metrics.topDeadzone.representativeMm,
        bottomDeadzoneMm: metrics.bottomDeadzone.representativeMm,
      },
      metrics,
      raw,
    };
  }

  async factoryReset(): Promise<void> {
    if (!this.handle || !this.summary.supported) throw new Error("No supported FUN60 is connected.");
    try {
      this.handle.sendFeatureReport(Array.from(buildCommand(COMMAND.factoryReset)));
      await sleep(2000);
    } catch (error) {
      throw new Error("Factory reset failed. Reconnect the keyboard and try again.", { cause: error });
    } finally {
      this.close();
    }
  }

  private async query(command: number, data: ArrayLike<number> = [], raw = false): Promise<number[]> {
    if (!this.handle) throw new Error("The keyboard connection is not open.");
    let lastResponse: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      this.handle.sendFeatureReport(Array.from(buildCommand(command, data)));
      await sleep(12);
      const response = this.handle.getFeatureReport(0, 65);
      lastResponse = response[0] === 0 ? response.slice(1) : response.slice(0, 64);
      if (raw || lastResponse[0] === command) return lastResponse;
    }
    throw new Error(`Keyboard query 0x${command.toString(16)} returned an unexpected response (${lastResponse.slice(0, 8).join(", ")}).`);
  }

  private async getFirmwareInfo(): Promise<{ firmwareVersion: number; precisionFactor: 10 | 100 | 200 }> {
    const versionResponse = await this.query(COMMAND.getUsbVersion);
    if (versionResponse[0] !== COMMAND.getUsbVersion || versionResponse.length < 9) {
      throw new Error("The keyboard returned an invalid firmware-version response.");
    }
    const firmwareVersion = versionResponse[7] | (versionResponse[8] << 8);
    return { firmwareVersion, precisionFactor: precisionFactorFromFirmware(firmwareVersion) };
  }

  close(): void {
    try {
      this.handle?.close();
    } catch {
      // The OS may already have invalidated the handle after unplugging.
    }
    this.handle = null;
    this.summary = { connected: false, supported: false };
  }
}

export function summarizeMetric(values: number[], precisionFactor: number, preferPositive: boolean): RetrievedMetric {
  const readable = preferPositive ? values.filter((value) => value > 0) : values.filter((value) => value >= 0);
  if (readable.length === 0) return { representativeMm: 0, minMm: 0, maxMm: 0, matchingKeys: 0, readableKeys: 0 };
  const frequencies = new Map<number, number>();
  for (const value of readable) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const [representativeRaw, matchingKeys] = [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const toMm = (value: number) => Number((value / precisionFactor).toFixed(3));
  return {
    representativeMm: toMm(representativeRaw),
    minMm: toMm(Math.min(...readable)),
    maxMm: toMm(Math.max(...readable)),
    matchingKeys,
    readableKeys: readable.length,
  };
}
