// SPDX-License-Identifier: AGPL-3.0-or-later
export interface PlateGridOffsets {
  sourceOffset: { x: number; y: number };
  targetOffset: { x: number; y: number };
}

function readOriginOffset(
  origins: Readonly<Record<number, readonly [number, number]>> | null | undefined,
  selectedPlate: number,
): { x: number; y: number } | null {
  if (origins == null || typeof origins !== "object") return null;
  const raw = Object.hasOwn(origins, selectedPlate) ? origins[selectedPlate] : undefined;
  const valid =
    Array.isArray(raw) &&
    raw.length >= 2 &&
    typeof raw[0] === "number" &&
    typeof raw[1] === "number" &&
    Number.isFinite(raw[0]) &&
    Number.isFinite(raw[1]);
  return valid ? { x: raw[0] || 0, y: raw[1] || 0 } : { x: 0, y: 0 };
}

/**
 * Slicers in the Bambu Studio family arrange multiple plates in one shared
 * combined grid: `cols = ceil(sqrt(plate count))`, row-major,
 * `pitch_x = bed_w * 1.2, pitch_y = -bed_h * 1.2`. PrusaSlicer 2.9 lays its
 * beds out in rings with positive Y for later rows instead, so the library
 * supplies `sourcePlateOrigins` for those projects and it takes over on the
 * source side when present.
 *
 * Both offsets need subtracting back out to render one plate in isolation:
 * - `sourceOffset`: for the pre-conversion preview on the source bed (and the
 *   post-conversion original-position outline). When `sourcePlateOrigins` is
 *   given, uses that plate's origin (or `{ x: 0, y: 0 }` if missing or
 *   non-finite). Otherwise uses the Bambu Studio family grid, where cols is
 *   derived from the maximum plate number (`Math.max(...platesList)`) and the
 *   plate index is the absolute 0-based number (`selectedPlate - 1`).
 * - `targetOffset`: for the post-conversion U1 placement on the 270x270mm bed.
 *   When `targetPlateOrigins` (`report.plateOrigins`) is given, uses that
 *   plate's origin (or `{ x: 0, y: 0 }` if missing or non-finite), which keeps
 *   empty plates in their own grid cells. Falls back to the compacted index
 *   (`platesList.indexOf(selectedPlate)`) when `targetPlateOrigins` is absent.
 */
export function computePlateGridOffsets(
  platesList: readonly number[],
  selectedPlate: number,
  sourceBed: { width: number; height: number },
  targetBed: { width: number; height: number } = { width: 270, height: 270 },
  sourcePlateOrigins?: Readonly<Record<number, readonly [number, number]>> | null,
  targetPlateOrigins?: Readonly<Record<number, readonly [number, number]>> | null,
): PlateGridOffsets {
  // 1. Source grid offset (pre-conversion preview undo)
  const explicitSource = readOriginOffset(sourcePlateOrigins, selectedPlate);
  let sourceOffset: { x: number; y: number };
  if (explicitSource !== null) {
    sourceOffset = explicitSource;
  } else {
    const totalPlateSlots = platesList.length > 0 ? Math.max(...platesList) : 1;
    const sourceCols = Math.max(1, Math.ceil(Math.sqrt(totalPlateSlots)));
    const sourcePlateIdx = Math.max(0, selectedPlate - 1);
    const sourceCol = sourcePlateIdx % sourceCols;
    const sourceRow = Math.floor(sourcePlateIdx / sourceCols);

    const sourcePitchX = sourceBed.width * 1.2;
    const sourcePitchY = -sourceBed.height * 1.2;
    sourceOffset = {
      x: sourceCol * sourcePitchX || 0,
      y: sourceRow * sourcePitchY || 0,
    };
  }

  // 2. Target grid offset (post-conversion U1 placement undo)
  const explicitTarget = readOriginOffset(targetPlateOrigins, selectedPlate);
  let targetOffset: { x: number; y: number };
  if (explicitTarget !== null) {
    targetOffset = explicitTarget;
  } else {
    const targetCols = platesList.length > 0 ? Math.max(1, Math.ceil(Math.sqrt(platesList.length))) : 1;
    const targetPlateIdx = Math.max(0, platesList.indexOf(selectedPlate));
    const targetCol = targetPlateIdx % targetCols;
    const targetRow = Math.floor(targetPlateIdx / targetCols);

    const targetPitchX = targetBed.width * 1.2;
    const targetPitchY = -targetBed.height * 1.2;
    targetOffset = {
      x: targetCol * targetPitchX || 0,
      y: targetRow * targetPitchY || 0,
    };
  }

  return {
    sourceOffset,
    targetOffset,
  };
}
