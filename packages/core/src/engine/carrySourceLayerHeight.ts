// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

function toNumber(raw: unknown): number | null {
  const value = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

/** Tightest bound across every extruder entry (the U1 lists one per toolhead). */
function bound(raw: unknown, pick: (values: number[]) => number): number | null {
  const values = (Array.isArray(raw) ? raw : [raw]).map(toNumber).filter((v): v is number => v !== null);
  return values.length > 0 ? pick(values) : null;
}

/**
 * Keeps the source file's own layer height on a tier that doesn't match it
 * exactly. The U1 catalog follows Snapmaker's 18 tiers, which leave gaps (e.g. no 0.42mm tier for
 * the 0.6 nozzle; the nearest is 0.30mm Standard). layer_height is normally
 * tier-defining and not transferred, but printing a 0.42mm file at 0.30mm
 * would quietly discard the creator's choice, so the caller turns this on
 * only when it auto-matched a tier that isn't an exact layer-height match.
 * An explicitly chosen tier is never overridden.
 *
 * Clamped to the printer's own min/max layer height. Mutates `settings` in
 * place (a fresh object owned by the pipeline). No-op when the source has
 * no usable layer height or it already equals the tier's. A height the creator changed from their own stock is
 * copied over before this runs, so it equals the tier's here and is kept as set, even outside the printer's range:
 * the creator chose it (filament paintings print at 0.04 mm on the 0.4 mm nozzle), and the layer note says where it
 * falls outside the range, with the `layerHeight` option as the way to change it.
 */
export function carrySourceLayerHeight(settings: JsonRecord, sourceSettings: JsonRecord, machineSettings: JsonRecord, warnings: string[]): void {
  const source = toNumber(sourceSettings.layer_height);
  const tier = toNumber(settings.layer_height);
  if (source === null || tier === null || source === tier) return;

  const min = bound(machineSettings.min_layer_height, (v) => Math.max(...v));
  const max = bound(machineSettings.max_layer_height, (v) => Math.min(...v));
  let kept = source;
  if (min !== null && kept < min) kept = min;
  if (max !== null && kept > max) kept = max;
  if (kept === tier) return;

  settings.layer_height = String(kept);
  warnings.push(
    kept === source
      ? `  WARN: the U1 has no ${source} mm profile for this nozzle size, so your file's ${source} mm layer height was kept, on the closest profile (${tier} mm).`
      : `  WARN: your file's ${source} mm layer height is outside what the U1 supports for this nozzle size, so it was set to ${kept} mm, on the closest profile (${tier} mm).`,
  );
}
