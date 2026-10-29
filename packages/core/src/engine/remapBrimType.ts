// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/**
 * `brim_type` has a genuine cross-slicer semantic mismatch on one value:
 * Bambu Studio's "Painted" brim mode (paint brim only at sharp corners of
 * the model) is persisted as the literal string `"brim_ears"` -- not
 * `"painted"` -- seen in real files, including a
 * fresh re-save in a current Bambu Studio build (toggled to "No-brim",
 * saved, toggled back to "Painted", saved again -- still wrote
 * "brim_ears", so this isn't a stale/legacy value, it's Bambu Studio's
 * permanent representation for that mode). OrcaSlicer (and therefore
 * Snapmaker Orca) assigns that same string to a DIFFERENT, unrelated
 * feature it added itself: "Mouse ear," fully automatic corner-brim
 * detection with no painting involved at all. Orca has its own separate
 * `"painted"` value for the manual-paint concept Bambu's UI actually
 * means.
 *
 * A plain passthrough is byte-faithful to the source but semantically
 * wrong the moment the output is opened in Orca -- the creator's real,
 * deliberately-painted brim shows up mislabeled as (and conceptually
 * replaced by) an unrelated automatic feature. Every source this tool
 * converts from is Bambu-Studio-lineage (Bambu Studio itself, Creality
 * Print, Anycubic Slicer Next -- all forks of the same codebase, none of
 * them Orca-lineage), and the output always targets Orca-lineage
 * (Snapmaker Orca/OrcaSlicer) -- so `"brim_ears"` arriving from any
 * supported source always means "Painted" in Orca's own vocabulary,
 * never genuinely "Mouse ear" (that value doesn't exist in Bambu
 * Studio's own UI at all, confirmed against OrcaSlicer's PrintConfig.cpp,
 * where it's marked as an Orca-only addition).
 */
export function remapBrimType(settings: JsonRecord, warnings: string[]): JsonRecord {
  if (settings.brim_type !== "brim_ears") return settings;
  warnings.push('  Remapped brim_type "brim_ears" (Bambu Studio\'s own value for "Painted") to "painted": Orca and Snapmaker Orca use "brim_ears" for an unrelated automatic feature ("Mouse ear").');
  return { ...settings, brim_type: "painted" };
}
