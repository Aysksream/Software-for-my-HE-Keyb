export type ProfileId = "office" | "game";

export interface KeyboardProfile {
  id: ProfileId;
  name: string;
  description: string;
  actuationMm: number;
  releaseMm: number;
  rapidTrigger: boolean;
  rapidPressMm: number;
  rapidReleaseMm: number;
  topDeadzoneMm: number;
  bottomDeadzoneMm: number;
  pollingRateHz: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;
  precisionFactor: 10 | 100 | 200;
  accent: string;
}

export interface DeviceSummary {
  connected: boolean;
  supported: boolean;
  vendorId?: number;
  productId?: number;
  product?: string;
  transport?: "bridge" | "webhid";
}

export interface AutomationSettings {
  enabled: boolean;
  gameProcesses: string[];
  switchDelayMs: number;
}

export interface BridgeStatus {
  bridgeConnected: boolean;
  version: string;
  device: DeviceSummary;
  activeProfile: ProfileId;
  activeProcess: string | null;
  lastAppliedAt: string | null;
  lastError: string | null;
  automation: AutomationSettings;
  profiles: Record<ProfileId, KeyboardProfile>;
}

export interface RetrievedMetric {
  representativeMm: number;
  minMm: number;
  maxMm: number;
  matchingKeys: number;
  readableKeys: number;
}

export interface KeyboardSettingsSnapshot {
  retrievedAt: string;
  firmwareVersion: number;
  precisionFactor: 10 | 100 | 200;
  keyCount: number;
  pollingRateHz: KeyboardProfile["pollingRateHz"];
  rapidTriggerKeys: number;
  values: Pick<
    KeyboardProfile,
    | "actuationMm"
    | "releaseMm"
    | "rapidPressMm"
    | "rapidReleaseMm"
    | "topDeadzoneMm"
    | "bottomDeadzoneMm"
  >;
  metrics: Record<
    "actuation" | "release" | "rapidPress" | "rapidRelease" | "topDeadzone" | "bottomDeadzone",
    RetrievedMetric
  >;
  raw: {
    actuation: number[];
    release: number[];
    rapidPress: number[];
    rapidRelease: number[];
    topDeadzone: number[];
    bottomDeadzone: number[];
    modes: number[];
  };
}

export interface RetrieveSettingsResponse {
  status: BridgeStatus;
  snapshot: KeyboardSettingsSnapshot;
}

export const DEFAULT_PROFILES: Record<ProfileId, KeyboardProfile> = {
  office: {
    id: "office",
    name: "Daily",
    description: "Comfortable typing with deliberate key travel.",
    actuationMm: 1.8,
    releaseMm: 1.6,
    rapidTrigger: false,
    rapidPressMm: 0.3,
    rapidReleaseMm: 0.3,
    topDeadzoneMm: 0.2,
    bottomDeadzoneMm: 0.2,
    pollingRateHz: 1000,
    precisionFactor: 200,
    accent: "#d8ff43",
  },
  game: {
    id: "game",
    name: "Game",
    description: "Fast actuation and Rapid Trigger for movement keys.",
    actuationMm: 0.4,
    releaseMm: 0.4,
    rapidTrigger: true,
    rapidPressMm: 0.1,
    rapidReleaseMm: 0.1,
    topDeadzoneMm: 0.1,
    bottomDeadzoneMm: 0.1,
    pollingRateHz: 8000,
    precisionFactor: 200,
    accent: "#ff7a45",
  },
};

export const DEFAULT_AUTOMATION: AutomationSettings = {
  enabled: true,
  gameProcesses: ["valorant", "cs2", "fortniteclient-win64-shipping", "overwatch", "r5apex", "league of legends"],
  switchDelayMs: 2500,
};
