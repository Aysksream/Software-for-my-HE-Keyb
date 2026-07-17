import { buildCommand, COMMAND, FUN60_VENDOR_ID, isSupportedFun60, precisionFactorFromFirmware, profileToReports } from "./protocol";
import type { AutomationSettings, BridgeStatus, DeviceSummary, KeyboardProfile, ProfileId, RetrieveSettingsResponse } from "./types";

const API_BASE = import.meta.env.VITE_BRIDGE_URL ?? "";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const bridgeApi = {
  status: () => jsonRequest<BridgeStatus>("/api/status"),
  apply: (id: ProfileId) => jsonRequest<BridgeStatus>(`/api/apply/${id}`, { method: "POST" }),
  saveProfile: (profile: KeyboardProfile) =>
    jsonRequest<BridgeStatus>(`/api/profiles/${profile.id}`, { method: "PUT", body: JSON.stringify(profile) }),
  saveAutomation: (automation: AutomationSettings) =>
    jsonRequest<BridgeStatus>("/api/automation", { method: "PUT", body: JSON.stringify(automation) }),
  scan: () => jsonRequest<BridgeStatus>("/api/scan", { method: "POST" }),
  retrieve: () => jsonRequest<RetrieveSettingsResponse>("/api/retrieve", { method: "POST" }),
  factoryReset: () => jsonRequest<BridgeStatus>("/api/factory-reset", { method: "POST", body: JSON.stringify({ confirmation: "RESET" }) }),
};

interface WebHidDevice {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName?: string;
  open(): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
}

interface HidNavigator {
  requestDevice(options: { filters: Array<{ vendorId: number }> }): Promise<WebHidDevice[]>;
}

let webHidDevice: WebHidDevice | null = null;

export async function connectWebHid(): Promise<DeviceSummary> {
  const hid = (navigator as Navigator & { hid?: HidNavigator }).hid;
  if (!hid) throw new Error("WebHID is not available. Use Chrome or Edge, or start the local bridge.");
  const [device] = await hid.requestDevice({ filters: [{ vendorId: FUN60_VENDOR_ID }] });
  if (!device) throw new Error("No keyboard selected.");
  if (!isSupportedFun60(device.vendorId, device.productId)) {
    throw new Error(`This device (${device.vendorId.toString(16)}:${device.productId.toString(16)}) is not in the tested FUN60 list.`);
  }
  if (!device.opened) await device.open();
  webHidDevice = device;
  return {
    connected: true,
    supported: true,
    vendorId: device.vendorId,
    productId: device.productId,
    product: device.productName ?? "MonsGeek FUN60",
    transport: "webhid",
  };
}

export async function applyWithWebHid(profile: KeyboardProfile): Promise<void> {
  if (!webHidDevice?.opened) throw new Error("Connect the keyboard first.");
  const versionResponse = await queryWebHid(COMMAND.getUsbVersion);
  if (versionResponse[0] !== COMMAND.getUsbVersion || versionResponse.length < 9) throw new Error("Could not determine keyboard firmware precision.");
  const firmwareVersion = versionResponse[7] | (versionResponse[8] << 8);
  const precisionFactor = precisionFactorFromFirmware(firmwareVersion);
  for (const report of profileToReports({ ...profile, precisionFactor })) {
    await webHidDevice.sendFeatureReport(0, report.slice(1));
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
}

async function queryWebHid(command: number): Promise<number[]> {
  if (!webHidDevice?.opened) throw new Error("Connect the keyboard first.");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const report = buildCommand(command);
    await webHidDevice.sendFeatureReport(0, report.slice(1));
    await new Promise((resolve) => setTimeout(resolve, 12));
    const view = await webHidDevice.receiveFeatureReport(0);
    const bytes = Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    const response = bytes[0] === 0 ? bytes.slice(1) : bytes;
    if (response[0] === command) return response;
  }
  throw new Error(`Keyboard query 0x${command.toString(16)} returned an unexpected response.`);
}
