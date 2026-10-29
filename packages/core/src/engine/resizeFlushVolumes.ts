// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

export interface ResizedFlushVolumes {
  flush_volumes_matrix: string[];
  flush_volumes_vector: string[];
}

/**
 * Sizes `flush_volumes_matrix` (n x n) and `flush_volumes_vector` (2n) for
 * the output's n filaments, as strings, which is the only form Snapmaker
 * Orca reads ("invalid json array" otherwise).
 *
 * Source files often don't match their own filament count: Bambu Studio
 * doesn't always shrink the arrays when a filament is removed, and a
 * two-nozzle printer (H2D, H2C) stores one n x n block per nozzle. Snapmaker
 * Orca refuses a file whose matrix doesn't match ("Flush volumes matrix do
 * not match to the correct size!") or crashes slicing it.
 *
 * Only the size matters on the U1: it isn't a single-extruder
 * multi-material printer, so Snapmaker Orca zeroes the matrix before use
 * (`WipeTower2.cpp::extract_wipe_volumes`) and purges by
 * `filament_minimal_purge_on_wipe_tower` instead, while
 * `number_of_extruders = sqrt(matrix.size())` still sizes its internal
 * structures. So the top-left block is kept (a two-nozzle source's first
 * nozzle) and anything missing is 0.
 *
 * @returns `null` when the source has no flush-volume arrays at all.
 */
export function resizeFlushVolumes(bambuSettings: JsonRecord, filamentCount: number, warnings: string[]): ResizedFlushVolumes | null {
  const matrix = bambuSettings.flush_volumes_matrix;
  const vector = bambuSettings.flush_volumes_vector;
  if (!Array.isArray(matrix) || !Array.isArray(vector)) return null;
  const n = filamentCount;
  if (n < 1) return null;

  // The source's own filament count: the matrix's side, or, for a per-nozzle matrix, the vector's half.
  const square = Math.sqrt(matrix.length);
  const fromVector = vector.length / 2;
  const sourceDim = Number.isInteger(square)
    ? square
    : Number.isInteger(fromVector) && fromVector > 0 && matrix.length % (fromVector * fromVector) === 0
      ? fromVector
      : 0;
  const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "0");

  const newMatrix: string[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      // Both within the source's own bounds, so a flat index never reads another row's data.
      newMatrix.push(row < sourceDim && col < sourceDim ? text(matrix[row * sourceDim + col]) : "0");
    }
  }
  const newVector: string[] = Array.from({ length: n * 2 }, (_, i) => (i < vector.length ? text(vector[i]) : "0"));

  if (sourceDim === 0) {
    warnings.push(`  WARN: flush_volumes_matrix has ${matrix.length} entries, which doesn't fit any filament count; it's set to 0 for this project's ${n} filaments (the U1 purges by its own minimum, not by this matrix).`);
  } else if (n > sourceDim) {
    warnings.push(`  WARN: flush_volumes_matrix/vector were sized for ${sourceDim} filament(s), fewer than this project's ${n}; the missing entries are 0 (the U1 purges by its own minimum, not by this matrix).`);
  } else if (n < sourceDim || matrix.length !== sourceDim * sourceDim) {
    warnings.push(`  Resized flush_volumes_matrix/vector from ${matrix.length}/${vector.length} entries to ${n} filament(s).`);
  }
  return { flush_volumes_matrix: newMatrix, flush_volumes_vector: newVector };
}
