// SPDX-License-Identifier: MIT
/**
 * What a setting's several values mean. Some settings hold more than one
 * value, and "200, 500" reads as noise unless it's clear what each one is
 * for: the U1 stores some speeds and filament flow values once for the
 * standard hotend and once for the Liber High Flow Hotend, other Bambu-lineage
 * printers store them once per flow variant of their own nozzle, and a
 * two-nozzle printer such as the H2D stores them per nozzle and flow variant.
 *
 * The layout comes from the settings themselves (which keys are paired, the
 * printer model, a two-nozzle file's extruder columns), never from the text
 * of a value or a file's name. A value of one setting that merely lists
 * several filaments has no layout.
 */
import { FILAMENT_FLOW_VARIANT_KEYS } from "../engine/applyFilamentFlowVariants.js";
import { NOZZLE_VARIANT_KEYS } from "../engine/collapseNozzleVariants.js";

/**
 * - `u1-hotends`: two values, the U1's standard hotend, then the Liber High Flow Hotend.
 * - `flow-variants`: two values, another printer's standard nozzle, then its high-flow nozzle.
 * - `nozzle-variants`: one value per nozzle of a two-nozzle printer, standard then high flow for each.
 */
export type ValueLayout = "u1-hotends" | "flow-variants" | "nozzle-variants";

/** One sentence per layout, for a note above a table of values. The web app and the CLI both use these. */
export const VALUE_LAYOUT_TEXT: Readonly<Record<ValueLayout, string>> = {
  "u1-hotends": "Two values: standard hotend, then Liber High Flow Hotend.",
  "flow-variants": "Two values: the original printer's standard nozzle, then its high-flow nozzle.",
  "nozzle-variants": "One value per nozzle of the original printer, standard then high flow for each.",
};

const LAYOUT_ORDER: readonly ValueLayout[] = ["u1-hotends", "flow-variants", "nozzle-variants"];
const FILAMENT_PAIRS: ReadonlySet<string> = new Set(FILAMENT_FLOW_VARIANT_KEYS);

/** Settings for a printer other than the U1 (a missing model counts as the U1: stock profiles and presets). */
export function isOtherPrinter(settings: Readonly<Record<string, unknown>>): boolean {
  const model = settings.printer_model;
  return typeof model === "string" && model.length > 0 && !model.includes("Snapmaker U1");
}

/** The number of nozzle columns of a two-nozzle file's per-nozzle settings, or 0 when it isn't one. */
function nozzleColumns(settings: Readonly<Record<string, unknown>>): number {
  const ids = settings.print_extruder_id;
  return Array.isArray(ids) && new Set(ids.map(String)).size >= 2 ? ids.length : 0;
}

/**
 * The layout of one value of `key`, as stored in `settings`. `count` is how
 * many entries the value shows: the whole list for a print setting, or one
 * filament slot's entries for a filament setting (`perSlot`).
 */
export function valueLayout(key: string, count: number, settings: Readonly<Record<string, unknown>>, perSlot = false): ValueLayout | undefined {
  if (count < 2) return undefined;
  if (perSlot) {
    if (!FILAMENT_PAIRS.has(key) || count !== 2) return undefined;
    return isOtherPrinter(settings) ? "flow-variants" : "u1-hotends";
  }
  if (!NOZZLE_VARIANT_KEYS.has(key)) return undefined;
  const columns = nozzleColumns(settings);
  if (columns > 0) return count === columns ? "nozzle-variants" : undefined;
  if (count !== 2) return undefined;
  return isOtherPrinter(settings) ? "flow-variants" : "u1-hotends";
}

/** The notes a table needs: one per layout its values use, in a fixed order. Takes Compare rows or "What changed" items. */
export function valueLayoutNotes(rows: Iterable<{ layout?: Partial<Record<string, ValueLayout>> }>): string[] {
  const used = new Set<ValueLayout>();
  for (const row of rows) for (const layout of Object.values(row.layout ?? {})) if (layout) used.add(layout);
  return LAYOUT_ORDER.filter((l) => used.has(l)).map((l) => VALUE_LAYOUT_TEXT[l]);
}
