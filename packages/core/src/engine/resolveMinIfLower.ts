// SPDX-License-Identifier: MIT
import { jsonEqual } from "./internal/jsonEqual.js";

/** Parses a plain number or a percentage string ("50%" -> 50) for the min-comparison below. `null` if unrecognizable -- "can't compare, keep the U1 default." */
function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const cleaned = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * For MIN_COMPARISON_KEYS (travel_speed, `*_acceleration`): these
 * describe a printer-motion safety ceiling, not a portable creator
 * preference (see MIN_COMPARISON_KEYS's own doc comment), so Bambu's
 * source value is only honored when it's LOWER (more conservative) than
 * the U1 profile's own tuned default -- a HIGHER Bambu value is always
 * ignored, since it could exceed what's actually safe on this different
 * printer.
 *
 * `0` is never a real value here (Bambu Studio uses it as a sentinel
 * meaning "not overridden, inherit default_acceleration" for the
 * per-feature acceleration keys); read as a lower value, it would
 * clobber the U1's real default. Treated as "no signal" the same as an unparseable value.
 *
 * Resolves a per-nozzle-variant paired array in the SOURCE (see
 * detectVariantIndex.ts) to a scalar first, same as coerceValue's array
 * handling. A U1 value stored per variant is compared entry by entry.
 *
 * @returns `[newValue, changed]`, same contract as coerceValue.
 */
export function resolveMinIfLower(baselineVal: unknown, bambuVal: unknown, variantIndex: number | null): [unknown, boolean] {
  let bambuScalar: unknown = bambuVal;
  if (Array.isArray(bambuVal)) {
    if (bambuVal.length === 0) return [baselineVal, false];
    const idx = variantIndex !== null && variantIndex < bambuVal.length ? variantIndex : 0;
    bambuScalar = bambuVal[idx];
  }

  const bambuNum = parseNumeric(bambuScalar);
  if (bambuNum === null || bambuNum <= 0) return [baselineVal, false];
  // Snapmaker Orca stores these per variant (standard, high flow), so the
  // U1 value can be a list: each entry becomes the lower of the two.
  if (Array.isArray(baselineVal)) {
    const lowered = baselineVal.map((entry) => {
      const n = parseNumeric(entry);
      return n !== null && bambuNum < n ? bambuScalar : entry;
    });
    return [lowered, !jsonEqual(lowered, baselineVal)];
  }
  const baselineNum = parseNumeric(baselineVal);
  if (baselineNum === null || bambuNum >= baselineNum) {
    return [baselineVal, false];
  }
  return [bambuScalar, !jsonEqual(bambuScalar, baselineVal)];
}
