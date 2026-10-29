// SPDX-License-Identifier: MIT
import { jsonEqual } from "./internal/jsonEqual.js";

/** True if every element of a non-empty array is equal to the first. */
function allSame(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every((v) => jsonEqual(v, arr[0]));
}

/**
 * Reconcile a single settings key's value between the Orca baseline
 * template and the Bambu source when their types/lengths differ.
 *
 * @param variantIndex which column to prefer when `bambuVal` is a
 *   per-nozzle-variant array with genuinely differing values (see
 *   detectVariantIndex.ts) -- `null` means no signal was available, so
 *   the first value is used and flagged for manual review, same as
 *   before that mechanism existed.
 * @returns `[newValue, changed]` — `changed` is true only when the
 *   resolved value actually differs from the baseline's — plus a third
 *   element, `true`, when Bambu's value couldn't be fitted at all and the
 *   baseline's was kept instead.
 */
export function coerceValue(
  baselineVal: unknown,
  bambuVal: unknown,
  key: string,
  warnings: string[],
  variantIndex: number | null = null,
): [unknown, boolean, true?] {
  const baselineIsList = Array.isArray(baselineVal);
  const bambuIsList = Array.isArray(bambuVal);

  if (baselineIsList && bambuIsList) {
    if (baselineVal.length === bambuVal.length) {
      return [bambuVal, !jsonEqual(bambuVal, baselineVal)];
    }
    if (allSame(bambuVal)) {
      const broadcast = new Array(baselineVal.length).fill(bambuVal[0]);
      return [broadcast, !jsonEqual(broadcast, baselineVal)];
    }
    warnings.push(
      `  SKIP ${key}: list length mismatch (template=${baselineVal.length}, ` +
        `source=${bambuVal.length}) and the source's values aren't uniform; left unchanged.`,
    );
    return [baselineVal, false, true];
  }

  if (baselineIsList && !bambuIsList) {
    const broadcast = new Array(baselineVal.length).fill(bambuVal);
    return [broadcast, !jsonEqual(broadcast, baselineVal)];
  }

  if (!baselineIsList && bambuIsList) {
    if (allSame(bambuVal)) {
      return [bambuVal[0], !jsonEqual(bambuVal[0], baselineVal)];
    }
    if (variantIndex !== null && variantIndex < bambuVal.length) {
      const chosen = bambuVal[variantIndex];
      warnings.push(
        `  NOTE ${key}: the source file has one value per nozzle variant ${JSON.stringify(bambuVal)}; ` +
          `using the one matching the installed nozzle variant (${JSON.stringify(chosen)}).`,
      );
      return [chosen, !jsonEqual(chosen, baselineVal)];
    }
    warnings.push(
      `  WARN ${key}: the U1 takes one value but the source file has differing ` +
        `per-extruder values ${JSON.stringify(bambuVal)}; using the first value ` +
        `(${JSON.stringify(bambuVal[0])}). Review this one manually.`,
    );
    return [bambuVal[0], !jsonEqual(bambuVal[0], baselineVal)];
  }

  return [bambuVal, !jsonEqual(bambuVal, baselineVal)];
}
