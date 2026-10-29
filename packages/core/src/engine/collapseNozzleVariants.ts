// SPDX-License-Identifier: MIT
import { VARIANT_PROCESS_KEYS } from "./applyHighFlowHotends.js";
import type { JsonRecord } from "./types.js";

/**
 * Print settings a two-nozzle source may store per nozzle and flow variant:
 * the ones the U1 stores per variant, plus the two it stores as one value.
 * An explicit list, because other project arrays (one entry per filament)
 * can have the same length by coincidence.
 */
export const NOZZLE_VARIANT_KEYS: ReadonlySet<string> = new Set([...VARIANT_PROCESS_KEYS, "top_solid_infill_flow_ratio", "travel_speed_z"]);

export interface CollapsedNozzleVariants {
  /** The source settings with each per-nozzle key reduced to one value per flow variant. The input when it isn't a two-nozzle file. */
  settings: JsonRecord;
  /** Keys whose nozzles disagreed, with the source's original values; the lower value was used. */
  conflicts: Map<string, unknown[]>;
  /** The variant both nozzles have installed, as a column of the collapsed values, or null when they differ or it isn't a two-nozzle file. */
  variantIndex: number | null;
}

const asStrings = (value: unknown): string[] | null => (Array.isArray(value) ? value.map((v) => String(v)) : null);
const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * Bambu's two-nozzle printers (H2D, H2C) store some print settings once per
 * nozzle and flow variant: with `print_extruder_id` `["1","1","2","2"]` and
 * `print_extruder_variant` `["Direct Drive Standard", "Direct Drive High
 * Flow", ...]`, `outer_wall_speed` `["50","60","50","60"]` means 50 on a
 * standard nozzle and 60 on a high-flow one, for both nozzles. Each such
 * key becomes one value per variant, in nozzle 1's variant order: the
 * `[standard, high_flow]` layout single-nozzle Bambu files and the U1 use.
 *
 * When the nozzles disagree on a variant, the lower number is used: the
 * U1's four toolheads don't map onto the source's two nozzles, and the
 * lower speed suits either. Values that aren't numbers take nozzle 1's.
 * Either way the key is reported in `conflicts`.
 */
export function collapseNozzleVariants(source: JsonRecord): CollapsedNozzleVariants {
  const unchanged: CollapsedNozzleVariants = { settings: source, conflicts: new Map(), variantIndex: null };
  const ids = asStrings(source.print_extruder_id);
  const variants = asStrings(source.print_extruder_variant);
  if (!ids || !variants || ids.length !== variants.length || new Set(ids).size < 2) return unchanged;

  // Column order of the result: nozzle 1's variants, standard before high flow as the U1 stores them. Every nozzle must have exactly those, once each.
  const nozzles = [...new Set(ids)];
  const isHighFlow = (variant: string) => (normalize(variant).includes("highflow") ? 1 : 0);
  const order = variants.filter((_, i) => ids[i] === nozzles[0]).sort((a, b) => isHighFlow(a) - isHighFlow(b));
  const columnOf = new Map<string, number>(); // "nozzle|variant" -> source column
  ids.forEach((id, i) => columnOf.set(`${id}|${variants[i]}`, i));
  if (columnOf.size !== ids.length || nozzles.some((n) => order.some((v) => !columnOf.has(`${n}|${v}`)))) return unchanged;

  const settings: JsonRecord = { ...source };
  const conflicts = new Map<string, unknown[]>();
  for (const key of NOZZLE_VARIANT_KEYS) {
    const value = source[key];
    if (!Array.isArray(value) || value.length !== ids.length) continue;
    let disagreed = false;
    settings[key] = order.map((variant) => {
      const values = nozzles.map((n) => value[columnOf.get(`${n}|${variant}`)!]);
      if (values.every((v) => String(v) === String(values[0]))) return values[0];
      disagreed = true;
      const numbers = values.map((v) => Number(v));
      return numbers.every((n) => Number.isFinite(n)) ? values[numbers.indexOf(Math.min(...numbers))] : values[0];
    });
    if (disagreed) conflicts.set(key, value);
  }

  // The variant actually installed, when both nozzles have the same one ("Standard" in nozzle_volume_type, "Direct Drive Standard" in the variant names).
  const installed = asStrings(source.nozzle_volume_type);
  const shared = installed && installed.length > 0 && installed.every((v) => normalize(v) === normalize(installed[0])) ? normalize(installed[0]) : null;
  const index = shared ? order.findIndex((v) => normalize(v).endsWith(shared)) : -1;
  return { settings, conflicts, variantIndex: index >= 0 ? index : null };
}
