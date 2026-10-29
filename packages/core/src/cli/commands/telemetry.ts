// SPDX-License-Identifier: MIT
import { NEVER_SENT, StatsEventSchema } from "../../telemetry.js";
import { readCliConfig, updateCliConfig, type Env } from "../config.js";
import { clearSentLog, readSentLog, resolveStatsStatus } from "../stats.js";
import { REGISTRY_LATEST_URL, updateCheckDisabledReason } from "../updateCheck.js";

/** `any2orca telemetry show`: everything this tool can contact, and why, in one place. */
export function runTelemetryShow(env: Env, isTTY: boolean, out: (line: string) => void): void {
  const stats = resolveStatsStatus(env);
  out(`Usage stats: ${stats.enabled ? "ON" : "off"} (${stats.reason}).`);
  if (stats.endpoint) out(`  Collector: ${stats.endpoint}`);
  out("  When on, one small event is sent after each successful conversion. Its fields:");
  for (const [key, schema] of Object.entries(StatsEventSchema.shape)) {
    out(`    ${key}${schema.isOptional() ? " (optional)" : ""}: ${schema.description ?? ""}`.trimEnd());
  }
  out("  Never sent:");
  for (const item of NEVER_SENT) out(`    - ${item}`);
  out("  Like any web request, sending an event shows the collector your IP address.");
  out('  To see the exact event for a file without sending anything: any2orca convert <file> --dry-run-telemetry');

  const disabled = updateCheckDisabledReason({ env, isTTY, flagDisabled: false });
  out(`\nUpdate check: ${disabled ? `off (${disabled})` : "on"}.`);
  out(`  Saved setting: ${readCliConfig(env).updateCheck?.enabled === false ? "off" : "on"}.`);
  out(`  At most once a day, asks ${REGISTRY_LATEST_URL} for the latest version. Sends the package name only.`);
  out("  Turn off: NO_UPDATE_NOTIFIER=1, --no-update-notifier, or: any2orca telemetry update-check off");

  const sent = readSentLog(env);
  out(`\nStats events sent from this machine (last ${sent.length}, stored only here):`);
  if (sent.length === 0) out("  none");
  for (const entry of sent) out(`  ${entry.sentAt} -> ${entry.endpoint}\n    ${JSON.stringify(entry.event)}`);
}

export function runTelemetrySet(choice: "on" | "off", env: Env, out: (line: string) => void): void {
  updateCliConfig((c) => ({ ...c, stats: { choice, decidedOn: new Date().toISOString().slice(0, 10) } }), env);
  const status = resolveStatsStatus(env);
  out(`Usage stats turned ${choice}.${choice === "on" && !status.enabled ? ` Nothing is sent yet: ${status.reason}.` : ""}`);
}

export function runUpdateCheckSet(enabled: boolean, env: Env, out: (line: string) => void): void {
  updateCliConfig((c) => ({ ...c, updateCheck: { ...c.updateCheck, enabled } }), env);
  out(`Update check turned ${enabled ? "on" : "off"}.`);
}

export function runTelemetryClear(env: Env, out: (line: string) => void): void {
  clearSentLog(env);
  out("Cleared the local log of sent stats.");
}

