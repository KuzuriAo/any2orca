// SPDX-License-Identifier: MIT
import { DEFAULT_NOZZLE, NOZZLE_CHOICES } from "../../engine/detectNozzleDiameter.js";
import { NOZZLE_CHOICE_TEXT, readCliConfig, updateCliConfig, type Env } from "../config.js";

const choices = NOZZLE_CHOICES.join(", ");

/** What `convert` is for when it has no `--nozzle`: the saved size, else the U1's stock 0.4. */
export function savedNozzle(env: Env): string {
  return readCliConfig(env).nozzle ?? DEFAULT_NOZZLE;
}

/** A `--nozzle` value or a size to save, checked: a size in mm such as "0.4", or "match". */
export function parseNozzleChoice(value: string, where: string): string {
  const trimmed = value.trim();
  if (!NOZZLE_CHOICE_TEXT.test(trimmed)) throw new Error(`${where} takes a nozzle size in mm, or "match" for the creator's size: ${choices} (got "${value}")`);
  return trimmed;
}

/** `any2orca nozzle` / `any2orca nozzle show`: the saved size and what it means. */
export function runNozzleShow(env: Env, out: (line: string) => void): void {
  const saved = readCliConfig(env).nozzle;
  if (saved === undefined) out(`Nozzle size: ${DEFAULT_NOZZLE} mm (the U1's stock size; nothing saved).`);
  else if (saved === "match") out("Nozzle size: match (each file is converted for the size the creator used).");
  else out(`Nozzle size: ${saved} mm (saved).`);
  out(`  Every "any2orca convert" without --nozzle is for this size. Save another with: any2orca nozzle <size> (${choices}); forget it with: any2orca nozzle clear.`);
}

export function runNozzleSet(value: string, env: Env, out: (line: string) => void): void {
  const choice = parseNozzleChoice(value, "any2orca nozzle");
  updateCliConfig((c) => ({ ...c, nozzle: choice }), env);
  out(choice === "match" ? "Saved: each file is converted for the nozzle size the creator used." : `Saved: conversions are for ${choice} mm nozzles.`);
}

export function runNozzleClear(env: Env, out: (line: string) => void): void {
  updateCliConfig((c) => {
    const { nozzle: _, ...rest } = c;
    return rest;
  }, env);
  out(`Cleared: conversions are for ${DEFAULT_NOZZLE} mm nozzles, the U1's stock size.`);
}
