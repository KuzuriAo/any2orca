// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

const BAMBU_ONLY_NOZZLE_VARIANT_KEYS = ["nozzle_volume_type", "default_nozzle_volume_type"] as const;

/**
 * Removes the source slicer's nozzle-variant selection from the output and
 * puts back the U1 profile's own value, right before the settings are
 * returned. Unconditional, whatever path the source's value took.
 *
 * In Bambu Studio, `nozzle_volume_type` (and `default_nozzle_volume_type`)
 * select which column of a per-variant paired array (a nozzle's
 * "Standard" vs "High Flow" profile) the file was sliced with;
 * `detectVariantIndex.ts` reads it from the SOURCE for exactly that. Its
 * values and length describe the source printer, not the U1.
 *
 * A mis-sized value is dangerous: a converted file with one entry for four
 * toolheads crashes OrcaSlicer on load. So the
 * source's value never survives.
 *
 * Snapmaker Orca 2.4 uses `nozzle_volume_type` too, with its own meaning:
 * one entry per U1 toolhead, "standard" or "high_flow" for the Liber High
 * Flow hotend, and its stock projects always carry it. So the value is
 * restored from the U1 profile (four "standard" entries) when the profile
 * has a value in Snapmaker Orca's spelling, and `applyHighFlowHotends`
 * later marks the toolheads that have the hotend. A value in Bambu
 * Studio's spelling is never restored.
 * `default_nozzle_volume_type` has no U1 meaning and is always removed.
 */
/** Snapmaker Orca's own spelling; Bambu Studio writes "Standard"/"High Flow". */
const U1_VOLUME_TYPES = new Set(["standard", "high_flow"]);

export function stripBambuOnlyNozzleVariantKeys(settings: JsonRecord, baseline: JsonRecord): void {
  for (const key of BAMBU_ONLY_NOZZLE_VARIANT_KEYS) delete settings[key];
  const u1Value = baseline.nozzle_volume_type;
  if (Array.isArray(u1Value) && u1Value.length > 0 && u1Value.every((v) => U1_VOLUME_TYPES.has(String(v)))) {
    settings.nozzle_volume_type = [...u1Value];
  }
}
