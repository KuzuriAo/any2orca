// SPDX-License-Identifier: AGPL-3.0-or-later
export interface PlateGridOffsets {
  sourceOffset: { x: number; y: number };
  targetOffset: { x: number; y: number };
}

/**
 * Bambu Studio (and Orca/Prusa-family slicers) arrange multiple plates in
 * one shared combined grid: `cols = ceil(sqrt(plate count))`, row-major,
 * `pitch_x = bed_w * 1.2, pitch_y = -bed_h * 1.2`.
 *
 * Both offsets need subtracting back out to render one plate in isolation:
 * - `sourceOffset`: for the pre-conversion preview on the source bed.
 *   Bambu Studio laid out objects using the TRUE absolute plate count
 *   (including empty plates/gaps). Thus, cols is derived from the maximum
 *   plate number (`Math.max(...platesList)`), and the plate index is
 *   the absolute 0-based number (`selectedPlate - 1`).
 * - `targetOffset`: for the post-conversion U1 placement on the 270x270mm bed.
 *   the engine's `computeShifts` intentionally packs ONLY populated
 *   plates to avoid wasting grid cells, so the target side uses the compacted
 *   index (`platesList.indexOf(selectedPlate)`).
 */
export function computePlateGridOffsets(
  platesList: readonly number[],
  selectedPlate: number,
  sourceBed: { width: number; height: number },
  targetBed: { width: number; height: number } = { width: 270, height: 270 },
): PlateGridOffsets {
  // 1. Source grid offset (pre-conversion preview undo)
  const totalPlateSlots = platesList.length > 0 ? Math.max(...platesList) : 1;
  const sourceCols = Math.max(1, Math.ceil(Math.sqrt(totalPlateSlots)));
  const sourcePlateIdx = Math.max(0, selectedPlate - 1);
  const sourceCol = sourcePlateIdx % sourceCols;
  const sourceRow = Math.floor(sourcePlateIdx / sourceCols);

  const sourcePitchX = sourceBed.width * 1.2;
  const sourcePitchY = -sourceBed.height * 1.2;

  // 2. Target grid offset (post-conversion U1 placement undo)
  const targetCols = platesList.length > 0 ? Math.max(1, Math.ceil(Math.sqrt(platesList.length))) : 1;
  const targetPlateIdx = Math.max(0, platesList.indexOf(selectedPlate));
  const targetCol = targetPlateIdx % targetCols;
  const targetRow = Math.floor(targetPlateIdx / targetCols);

  const targetPitchX = targetBed.width * 1.2;
  const targetPitchY = -targetBed.height * 1.2;

  return {
    sourceOffset: {
      x: sourceCol * sourcePitchX || 0,
      y: sourceRow * sourcePitchY || 0,
    },
    targetOffset: {
      x: targetCol * targetPitchX || 0,
      y: targetRow * targetPitchY || 0,
    },
  };
}
