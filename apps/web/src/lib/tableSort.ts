// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PresetChange } from "./presetsEngine";

export type SortDirection = "asc" | "desc";

export interface SortState<T extends string = string> {
  column: T | "default";
  direction: SortDirection;
}

export function nextSortState<T extends string>(
  current: SortState<T>,
  clickedColumn: T
): SortState<T> {
  if (current.column !== clickedColumn) {
    return { column: clickedColumn, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { column: clickedColumn, direction: "desc" };
  }
  return { column: "default", direction: "asc" };
}

export function ariaSortValue(
  current: SortState<any>,
  column: string
): "ascending" | "descending" | "none" {
  if (current.column !== column) return "none";
  return current.direction === "asc" ? "ascending" : "descending";
}

/**
 * Parses numeric value and strips trailing units like %, mm/s, mm, s, etc.
 * Returns null if not a finite number.
 */
export function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (str === "") return null;

  const match = str.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*[%a-zA-Z°/]+)?$/);
  if (!match) return null;

  const val = Number(match[1]);
  return Number.isFinite(val) ? val : null;
}

/**
 * Returns true if value is empty, null, or undefined.
 */
export function isUncomparable(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  return false;
}

/**
 * Compares two values:
 * 1. Values that cannot be compared (empty, null, undefined) go to the end in either direction.
 * 2. Numbers (with or without units) sort numerically when both are numbers.
 * 3. Otherwise sorts as natural case-insensitive text.
 */
export function compareValues(a: unknown, b: unknown, direction: SortDirection = "asc"): number {
  const aEmpty = isUncomparable(a);
  const bEmpty = isUncomparable(b);

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const numA = parseNumericValue(a);
  const numB = parseNumericValue(b);

  if (numA !== null && numB !== null) {
    const diff = numA - numB;
    return direction === "asc" ? diff : -diff;
  }

  const strDiff = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? strDiff : -strDiff;
}

export function compareStrings(a: string, b: string, direction: SortDirection = "asc"): number {
  const diff = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? diff : -diff;
}

export type PresetSortColumn = "param" | "stock" | "yours";

export function sortPresetChanges(
  changes: readonly PresetChange[],
  column: PresetSortColumn | "default",
  direction: SortDirection = "asc"
): PresetChange[] {
  if (column === "default") {
    return [...changes];
  }

  const withIndices = changes.map((c, idx) => ({ change: c, idx }));

  withIndices.sort((x, y) => {
    const a = x.change;
    const b = y.change;

    if (column === "param") {
      const cmp = compareStrings(a.label, b.label, direction);
      if (cmp !== 0) return cmp;
      const tie = compareStrings(a.key, b.key, direction);
      if (tie !== 0) return tie;
      return x.idx - y.idx;
    }

    if (column === "stock") {
      const cmp = compareValues(a.stock, b.stock, direction);
      if (cmp !== 0) return cmp;
      return x.idx - y.idx;
    }

    if (column === "yours") {
      const cmp = compareValues(a.yours, b.yours, direction);
      if (cmp !== 0) return cmp;
      return x.idx - y.idx;
    }

    return x.idx - y.idx;
  });

  return withIndices.map((item) => item.change);
}

