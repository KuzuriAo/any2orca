// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** Where one filament's values sit in a per-variant array of an Orca-layout source. */
export interface FilamentVariantPositions {
  /** Index of the filament's standard value. */
  standard: number;
  /** Index of its high-flow value, or null when the filament has none. */
  highFlow: number | null;
}

export interface FilamentVariantLayout {
  /** How many entries a per-variant filament setting has in this source. */
  length: number;
  /** One entry per filament slot, in slot order. */
  slots: FilamentVariantPositions[];
}

/** Most variants Snapmaker Orca stores for one filament (standard and high flow today). */
const MAX_STEP = 4;

/**
 * How a source saved by Snapmaker Orca (or another Orca-family slicer)
 * lays out its per-variant filament settings, or null for any other
 * source.
 *
 * Snapmaker Orca 2.4 stores each per-variant filament setting (see
 * FILAMENT_FLOW_VARIANT_KEYS) as one flat array: each filament's values in
 * turn, `filament_flow_step_size[i]` of them, tagged by the matching
 * entries of `filament_flow_support` ("standard", "high_flow"). Filaments
 * in one file can have different counts (a filament with only a standard
 * value next to one with both), so the array isn't always a clean multiple
 * of the slot count. Bambu Studio sources don't write these keys; they
 * name their variants instead (detectVariantIndex.ts).
 */
export function filamentVariantLayout(source: JsonRecord, slotCount: number): FilamentVariantLayout | null {
  const steps = source.filament_flow_step_size;
  const support = source.filament_flow_support;
  if (!Array.isArray(steps) || !Array.isArray(support) || slotCount < 1 || steps.length !== slotCount) return null;
  const counts = steps.map((s) => Number(s));
  if (!counts.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_STEP)) return null;
  const length = counts.reduce((a, b) => a + b, 0);
  if (support.length !== length || !support.every((s) => typeof s === "string")) return null;

  const slots: FilamentVariantPositions[] = [];
  let offset = 0;
  for (const count of counts) {
    const tags = (support as string[]).slice(offset, offset + count);
    const standard = tags.indexOf("standard");
    const highFlow = tags.indexOf("high_flow");
    slots.push({ standard: offset + (standard >= 0 ? standard : 0), highFlow: highFlow >= 0 ? offset + highFlow : null });
    offset += count;
  }
  return { length, slots };
}
