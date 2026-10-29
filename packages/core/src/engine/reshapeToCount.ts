// SPDX-License-Identifier: MIT
/**
 * Reduce a Bambu per-(filament x nozzle-variant) array down to one value
 * per filament slot. Bambu sometimes stores k values per filament (e.g.
 * one per nozzle variant) as a flat array of length count*k; this takes
 * one value from each filament's group of k, per `variantIndex`.
 *
 * @param variantIndex which of the k values within each filament's group
 *   to keep (see detectVariantIndex.ts) -- defaults to 0 (the first/
 *   Standard value), same as before that mechanism existed. Clamped to
 *   the group's own bounds so an out-of-range index can't produce
 *   `undefined` entries.
 * @returns the reshaped array, or `null` if `values.length` isn't a clean
 *   multiple of `count` (can't safely reshape).
 */
export function reshapeToCount<T>(values: T[], count: number, variantIndex = 0): T[] | null {
  const n = values.length;
  if (n === count) {
    return [...values];
  }
  if (count > 0 && n % count === 0 && n > count) {
    const group = n / count;
    const offset = variantIndex >= 0 && variantIndex < group ? variantIndex : 0;
    return Array.from({ length: count }, (_, i) => values[i * group + offset] as T);
  }
  return null;
}
