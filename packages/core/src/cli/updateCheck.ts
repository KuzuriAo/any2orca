// SPDX-License-Identifier: MIT
/**
 * The CLI's update notice. At most once a day it asks the npm registry for
 * the latest any2orca version (sending only the package name), caches the
 * answer, and the next run prints the update command if there's a newer
 * one. It never blocks a conversion for long, never runs in CI or when
 * output isn't a terminal, and is off with NO_UPDATE_NOTIFIER=1,
 * --no-update-notifier, or `any2orca telemetry update-check off`.
 *
 * The npm registry is the only host this contacts.
 */
import { VERSION } from "../version.js";
import { readCliConfig, updateCliConfig, type Env } from "./config.js";

export const REGISTRY_LATEST_URL = "https://registry.npmjs.org/any2orca/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

export interface UpdateCheckContext {
  env: Env;
  isTTY: boolean;
  flagDisabled: boolean;
}

export function updateCheckDisabledReason(ctx: UpdateCheckContext): string | null {
  if (ctx.flagDisabled) return "--no-update-notifier";
  if (ctx.env.NO_UPDATE_NOTIFIER) return "NO_UPDATE_NOTIFIER is set";
  if (ctx.env.CI) return "running in CI";
  if (readCliConfig(ctx.env).updateCheck?.enabled === false) return "turned off";
  if (!ctx.isTTY) return "output isn't a terminal";
  return null;
}

/** Compares dotted numeric versions; prerelease suffixes are ignored, so a prerelease never triggers a notice. */
export function isNewer(candidate: string, current: string): boolean {
  if (/-/.test(candidate)) return false;
  const a = candidate.split(".").map((n) => Number.parseInt(n, 10));
  const b = current.split("-")[0].split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

/** The notice to print for a cached newer version, or null. */
export function updateNotice(env: Env): string | null {
  const cached = readCliConfig(env).updateCheck;
  if (!cached?.latest || !isNewer(cached.latest, VERSION)) return null;
  const why = cached.outputAffecting ? `\n  Why: ${cached.outputAffecting} Re-convert affected files after updating.` : "";
  return `any2orca ${cached.latest} is available (you have ${VERSION}). Update: npm install -g any2orca@latest${why}`;
}

/** Refreshes the cache if it's more than a day old. Resolves quickly and never throws. */
export async function refreshUpdateCache(env: Env, doFetch: typeof fetch = fetch): Promise<void> {
  try {
    const last = readCliConfig(env).updateCheck?.lastCheckedAt ?? 0;
    if (Date.now() - last < CHECK_INTERVAL_MS) return;
    // Record the attempt first, so an offline machine doesn't retry on every run.
    updateCliConfig((c) => ({ ...c, updateCheck: { ...c.updateCheck, lastCheckedAt: Date.now() } }), env);
    const response = await doFetch(REGISTRY_LATEST_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return;
    const text = await response.text();
    if (text.length > 256 * 1024) return;
    const body = JSON.parse(text) as { version?: unknown; outputAffecting?: unknown };
    if (typeof body.version !== "string" || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(body.version)) return;
    const outputAffecting = typeof body.outputAffecting === "string" ? body.outputAffecting.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300) : undefined;
    // outputAffecting is always overwritten, so a reason from an older release never sticks to a newer one.
    updateCliConfig((c) => ({ ...c, updateCheck: { ...c.updateCheck, latest: body.version as string, outputAffecting } }), env);
  } catch {
    // Offline, blocked, or a bad answer: try again tomorrow.
  }
}
