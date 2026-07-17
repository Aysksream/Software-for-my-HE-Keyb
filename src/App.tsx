import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Cpu,
  Download,
  Gamepad2,
  Gauge,
  Keyboard,
  Laptop,
  PlugZap,
  Power,
  Radar,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { applyWithWebHid, bridgeApi, connectWebHid } from "./lib/api";
import {
  DEFAULT_AUTOMATION,
  DEFAULT_PROFILES,
  type BridgeStatus,
  type KeyboardSettingsSnapshot,
  type KeyboardProfile,
  type ProfileId,
} from "./lib/types";

type View = "dashboard" | "profiles" | "automation";

const fallbackStatus: BridgeStatus = {
  bridgeConnected: false,
  version: "0.2.0",
  device: { connected: false, supported: false },
  activeProfile: "office",
  activeProcess: null,
  lastAppliedAt: null,
  lastError: null,
  automation: DEFAULT_AUTOMATION,
  profiles: DEFAULT_PROFILES,
};

const keys = [
  ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
  ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
  ["Ctrl", "Win", "Alt", "Space", "Alt", "Fn", "Menu", "Ctrl"],
];

const gameKeys = new Set(["W", "A", "S", "D", "Shift", "Ctrl", "Space"]);

function formatUsb(value?: number) {
  return value === undefined ? "----" : value.toString(16).toUpperCase().padStart(4, "0");
}

function SliderField({
  label,
  hint,
  value,
  min = 0.1,
  max = 4,
  step = 0.05,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-field">
      <div className="field-heading">
        <div>
          <span>{label}</span>
          <small>{hint}</small>
        </div>
        <output>{value.toFixed(value < 1 ? 2 : 1)} mm</output>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-progress": `${percentage}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function KeyboardMap({ gameMode }: { gameMode: boolean }) {
  return (
    <div className="keyboard-shell">
      <div className="keyboard-topline">
        <span>FUN60 / ANSI 61</span>
        <span>ALL KEYS</span>
      </div>
      <div className="keyboard-rows">
        {keys.map((row, rowIndex) => (
          <div className="keyboard-row" key={rowIndex}>
            {row.map((key, index) => {
              const wide = ["Backspace", "Tab", "Caps", "Enter", "Shift", "Space"].includes(key);
              return (
                <button
                  type="button"
                  className={`${wide ? "wide-key" : ""} ${gameMode && gameKeys.has(key) ? "hot-key" : ""}`}
                  key={`${key}-${index}`}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [status, setStatus] = useState<BridgeStatus>(fallbackStatus);
  const [selectedId, setSelectedId] = useState<ProfileId>("game");
  const [drafts, setDrafts] = useState(fallbackStatus.profiles);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [webHid, setWebHid] = useState(false);
  const [snapshot, setSnapshot] = useState<KeyboardSettingsSnapshot | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const draftsInitialized = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await bridgeApi.status();
        if (!active) return;
        setStatus(next);
        if (!draftsInitialized.current) {
          setDrafts(next.profiles);
          draftsInitialized.current = true;
        }
      } catch {
        if (active) setStatus((current) => ({ ...current, bridgeConnected: false }));
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selected = drafts[selectedId];
  const connected = status.device.connected || webHid;
  const profile = status.profiles[status.activeProfile];
  const connectionLabel = status.bridgeConnected ? "Local bridge" : webHid ? "WebHID" : "Not connected";

  const deviceName = useMemo(() => status.device.product ?? (connected ? "MonsGeek FUN60" : "Keyboard offline"), [connected, status.device.product]);

  const updateDraft = <K extends keyof KeyboardProfile>(key: K, value: KeyboardProfile[K]) => {
    setDrafts((current) => ({ ...current, [selectedId]: { ...current[selectedId], [key]: value } }));
  };

  const connect = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (status.bridgeConnected) {
        setStatus(await bridgeApi.scan());
        setNotice("Device scan complete.");
      } else {
        const device = await connectWebHid();
        setWebHid(device.connected);
        setStatus((current) => ({ ...current, device }));
        setNotice("FUN60 connected through WebHID.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not connect to the keyboard.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async (id: ProfileId = selectedId) => {
    setBusy(true);
    setNotice(null);
    try {
      if (status.bridgeConnected) {
        await bridgeApi.saveProfile(drafts[id]);
        const next = await bridgeApi.apply(id);
        setStatus(next);
      } else {
        await applyWithWebHid(drafts[id]);
        setStatus((current) => ({ ...current, activeProfile: id, lastAppliedAt: new Date().toISOString() }));
      }
      setNotice(`${drafts[id].name} profile applied.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not apply this profile.");
    } finally {
      setBusy(false);
    }
  };

  const saveAutomation = async () => {
    if (!status.bridgeConnected) {
      setNotice("Automatic switching needs the local bridge running in the background.");
      return;
    }
    setBusy(true);
    try {
      setStatus(await bridgeApi.saveAutomation(status.automation));
      setNotice("Automation rules saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save automation.");
    } finally {
      setBusy(false);
    }
  };

  const loadSnapshot = (next: KeyboardSettingsSnapshot) => {
    setSnapshot(next);
    setDrafts((current) => {
      const existing = current[selectedId];
      // The editor writes one all-key value. A mixed device state is therefore
      // represented as off until the user explicitly chooses to enable all keys.
      const rapidTrigger = next.rapidTriggerKeys === next.keyCount;
      return {
        ...current,
        [selectedId]: {
          ...existing,
          ...next.values,
          rapidTrigger,
          pollingRateHz: next.pollingRateHz,
          precisionFactor: next.precisionFactor,
        },
      };
    });
  };

  const retrieveSettings = async () => {
    if (!status.bridgeConnected) {
      setNotice("Retrieval needs the local bridge so it can read HID feature reports.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await bridgeApi.retrieve();
      setStatus(response.status);
      loadSnapshot(response.snapshot);
      setNotice(`Read ${response.snapshot.keyCount} keys using firmware precision factor ${response.snapshot.precisionFactor}. Representative values were loaded into ${selected.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not retrieve keyboard settings.");
    } finally {
      setBusy(false);
    }
  };

  const factoryReset = async () => {
    if (resetText !== "RESET") return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await bridgeApi.factoryReset();
      setStatus(next);
      setSnapshot(null);
      setShowReset(false);
      setResetText("");
      if (next.device.connected) {
        const retrieved = await bridgeApi.retrieve();
        setStatus(retrieved.status);
        loadSnapshot(retrieved.snapshot);
        setNotice("Factory defaults restored and read back from the keyboard.");
      } else {
        setNotice("Factory reset sent. Reconnect the keyboard, then retrieve its settings.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Factory reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setView("dashboard")}>
          <span className="brand-mark"><Zap size={16} fill="currentColor" /></span>
          <span>FUN//CTRL</span>
        </button>

        <nav>
          <span className="nav-label">Workspace</span>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Activity size={18} />Overview</button>
          <button className={view === "profiles" ? "active" : ""} onClick={() => setView("profiles")}><Settings2 size={18} />Profiles</button>
          <button className={view === "automation" ? "active" : ""} onClick={() => setView("automation")}><Radar size={18} />Automation</button>
        </nav>

        <div className="sidebar-device">
          <div className={`device-orb ${connected ? "online" : ""}`}><Keyboard size={22} /></div>
          <div>
            <span>{deviceName}</span>
            <small><i />{connected ? "Connected" : "Disconnected"}</small>
          </div>
          <ChevronRight size={16} />
        </div>

        <div className="sidebar-foot">
          <div><ShieldCheck size={15} />Local-first</div>
          <span>v0.2.0 · GPL-3.0</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{view === "dashboard" ? "CONTROL ROOM" : view.toUpperCase()}</span>
            <h1>{view === "dashboard" ? "Good evening." : view === "profiles" ? "Tune your profiles." : "Switch at the right moment."}</h1>
          </div>
          <div className="top-actions">
            <div className={`connection-pill ${connected ? "online" : ""}`}><i />{connectionLabel}</div>
            <button className="ghost-button" type="button" onClick={connect} disabled={busy}><PlugZap size={17} />{connected ? "Rescan" : "Connect"}</button>
          </div>
        </header>

        {notice && <div className="notice"><Sparkles size={16} /><span>{notice}</span><button onClick={() => setNotice(null)}>×</button></div>}

        {view === "dashboard" && (
          <div className="dashboard-grid">
            <section className="hero-card">
              <div className="hero-copy">
                <div className="profile-icon" style={{ color: profile.accent }}>
                  {status.activeProfile === "game" ? <Gamepad2 size={28} /> : <BriefcaseBusiness size={28} />}
                </div>
                <div>
                  <span className="card-kicker">ACTIVE PROFILE</span>
                  <h2>{profile.name}</h2>
                  <p>{status.activeProcess ? `Triggered by ${status.activeProcess}` : profile.description}</p>
                </div>
              </div>
              <div className="hero-stats">
                <div><span>Actuation</span><strong>{profile.actuationMm.toFixed(2)}<small> mm</small></strong></div>
                <div><span>Rapid trigger</span><strong>{profile.rapidTrigger ? "On" : "Off"}</strong></div>
                <div><span>Polling</span><strong>{profile.pollingRateHz >= 1000 ? `${profile.pollingRateHz / 1000}K` : profile.pollingRateHz}<small> Hz</small></strong></div>
              </div>
              <button className="edit-link" onClick={() => { setSelectedId(status.activeProfile); setView("profiles"); }}>Edit active profile <ArrowRight size={16} /></button>
            </section>

            <section className="mode-card">
              <div className="section-heading"><div><span className="card-kicker">QUICK SWITCH</span><h3>Choose a feel</h3></div><Power size={18} /></div>
              <div className="mode-options">
                {(["office", "game"] as ProfileId[]).map((id) => (
                  <button key={id} className={status.activeProfile === id ? "selected" : ""} onClick={() => void apply(id)} disabled={busy || !connected}>
                    <span className="mode-icon">{id === "office" ? <Laptop size={19} /> : <Gamepad2 size={19} />}</span>
                    <span><strong>{drafts[id].name}</strong><small>{id === "office" ? "Calm & deliberate" : "Fast & responsive"}</small></span>
                    {status.activeProfile === id ? <Check size={17} /> : <ChevronRight size={17} />}
                  </button>
                ))}
              </div>
            </section>

            <section className="keyboard-card">
              <div className="section-heading">
                <div><span className="card-kicker">KEYBOARD MAP</span><h3>{deviceName}</h3></div>
                <div className="usb-id">{formatUsb(status.device.vendorId)}:{formatUsb(status.device.productId)}</div>
              </div>
              <KeyboardMap gameMode={status.activeProfile === "game"} />
              <div className="keyboard-legend"><span><i className="legend-hot" />Game-priority keys</span><span><i />Standard keys</span><small>Profile currently applies to all 61 keys</small></div>
            </section>

            <section className="automation-card">
              <div className="section-heading"><div><span className="card-kicker">AUTOMATION</span><h3>Game sensing</h3></div><button className={`toggle ${status.automation.enabled ? "on" : ""}`} onClick={() => setStatus((current) => ({ ...current, automation: { ...current.automation, enabled: !current.automation.enabled } }))}><span /></button></div>
              <div className="automation-visual"><div className="radar-ring"><Radar size={25} /><i /></div><div><strong>{status.activeProcess ?? "Watching quietly"}</strong><span>{status.activeProcess ? "Game detected · Game profile active" : `${status.automation.gameProcesses.length} game rules armed`}</span></div></div>
              <button className="edit-link" onClick={() => setView("automation")}>Manage detection rules <ArrowRight size={16} /></button>
            </section>
          </div>
        )}

        {view === "profiles" && (
          <div className="profiles-layout">
            <aside className="profile-list card">
              <span className="card-kicker">YOUR PROFILES</span>
              {(["office", "game"] as ProfileId[]).map((id) => (
                <button key={id} className={selectedId === id ? "selected" : ""} onClick={() => setSelectedId(id)}>
                  <span className="profile-dot" style={{ background: drafts[id].accent }} />
                  <span><strong>{drafts[id].name}</strong><small>{id === "office" ? "Default desktop" : "Game detected"}</small></span>
                  <ChevronRight size={17} />
                </button>
              ))}
              <div className="profile-note"><Cpu size={18} /><p>Values are converted to your keyboard's native RY5088 feature reports.</p></div>
            </aside>

            <section className="tuning-card card">
              <div className="section-heading"><div><span className="card-kicker">{selectedId.toUpperCase()} PROFILE</span><h2>{selected.name}</h2><p>{selected.description}</p></div><div className="profile-icon" style={{ color: selected.accent }}>{selectedId === "game" ? <Gamepad2 /> : <BriefcaseBusiness />}</div></div>
              <div className="tuning-columns">
                <div>
                  <h4>Trigger points</h4>
                  <SliderField label="Actuation point" hint="How far a key travels before it fires" value={selected.actuationMm} onChange={(value) => updateDraft("actuationMm", value)} />
                  <SliderField label="Release point" hint="How far it returns before reset" value={selected.releaseMm} onChange={(value) => updateDraft("releaseMm", value)} />
                  <SliderField label="Top deadzone" hint="Ignore sensor noise near the top" value={selected.topDeadzoneMm} max={1} onChange={(value) => updateDraft("topDeadzoneMm", value)} />
                </div>
                <div>
                  <div className="inline-title"><h4>Rapid Trigger</h4><button className={`toggle ${selected.rapidTrigger ? "on" : ""}`} onClick={() => updateDraft("rapidTrigger", !selected.rapidTrigger)}><span /></button></div>
                  <SliderField label="Press sensitivity" hint="Downward movement needed to re-trigger" value={selected.rapidPressMm} max={1} onChange={(value) => updateDraft("rapidPressMm", value)} />
                  <SliderField label="Release sensitivity" hint="Upward movement needed to reset" value={selected.rapidReleaseMm} max={1} onChange={(value) => updateDraft("rapidReleaseMm", value)} />
                  <SliderField label="Bottom deadzone" hint="Ignore sensor noise at full press" value={selected.bottomDeadzoneMm} max={1} onChange={(value) => updateDraft("bottomDeadzoneMm", value)} />
                </div>
              </div>
              <div className="polling-row"><div><Gauge size={20} /><span><strong>Polling rate</strong><small>Higher rates reduce input latency and use more CPU</small></span></div><select value={selected.pollingRateHz} onChange={(event) => updateDraft("pollingRateHz", Number(event.target.value) as KeyboardProfile["pollingRateHz"])}>{[125, 250, 500, 1000, 2000, 4000, 8000].map((rate) => <option value={rate} key={rate}>{rate >= 1000 ? `${rate / 1000},000` : rate} Hz</option>)}</select></div>
              <div className="sync-panel">
                <div className="sync-heading">
                  <div><Download size={18} /><span><strong>Keyboard readback</strong><small>Replace the sliders with values currently stored on the device</small></span></div>
                  <button className="secondary-button" disabled={!status.bridgeConnected || !connected || busy} onClick={() => void retrieveSettings()}>{busy ? <RefreshCw className="spin" size={16} /> : <Download size={16} />}Retrieve settings</button>
                </div>
                {snapshot && (
                  <div className="snapshot-grid">
                    {([
                      ["Press", snapshot.metrics.actuation],
                      ["Release", snapshot.metrics.release],
                      ["RT press", snapshot.metrics.rapidPress],
                      ["RT release", snapshot.metrics.rapidRelease],
                    ] as const).map(([label, metric]) => (
                      <div key={label}><span>{label}</span><strong>{metric.representativeMm.toFixed(2)} mm</strong><small>{metric.matchingKeys === metric.readableKeys ? `${metric.readableKeys} keys match` : `${metric.minMm.toFixed(2)}–${metric.maxMm.toFixed(2)} mm · ${metric.matchingKeys}/${metric.readableKeys} match`}</small></div>
                    ))}
                    <div><span>Rapid Trigger</span><strong>{snapshot.rapidTriggerKeys}/{snapshot.keyCount} keys</strong><small>{snapshot.rapidTriggerKeys === 0 ? "Disabled" : snapshot.rapidTriggerKeys === snapshot.keyCount ? "Enabled on all keys" : "Mixed per-key state"}</small></div>
                    <div><span>Firmware scale</span><strong>×{snapshot.precisionFactor}</strong><small>FW {snapshot.firmwareVersion} · {(1 / snapshot.precisionFactor).toFixed(3)} mm step</small></div>
                  </div>
                )}
              </div>
              <div className="tuning-actions">
                <button className="danger-button" disabled={!status.bridgeConnected || !connected || busy} onClick={() => setShowReset(true)}><RotateCcw size={16} />Factory reset</button>
                <span>{connected ? `Ready to write ${snapshot?.keyCount ?? 61}-key profile` : "Connect a supported FUN60 to apply"}</span>
                <button className="primary-button" disabled={!connected || busy} onClick={() => void apply()}>{busy ? <RefreshCw className="spin" size={17} /> : <Zap size={17} />}Apply to keyboard</button>
              </div>
            </section>
          </div>
        )}

        {view === "automation" && (
          <div className="automation-layout">
            <section className="automation-main card">
              <div className="section-heading"><div><span className="card-kicker">PROCESS DETECTION</span><h2>Automatic profile switching</h2><p>The local bridge checks running apps without uploading your process list.</p></div><button className={`toggle large ${status.automation.enabled ? "on" : ""}`} onClick={() => setStatus((current) => ({ ...current, automation: { ...current.automation, enabled: !current.automation.enabled } }))}><span /></button></div>
              <div className="flow-strip"><div><Radar /><span><strong>Watch apps</strong><small>Runs locally</small></span></div><ChevronRight /><div><Gamepad2 /><span><strong>Match game</strong><small>Exact process name</small></span></div><ChevronRight /><div><Zap /><span><strong>Apply profile</strong><small>Once per change</small></span></div></div>
              <div className="rule-heading"><div><h4>Game processes</h4><p>One process name per line. “.exe” is optional.</p></div><span>{status.automation.gameProcesses.length} rules</span></div>
              <textarea value={status.automation.gameProcesses.join("\n")} onChange={(event) => setStatus((current) => ({ ...current, automation: { ...current.automation, gameProcesses: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) } }))} spellCheck={false} />
              <div className="delay-row"><span><strong>Return-to-office delay</strong><small>Avoids flickering while a game restarts</small></span><select value={status.automation.switchDelayMs} onChange={(event) => setStatus((current) => ({ ...current, automation: { ...current.automation, switchDelayMs: Number(event.target.value) } }))}><option value={1000}>1 second</option><option value={2500}>2.5 seconds</option><option value={5000}>5 seconds</option><option value={10000}>10 seconds</option></select></div>
              <div className="tuning-actions"><span>{status.bridgeConnected ? "Bridge is available for background switching" : "Start npm run dev:bridge for automation"}</span><button className="primary-button" onClick={saveAutomation} disabled={busy || !status.bridgeConnected}>Save rules</button></div>
            </section>
            <aside className="automation-side card"><span className="card-kicker">LIVE STATE</span><div className={`big-status ${status.activeProcess ? "gaming" : ""}`}>{status.activeProcess ? <Gamepad2 /> : <BriefcaseBusiness />}<strong>{status.activeProcess ? "Gaming" : "Desktop"}</strong><span>{status.activeProcess ?? "No matched game running"}</span></div><div className="state-list"><div><span>Profile</span><strong>{status.profiles[status.activeProfile].name}</strong></div><div><span>Last write</span><strong>{status.lastAppliedAt ? new Date(status.lastAppliedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not yet"}</strong></div><div><span>Privacy</span><strong>100% local</strong></div></div></aside>
          </div>
        )}
      </section>
      {showReset && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && setShowReset(false)}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="warning-icon"><AlertTriangle size={23} /></div>
            <span className="card-kicker">DESTRUCTIVE ACTION</span>
            <h2 id="reset-title">Restore factory defaults?</h2>
            <p>This resets profiles, key mappings, magnetic settings, and lighting stored on the keyboard. Your FUN//CTRL profiles remain saved locally.</p>
            <label htmlFor="reset-confirmation">Type <strong>RESET</strong> to continue</label>
            <input id="reset-confirmation" value={resetText} onChange={(event) => setResetText(event.target.value)} autoComplete="off" />
            <div className="modal-actions"><button className="ghost-button" disabled={busy} onClick={() => setShowReset(false)}>Cancel</button><button className="reset-confirm" disabled={resetText !== "RESET" || busy} onClick={() => void factoryReset()}>{busy ? <RefreshCw className="spin" size={16} /> : <RotateCcw size={16} />}Reset keyboard</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
