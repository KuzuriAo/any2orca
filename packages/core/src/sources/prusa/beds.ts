// SPDX-License-Identifier: MIT
/**
 * PrusaSlicer 2.9's several beds. The project records no bed for an object:
 * the beds are virtual copies of the printer's bed laid out on a grid around
 * it, and an object is on the first bed (in index order) whose area it
 * touches, as PrusaSlicer decides it on load (`BuildVolume::object_state`
 * with `MultipleBeds::get_bed_translation`). The grid walks outward in square
 * rings: bed 0 at the origin, 1 to its right, 2 above it, 3 diagonally, then
 * the next ring (`BedsGrid::grid_coords_abs2index`). The gap between beds is
 * the smaller of 100 mm and three tenths of the bed's diagonal
 * (`MultipleBeds::bed_gap`). Projects saved before 2.9.0 have one bed.
 */

/** PrusaSlicer's `MAX_NUMBER_OF_BEDS`. */
export const MAX_BEDS = 9;

export interface BedRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The printer's bed from `bed_shape` ("0x0,250x0,250x210,0x210"), as its bounding rectangle; null when unreadable. */
export function parseBedShape(value: string | undefined): BedRect | null {
  if (!value) return null;
  const points = value.split(",").map((p) => p.trim().split("x").map(Number));
  if (points.length < 3 || points.some((p) => p.length !== 2 || !p.every(Number.isFinite))) return null;
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  const rect = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  return rect.maxX > rect.minX && rect.maxY > rect.minY ? rect : null;
}

/** The gap between two beds, in mm. */
export function bedGap(bed: BedRect): number {
  const w = bed.maxX - bed.minX;
  const h = bed.maxY - bed.minY;
  return Math.min(100, Math.hypot(w, h) * 0.3);
}

/** Grid coordinates of bed `index` (the first quadrant of PrusaSlicer's grid). */
export function bedGridCoords(index: number): [number, number] {
  if (index <= 0) return [0, 0];
  const ring = Math.floor(Math.sqrt(index)) + 1; // the ring whose outer coordinate is ring - 1
  const start = (ring - 1) * (ring - 1);
  const edge = ring - 1;
  if (index === ring * ring - 1) return [edge, edge];
  if (index < start + edge) return [edge, index - start];
  return [index - start - edge, edge];
}

/** Where bed `index` sits: its translation from the printer's bed, in mm. */
export function bedTranslation(index: number, bed: BedRect): [number, number] {
  const [gx, gy] = bedGridCoords(index);
  const gap = bedGap(bed);
  return [gx * (bed.maxX - bed.minX + gap), gy * (bed.maxY - bed.minY + gap)];
}

/**
 * The bed an object is on, by its world bounding box: the first bed whose
 * rectangle the box touches, or null when it touches none (PrusaSlicer leaves
 * such an object on no bed).
 */
export function bedIndexOf(bbox: readonly [number, number, number, number], bed: BedRect): number | null {
  const [minX, maxX, minY, maxY] = bbox;
  for (let index = 0; index < MAX_BEDS; index++) {
    const [tx, ty] = bedTranslation(index, bed);
    const touches = maxX >= bed.minX + tx && minX <= bed.maxX + tx && maxY >= bed.minY + ty && minY <= bed.maxY + ty;
    if (touches) return index;
  }
  return null;
}
