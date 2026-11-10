// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** The filament the U1 takes, in mm. */
export const U1_FILAMENT_DIAMETER = "1.75";

/**
 * Sets every slot's `filament_diameter` to the U1's 1.75 mm, with a note for each filament the creator's file had
 * at another size. Bambu's H3C has a 2.85 mm PrintTool for soft TPU, and its project keeps 2.85 for that filament;
 * left in the file, Snapmaker Orca would compute the extrusion for filament nearly three times thicker and the
 * U1 would badly under-extrude it. The filament's other settings stay the creator's.
 */
export function setFilamentDiameter(settings: JsonRecord, slotCount: number, warnings: string[]): void {
  if (slotCount < 1) return;
  const raw = settings.filament_diameter;
  const current = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const changed: string[] = [];
  for (let i = 0; i < Math.max(slotCount, current.length); i += 1) {
    const value = current[i];
    const n = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN;
    if (Number.isFinite(n) && Math.abs(n - Number(U1_FILAMENT_DIAMETER)) > 1e-6 && i < slotCount) changed.push(`filament ${i + 1} (${n} mm)`);
  }
  settings.filament_diameter = Array.from({ length: slotCount }, () => U1_FILAMENT_DIAMETER);
  if (changed.length > 0) {
    warnings.push(`  WARN: the U1 takes ${U1_FILAMENT_DIAMETER} mm filament, so ${changed.join(", ")} ${changed.length === 1 ? "is" : "are"} set to ${U1_FILAMENT_DIAMETER} mm; load ${U1_FILAMENT_DIAMETER} mm filament of the same material.`);
  }
}
