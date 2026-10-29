// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** Bambu sometimes joins an ordered variant-name list into ONE comma-separated string element instead of separate array elements. */
function normalizeVariantNames(raw: unknown[]): string[] {
  if (raw.length === 1 && typeof raw[0] === "string" && raw[0].includes(",")) {
    return raw[0].split(",");
  }
  return raw.map((v) => String(v));
}

function extractVariantNames(bambuSettings: JsonRecord): string[] | null {
  for (const key of ["filament_extruder_variant", "print_extruder_variant", "printer_extruder_variant", "extruder_variant_list"]) {
    const raw = bambuSettings[key];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const names = normalizeVariantNames(raw);
    if (names.length >= 2) return names;
  }
  return null;
}

/**
 * Determines which column of Bambu's newer per-nozzle-variant paired
 * arrays (e.g. `outer_wall_speed: ["210", "350"]`) reflects the settings
 * Bambu Studio actually sliced with.
 *
 * Bambu Lab's newer hardened-steel nozzles support two flow profiles,
 * "Standard" and "High Flow" -- and several process-level settings then
 * carry one value per variant instead of a single scalar, even on
 * printers with only ONE physical nozzle. The authoritative signal for
 * which one was actually active is `nozzle_volume_type` (or
 * `default_nozzle_volume_type`) -- e.g. `["Standard"]`. Confirmed against
 * a real X1 Carbon export (single nozzle, `single_extruder_multi_material:
 * 1`) that had `nozzle_volume_type: ["Standard"]` while the SELECTED
 * FILAMENT PRESET was still named "... HF" (e.g. "Bambu PETG HF @BBL
 * X1C") -- an initial version of this function used that filament-name
 * "HF" substring as the signal instead, which is wrong: an "HF"-tuned
 * filament preset can still be sliced with the Standard nozzle installed,
 * and Bambu Studio then uses the Standard column regardless of the
 * filament preset's own name.
 *
 * This is unrelated to genuine dual-physical-nozzle printers like the
 * H2D -- deliberately scoped to single-physical-nozzle sources only (see
 * the `nozzle_diameter` length check below), since a real multi-nozzle
 * file might reuse these same field names for a different purpose (which
 * physical nozzle a filament is assigned to), and that hasn't been
 * verified, so this heuristic stays out of its way rather than guess.
 *
 * @returns the column index Bambu Studio actually used, or `null` when no
 *   usable signal is present -- callers should fall back to their
 *   existing "can't determine, ask for manual review" behavior in that case.
 */
export function detectVariantIndex(bambuSettings: JsonRecord): number | null {
  const nozzleDiameter = bambuSettings.nozzle_diameter;
  if (!Array.isArray(nozzleDiameter) || nozzleDiameter.length !== 1) return null;

  const names = extractVariantNames(bambuSettings);
  if (!names) return null;

  const activeVariantRaw = bambuSettings.nozzle_volume_type ?? bambuSettings.default_nozzle_volume_type;
  const activeVariant = Array.isArray(activeVariantRaw) && typeof activeVariantRaw[0] === "string" ? activeVariantRaw[0] : null;
  if (!activeVariant) return null;

  // Compare with whitespace stripped -- Bambu spells the same variant
  // "Standard"/"HighFlow" in nozzle_volume_type but "Direct Drive High
  // Flow" (with spaces) in the variant-name lists.
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const activeNormalized = normalize(activeVariant);
  const index = names.findIndex((n) => normalize(n).includes(activeNormalized));
  return index >= 0 ? index : 0;
}

/**
 * Which column of Bambu's per-variant filament arrays holds the High Flow
 * value, from the source's own variant names (e.g. "Direct Drive High
 * Flow"). `null` when the source has no named high-flow variant.
 */
export function detectHighFlowVariantIndex(bambuSettings: JsonRecord): number | null {
  const names = extractVariantNames(bambuSettings);
  if (!names) return null;
  const index = names.findIndex((n) => n.replace(/\s+/g, "").toLowerCase().includes("highflow"));
  return index >= 0 ? index : null;
}
