// SPDX-License-Identifier: MIT
/**
 * Opt-in usage stats for the CLI. Off unless the user turns it on
 * (`any2orca telemetry on` or ANY2ORCA_TELEMETRY=1), and even then nothing
 * is sent without a collector address. DO_NOT_TRACK=1 and
 * ANY2ORCA_TELEMETRY=0 always win.
 *
 * Each event actually sent is appended to a local log
 * (`any2orca telemetry show` prints it). `--dry-run-telemetry` prints the
 * event instead of sending it. A failed send never affects a conversion.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Inspection } from "../inspect.js";
import type { ConvertReport } from "../project.js";
import { buildStatsEvent, type StatsEvent } from "../telemetry.js";
import { configDir, readCliConfig, type Env } from "./config.js";
import type { Logger } from "./logger.js";

const SEND_TIMEOUT_MS = 3000;
const SENT_LOG_LIMIT = 100;

export type StatsStatus =
  | { enabled: true; endpoint: string; reason: string }
  | { enabled: false; endpoint: string | null; reason: string };

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && /^(1|true|yes|on)$/i.test(value.trim());
}

function isFalsy(value: string | undefined): boolean {
  return value !== undefined && /^(0|false|no|off)$/i.test(value.trim());
}

/** Accepts https URLs, plus http on localhost for testing a collector. */
export function validateEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`ANY2ORCA_STATS_ENDPOINT isn't a valid URL: ${JSON.stringify(raw.slice(0, 200))}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("ANY2ORCA_STATS_ENDPOINT must be an https:// URL (http:// is allowed only for localhost).");
  }
  if (url.username || url.password) throw new Error("ANY2ORCA_STATS_ENDPOINT must not contain credentials.");
  return url.href;
}

export function resolveStatsStatus(env: Env, flagEndpoint?: string): StatsStatus {
  // There's no default collector: with no ANY2ORCA_STATS_ENDPOINT, turning stats on sends nothing.
  // The environment variable is checked only when stats would send, so an unrelated
  // ANY2ORCA_STATS_ENDPOINT doesn't stop a conversion; the --stats-endpoint flag is always checked.
  if (flagEndpoint !== undefined) validateEndpoint(flagEndpoint);
  const rawEndpoint = flagEndpoint ?? env.ANY2ORCA_STATS_ENDPOINT ?? null;
  let endpoint: string | null = null;
  let invalid: unknown = null;
  try {
    endpoint = rawEndpoint ? validateEndpoint(rawEndpoint) : null;
  } catch (err) {
    invalid = err;
  }
  if (isTruthy(env.DO_NOT_TRACK)) return { enabled: false, endpoint, reason: "DO_NOT_TRACK is set" };
  if (isFalsy(env.ANY2ORCA_TELEMETRY)) return { enabled: false, endpoint, reason: "ANY2ORCA_TELEMETRY is off" };
  const choice = readCliConfig(env).stats?.choice;
  const on = isTruthy(env.ANY2ORCA_TELEMETRY) || choice === "on";
  if (!on) return { enabled: false, endpoint, reason: choice === "off" ? "turned off" : "off unless you turn it on" };
  if (invalid) throw invalid;
  if (!endpoint) return { enabled: false, endpoint, reason: "turned on, but there's no collector to send to yet (set ANY2ORCA_STATS_ENDPOINT)" };
  return { enabled: true, endpoint, reason: isTruthy(env.ANY2ORCA_TELEMETRY) ? "ANY2ORCA_TELEMETRY is on" : "turned on" };
}

function sentLogPath(env: Env): string {
  return join(configDir(env), "stats-sent.jsonl");
}

export function readSentLog(env: Env): Array<{ sentAt: string; endpoint: string; event: StatsEvent }> {
  const path = sentLogPath(env);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function clearSentLog(env: Env): void {
  const path = sentLogPath(env);
  if (existsSync(path)) writeFileSync(path, "");
}

function appendSentLog(env: Env, entry: { sentAt: string; endpoint: string; event: StatsEvent }): void {
  mkdirSync(configDir(env), { recursive: true, mode: 0o700 });
  const path = sentLogPath(env);
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  if (lines.length > SENT_LOG_LIMIT) writeFileSync(path, `${lines.slice(-SENT_LOG_LIMIT).join("\n")}\n`);
}

export interface StatsReporter {
  /** Never throws. */
  afterConversion(report: ConvertReport, inspection: Inspection): Promise<void>;
}

export function createStatsReporter(options: { env: Env; logger: Logger; dryRun: boolean; endpoint?: string; fetch?: typeof fetch }): StatsReporter {
  const { env, logger } = options;
  const doFetch = options.fetch ?? fetch;
  return {
    async afterConversion(report, inspection) {
      try {
        const event = buildStatsEvent({
          profileId: report.profile.id,
          ...(report.profileMatch ? { profileMatch: report.profileMatch } : {}),
          plates: report.plates,
          objects: report.objects,
          filamentSlots: report.filamentSlots,
          sourceVendor: inspection.sourceVendor,
        });
        if (options.dryRun) {
          logger.log(`    usage stats event (--dry-run-telemetry, not sent):\n${JSON.stringify(event, null, 2).replace(/^/gm, "      ")}`);
          return;
        }
        const status = resolveStatsStatus(env, options.endpoint);
        if (!status.enabled) return;
        const response = await doFetch(status.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (response.ok) appendSentLog(env, { sentAt: new Date().toISOString(), endpoint: status.endpoint, event });
      } catch {
        // Stats are best effort and never affect a conversion.
      }
    },
  };
}
