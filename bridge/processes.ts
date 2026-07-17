import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function normalizeProcessName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\.exe$/i, "");
}

export function findMatchingGame(runningProcesses: Iterable<string>, configuredGames: Iterable<string>): string | null {
  const running = new Map(Array.from(runningProcesses, (name) => [normalizeProcessName(name), name]));
  for (const configured of configuredGames) {
    const normalized = normalizeProcessName(configured);
    if (normalized && running.has(normalized)) return running.get(normalized) ?? configured;
  }
  return null;
}

export async function listWindowsProcesses(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const script = "Get-Process | Select-Object -ExpandProperty ProcessName";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}
