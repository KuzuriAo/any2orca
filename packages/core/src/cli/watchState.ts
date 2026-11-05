// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ConvertOutcome = "succeeded" | "failed-once" | "permanently-failed";

export interface StateRecord {
  fingerprint: string;
  outcome: ConvertOutcome;
}

export type StateFile = Record<string, StateRecord>;

/**
 * `size:mtimeMs` -- identifies a specific version of a file's content, not
 * just its name. Deliberately more than just size: two versions of a file
 * can be exactly the same number of bytes (e.g. a plate renamed "Core
 * pieces" -> "Core Pieces") while genuinely differing in content, and
 * mtime is what catches that. Cheap to compute -- one stat() call, already
 * needed elsewhere for the same file.
 */
export function computeFingerprint(path: string): string {
  const stat = statSync(path);
  return `${stat.size}:${stat.mtimeMs}`;
}

function stateFilePath(dir: string): string {
  return join(dir, ".any2orca-state.json");
}

/** Missing or corrupt state file both resolve to "nothing recorded yet" -- a long-running watch session shouldn't crash over a hand-edited or truncated bookkeeping file. */
export function loadStateFile(dir: string): StateFile {
  const path = stateFilePath(dir);
  if (!existsSync(path)) return {};
  try {
    return checkedState(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return {};
  }
}

const OUTCOMES: ReadonlySet<string> = new Set<ConvertOutcome>(["succeeded", "failed-once", "permanently-failed"]);

/**
 * The records of a parsed state file that have the expected shape; anything
 * else counts as not recorded. The file sits in the output folder, which may
 * be shared, and a file holding `null` or a list once stopped the run.
 */
function checkedState(value: unknown): StateFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  // No prototype, so a file named "__proto__" or "constructor" is an ordinary key.
  const state: StateFile = Object.create(null) as StateFile;
  for (const [name, record] of Object.entries(value)) {
    if (typeof record !== "object" || record === null) continue;
    const { fingerprint, outcome } = record as Record<string, unknown>;
    if (typeof fingerprint === "string" && typeof outcome === "string" && OUTCOMES.has(outcome)) {
      state[name] = { fingerprint, outcome: outcome as ConvertOutcome };
    }
  }
  return state;
}

export function saveStateFile(dir: string, state: StateFile): void {
  writeFileSync(stateFilePath(dir), JSON.stringify(state, null, 2));
}
