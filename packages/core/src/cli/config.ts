// SPDX-License-Identifier: MIT
/**
 * The CLI's own small config folder: the usage-stats choice, the
 * update-check cache, and the local log of stats actually sent. Nothing in
 * it ever leaves the machine.
 *
 * Location: $ANY2ORCA_CONFIG_DIR, else %APPDATA%\any2orca on Windows, else
 * $XDG_CONFIG_HOME/any2orca or ~/.config/any2orca.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  stats?: { choice: "on" | "off"; decidedOn: string };
  updateCheck?: { enabled?: boolean; lastCheckedAt?: number; latest?: string; outputAffecting?: string };
}

export type Env = Record<string, string | undefined>;

export function configDir(env: Env = process.env): string {
  if (env.ANY2ORCA_CONFIG_DIR) return env.ANY2ORCA_CONFIG_DIR;
  if (process.platform === "win32" && env.APPDATA) return join(env.APPDATA, "any2orca");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "any2orca");
}

function configPath(env: Env): string {
  return join(configDir(env), "config.json");
}

const MAX_CONFIG_BYTES = 64 * 1024;

export function readCliConfig(env: Env = process.env): CliConfig {
  const path = configPath(env);
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf-8");
    if (text.length > MAX_CONFIG_BYTES) return {};
    return checkedConfig(JSON.parse(text));
  } catch {
    return {};
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
/** What the update check stores as the latest version (see updateCheck.ts); anything else isn't a version. */
const VERSION_TEXT = /^\d{1,9}\.\d{1,9}\.\d{1,9}(-[0-9A-Za-z.-]{1,64})?$/;

/**
 * The parts of a parsed config file that have the shape this tool writes. A
 * value of the wrong type is dropped rather than used: the file can be
 * hand-edited, or sit in a folder someone else controls, and a bad entry once
 * stopped every command before it did any work.
 */
function checkedConfig(value: unknown): CliConfig {
  if (!isRecord(value)) return {};
  const config: CliConfig = {};
  const { stats, updateCheck } = value;
  if (isRecord(stats) && (stats.choice === "on" || stats.choice === "off") && typeof stats.decidedOn === "string") {
    config.stats = { choice: stats.choice, decidedOn: stats.decidedOn.slice(0, 64) };
  }
  if (isRecord(updateCheck)) {
    const checked: NonNullable<CliConfig["updateCheck"]> = {};
    if (typeof updateCheck.enabled === "boolean") checked.enabled = updateCheck.enabled;
    if (typeof updateCheck.lastCheckedAt === "number" && Number.isFinite(updateCheck.lastCheckedAt)) checked.lastCheckedAt = updateCheck.lastCheckedAt;
    if (typeof updateCheck.latest === "string" && VERSION_TEXT.test(updateCheck.latest)) checked.latest = updateCheck.latest;
    if (typeof updateCheck.outputAffecting === "string") checked.outputAffecting = updateCheck.outputAffecting.slice(0, 300);
    config.updateCheck = checked;
  }
  return config;
}

/** Writes atomically (temp file + rename), so a crash never leaves a half-written config. */
export function writeCliConfig(config: CliConfig, env: Env = process.env): void {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath(env);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

export function updateCliConfig(update: (config: CliConfig) => CliConfig, env: Env = process.env): void {
  writeCliConfig(update(readCliConfig(env)), env);
}
