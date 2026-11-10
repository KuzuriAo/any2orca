// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** The filament the U1 takes, in mm. */
export const U1_FILAMENT_DIAMETER = "1.75";

/** A filament diameter that isn't the U1's, as a number (2.85 for "2.85"), or null for 1.75 or nothing readable. */
export function offSizeDiameter(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && Math.abs(n - Number(U1_FILAMENT_DIAMETER)) > 1e-6 ? n : null;
}

/**
 * Sets every slot's `filament_diameter` to the U1's 1.75 mm, with a note for each filament the creator's file had
 * at another size, except the slots in `announced`, which the pipeline has already explained (it set them to a U1
 * preset for their material). Bambu's H3C has a 2.85 mm PrintTool for soft TPU, and its project keeps 2.85 for that
 * filament; left in the file, Snapmaker Orca would compute the extrusion for filament nearly three times thicker and
 * the U1 would badly under-extrude it.
 */
export function setFilamentDiameter(settings: JsonRecord, slotCount: number, warnings: string[], announced: ReadonlySet<number> = new Set()): void {
  if (slotCount < 1) return;
  const raw = settings.filament_diameter;
  const current = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const changed: string[] = [];
  for (let i = 0; i < Math.min(slotCount, current.length); i += 1) {
    const n = offSizeDiameter(current[i]);
    if (n !== null && !announced.has(i)) changed.push(`filament ${i + 1} (${n} mm)`);
  }
  settings.filament_diameter = Array.from({ length: slotCount }, () => U1_FILAMENT_DIAMETER);
  if (changed.length > 0) {
    warnings.push(`  WARN: the U1 takes ${U1_FILAMENT_DIAMETER} mm filament, so ${changed.join(", ")} ${changed.length === 1 ? "is" : "are"} set to ${U1_FILAMENT_DIAMETER} mm; load ${U1_FILAMENT_DIAMETER} mm filament of the same material.`);
  }
}
