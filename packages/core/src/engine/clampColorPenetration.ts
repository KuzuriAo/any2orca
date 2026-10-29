// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/**
 * Snapmaker Orca 2.4.1 added `top_color_penetration_layers` and
 * `bottom_color_penetration_layers` (how deep painted color reaches into
 * the shell). When a value is larger than the shell has layers, Snapmaker Orca shows
 * "The paint penetration layers (current: N) exceed the shell layers
 * (current: M)... will be reset automatically" and resets it itself. A
 * creator's own shell setting (say 3 top layers) can be lower than the
 * tier's default penetration, so apply the same reset up front: no dialog,
 * same result. Only a value larger than its shell layer count changes.
 */
export function clampColorPenetration(settings: JsonRecord, notes: string[]): void {
  for (const side of ["top", "bottom"] as const) {
    const penetrationKey = `${side}_color_penetration_layers`;
    const penetration = toWholeNumber(settings[penetrationKey]);
    const shellLayers = toWholeNumber(settings[`${side}_shell_layers`]);
    if (penetration === null || shellLayers === null || penetration <= shellLayers) continue;
    settings[penetrationKey] = String(shellLayers);
    notes.push(`  ${penetrationKey} lowered from ${penetration} to ${shellLayers} to fit the ${side} shell layers, as Snapmaker Orca does when opening it.`);
  }
}

function toWholeNumber(value: unknown): number | null {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string" && typeof single !== "number") return null;
  const parsed = Number(single);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
