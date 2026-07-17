import type { KeyboardProfile } from "./types";

export const FUN60_VENDOR_ID = 0x3151;
export const FUN60_PRODUCT_IDS = new Set([0x5029, 0x502d, 0x502e, 0x502f, 0x5030]);
export const REPORT_SIZE = 65;

export const COMMAND = {
  factoryReset: 0x01,
  setPollingRate: 0x03,
  setMultiMagnetism: 0x65,
  getPollingRate: 0x83,
  getUsbVersion: 0x8f,
  getMultiMagnetism: 0xe5,
  getFeatureList: 0xe6,
} as const;

export const MAGNETISM = {
  pressTravel: 0x00,
  liftTravel: 0x01,
  rapidPress: 0x02,
  rapidLift: 0x03,
  bottomDeadzone: 0x06,
  keyMode: 0x07,
  topDeadzone: 0xfb,
} as const;

const POLLING_VALUE: Record<KeyboardProfile["pollingRateHz"], number> = {
  8000: 0,
  4000: 1,
  2000: 2,
  1000: 3,
  500: 4,
  250: 5,
  125: 6,
};

const POLLING_HZ = [8000, 4000, 2000, 1000, 500, 250, 125] as const;

export function bit7Checksum(commandAndData: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < 7; index += 1) sum += commandAndData[index] ?? 0;
  return 255 - (sum & 0xff);
}

export function buildCommand(command: number, data: ArrayLike<number> = []): Uint8Array {
  const report = new Uint8Array(REPORT_SIZE);
  report[0] = 0;
  report[1] = command;
  const payload = Array.from(data).slice(0, REPORT_SIZE - 2);
  report.set(payload, 2);
  report[8] = bit7Checksum(report.slice(1));
  return report;
}

function mmToRaw(mm: number, precisionFactor: number): number {
  return Math.max(1, Math.min(0xffff, Math.round(mm * precisionFactor)));
}

function u16Bytes(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function bulkMagnetism(subCommand: number, rawValue: number, keyCount: number): Uint8Array[] {
  const bytes = Array.from({ length: keyCount }, () => u16Bytes(rawValue)).flat();
  const pages: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += 56) {
    const page = Math.floor(offset / 56);
    const last = offset + 56 >= bytes.length;
    const header = [subCommand, 1, page, last ? 1 : 0, 0, 0, 0];
    pages.push(buildCommand(COMMAND.setMultiMagnetism, [...header, ...bytes.slice(offset, offset + 56)]));
  }
  return pages;
}

export function profileToReports(profile: KeyboardProfile, keyCount = 61): Uint8Array[] {
  const factor = profile.precisionFactor;
  const reports: Uint8Array[] = [
    buildCommand(COMMAND.setPollingRate, [POLLING_VALUE[profile.pollingRateHz]]),
    ...bulkMagnetism(MAGNETISM.pressTravel, mmToRaw(profile.actuationMm, factor), keyCount),
    ...bulkMagnetism(MAGNETISM.liftTravel, mmToRaw(profile.releaseMm, factor), keyCount),
    ...bulkMagnetism(MAGNETISM.rapidPress, mmToRaw(profile.rapidPressMm, factor), keyCount),
    ...bulkMagnetism(MAGNETISM.rapidLift, mmToRaw(profile.rapidReleaseMm, factor), keyCount),
    ...bulkMagnetism(MAGNETISM.topDeadzone, mmToRaw(profile.topDeadzoneMm, factor), keyCount),
    ...bulkMagnetism(MAGNETISM.bottomDeadzone, mmToRaw(profile.bottomDeadzoneMm, factor), keyCount),
  ];

  // Use the protocol's per-key simple form for mode bytes. The non-paged legacy
  // form shares byte 7 with the checksum and is unsafe for a full 61-byte table.
  // Only the final packet commits, avoiding repeated flash saves.
  const mode = profile.rapidTrigger ? 0x80 : 0x00;
  for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
    const header = [MAGNETISM.keyMode, 0, keyIndex, keyIndex === keyCount - 1 ? 1 : 0, 0, 0, 0];
    reports.push(buildCommand(COMMAND.setMultiMagnetism, [...header, mode]));
  }
  return reports;
}

export function isSupportedFun60(vendorId: number, productId: number): boolean {
  return vendorId === FUN60_VENDOR_ID && FUN60_PRODUCT_IDS.has(productId);
}

export function precisionFactorFromFirmware(version: number): 10 | 100 | 200 {
  if (version >= 1280) return 200;
  if (version >= 768) return 100;
  return 10;
}

export function pollingRateFromProtocol(value: number): KeyboardProfile["pollingRateHz"] {
  const rate = POLLING_HZ[value];
  if (!rate) throw new Error(`Unknown polling-rate value 0x${value.toString(16).padStart(2, "0")}.`);
  return rate;
}

export function decodeU16Values(bytes: ArrayLike<number>, count: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 2;
    values.push((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8));
  }
  return values;
}
