// SPDX-License-Identifier: MIT
export interface BedCorners {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/**
 * Parse a `printable_area` array of `"XxY"` bed-polygon corner strings
 * into its bounds and centroid. The bed center, the plate pitch and the
 * clearance-scaling pass all use this, since they parse the same
 * `printable_area` array.
 */
export function parseBedCorners(printableArea: readonly string[]): BedCorners {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const corner of printableArea) {
    const [xStr, yStr] = corner.split("x");
    xs.push(Number.parseFloat(xStr));
    ys.push(Number.parseFloat(yStr));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: xs.reduce((a, b) => a + b, 0) / xs.length,
    centerY: ys.reduce((a, b) => a + b, 0) / ys.length,
  };
}

/**
 * The centroid (avg X, avg Y) of a bed polygon's corners.
 */
export function bedCenter(printableArea: readonly string[]): [number, number] {
  const { centerX, centerY } = parseBedCorners(printableArea);
  return [centerX, centerY];
}
