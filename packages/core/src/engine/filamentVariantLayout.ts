// SPDX-License-Identifier: MIT
import { activeNozzleVolumeType, variantKey } from "./detectVariantIndex.js";
import type { JsonRecord } from "./types.js";

/** Where one filament's values sit in a per-variant array of the source. */
export interface FilamentVariantPositions {
  /** Index of the value the converted file's standard value comes from: the filament's standard value (for a Bambu Studio source, the variant it was sliced with). */
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

/** Most variants a slicer stores for one filament (standard and high flow today). */
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
 * name their variants instead (bambuFilamentVariantLayout).
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

/** Which entries of a Bambu Studio source's per-variant filament settings belong to each filament. */
export interface BambuFilamentEntries {
  /** How many entries a per-variant filament setting has in this source. */
  length: number;
  /** One list of entry indexes per filament slot, in slot order. */
  entries: number[][];
}

/**
 * Which entries of a Bambu Studio source's per-variant filament settings
 * belong to each filament, or null when the source doesn't say or every
 * filament has one value.
 *
 * Bambu Studio stores a value only for the nozzle variants each filament's
 * preset has (Generic PLA: standard only; Bambu PLA Basic: standard and
 * high flow), and names each entry's filament in `filament_self_index`
 * (from 1) and its variant in `filament_extruder_variant` ("Direct Drive
 * Standard", "Direct Drive High Flow"), so four filaments can have seven
 * values.
 */
export function bambuFilamentEntries(source: JsonRecord, slotCount: number): BambuFilamentEntries | null {
  const owners = source.filament_self_index;
  const variants = source.filament_extruder_variant;
  if (!Array.isArray(owners) || !Array.isArray(variants) || slotCount < 1 || owners.length !== variants.length) return null;
  if (owners.length <= slotCount || owners.length > slotCount * MAX_STEP || !variants.every((v) => typeof v === "string")) return null;

  const entries: number[][] = Array.from({ length: slotCount }, () => []);
  for (const [index, owner] of owners.entries()) {
    const n = typeof owner === "string" || typeof owner === "number" ? Number(owner) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > slotCount) return null;
    entries[n - 1].push(index);
  }
  if (entries.some((own) => own.length === 0 || own.length > MAX_STEP)) return null;
  return { length: owners.length, entries };
}

/**
 * How a Bambu Studio source lays out its per-variant filament settings
 * (bambuFilamentEntries), or null. Each filament reads its entry for the
 * variant the source was sliced with (activeNozzleVolumeType), or its first
 * entry when it has none for that variant or the source doesn't say, as
 * the slicer does (get_index_for_extruder in PrintConfig.cpp).
 */
export function bambuFilamentVariantLayout(source: JsonRecord, slotCount: number): FilamentVariantLayout | null {
  const found = bambuFilamentEntries(source, slotCount);
  if (!found) return null;
  const names = (source.filament_extruder_variant as string[]).map(variantKey);
  const active = activeNozzleVolumeType(source);
  const find = (own: number[], variant: string) => own.find((index) => names[index].includes(variant));
  const slots = found.entries.map((own) => ({
    standard: (active === null ? undefined : find(own, active)) ?? own[0],
    highFlow: find(own, "highflow") ?? null,
  }));
  return { length: found.length, slots };
}
