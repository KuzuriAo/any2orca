// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Layer height options for the chosen nozzle size and detection of creator layers
 * that fall outside the range of the nozzle's U1 profiles.
 */
import type { PlateFilaments, ProfileCatalog } from "any2orca";

export const LAYER_HEIGHT_HELP =
  "Converts the project with one layer height for every layer, from your nozzle's U1 profiles. It replaces the creator's variable layer heights and any layer heights set for part of the model.";

export interface LayerLimits {
  min: number;
  max: number;
}

export interface LayersOutsideLimits {
  thinnest: number;
  thickest: number;
  tooThin: boolean;
  tooThick: boolean;
}

/** Unique profile layer heights for a nozzle size, sorted lowest first. */
export function availableLayerHeights(
  catalog: Pick<ProfileCatalog, "list"> | null | undefined,
  nozzleDiameter: string,
): number[] {
  if (!catalog) return [];
  const norm = nozzleDiameter.replace(/mm$/i, "").trim();
  const seen = new Set<number>();
  for (const entry of catalog.list({ nozzleDiameter: norm })) {
    if (typeof entry.layerHeight === "number" && Number.isFinite(entry.layerHeight) && entry.layerHeight > 0) {
      seen.add(entry.layerHeight);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Formats a layer height in mm with up to three decimals and trailing zeros dropped (e.g. "0.3 mm", "0.18 mm"). */
export function formatLayerHeightMm(height: number): string {
  return `${Number(height.toFixed(3))} mm`;
}

/**
 * Compares each plate's `layerHeights` against `layerLimits` numerically.
 * Returns null when every plate's layers are within the profile range
 * or when limits/layer heights are not present.
 */
export function findLayersOutsideLimits(
  plates: readonly PlateFilaments[] | null | undefined,
  limits: LayerLimits | null | undefined,
): LayersOutsideLimits | null {
  if (!plates || plates.length === 0 || !limits) return null;
  const EPS = 1e-6;
  let thinnest = Number.POSITIVE_INFINITY;
  let thickest = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const plate of plates) {
    const lh = plate.layerHeights;
    if (!lh) continue;
    found = true;
    if (lh.thinnest < thinnest) thinnest = lh.thinnest;
    if (lh.thickest > thickest) thickest = lh.thickest;
  }

  if (!found) return null;
  const tooThin = thinnest < limits.min - EPS;
  const tooThick = thickest > limits.max + EPS;
  if (!tooThin && !tooThick) return null;
  return { thinnest, thickest, tooThin, tooThick };
}

/**
 * Picks the profile height closest to the out-of-range layer height.
 * Ties break to the finer (lower) height.
 */
export function nearestSupportedLayerHeight(
  available: readonly number[],
  outside: LayersOutsideLimits,
): number | null {
  if (available.length === 0) return null;
  const target = outside.tooThin ? outside.thinnest : outside.thickest;
  let best = available[0]!;
  let bestDist = Math.abs(best - target);
  for (let i = 1; i < available.length; i++) {
    const candidate = available[i]!;
    const dist = Math.abs(candidate - target);
    if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && candidate < best)) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}
