// SPDX-License-Identifier: MIT
// Counts stored events. Shared by summarize.mjs (the command line) and the
// collector's GET /summary.
//
// Every line is checked against the event schema again; anything that doesn't
// parse is counted as skipped and otherwise ignored.
import { StatsEventSchema } from "any2orca";

export const SUMMARY_FIELDS = ["day", "core", "profileId", "sourceVendor", "matchSource", "ref"];

/** @param {string} text The JSON Lines file's contents. */
export function summarize(text) {
  const counts = Object.fromEntries(SUMMARY_FIELDS.map((field) => [field, new Map()]));
  let events = 0;
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      const parsed = StatsEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error("invalid");
      event = parsed.data;
    } catch {
      skipped += 1;
      continue;
    }
    events += 1;
    for (const field of SUMMARY_FIELDS) {
      const key = event[field] ?? "(none)";
      counts[field].set(key, (counts[field].get(key) ?? 0) + 1);
    }
  }
  const sorted = (map) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return { events, skipped, ...Object.fromEntries(SUMMARY_FIELDS.map((f) => [f, Object.fromEntries(sorted(counts[f]))])) };
}
