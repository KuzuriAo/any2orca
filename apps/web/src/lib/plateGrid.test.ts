// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePlateGridOffsets } from "./plateGrid";

function assertClose(actual: number, expected: number, delta = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= delta,
    `expected ${actual} to be close to ${expected} (diff: ${Math.abs(actual - expected)})`,
  );
}

describe("computePlateGridOffsets", () => {
  const bambuBed = { width: 256, height: 256 };
  const u1Bed = { width: 270, height: 270 };

  it("handles single-plate projects with zero offsets", () => {
    const offsets = computePlateGridOffsets([1], 1, bambuBed, u1Bed);
    assert.deepEqual(offsets.sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(offsets.targetOffset, { x: 0, y: 0 });
  });

  it("handles empty platesList fallback gracefully", () => {
    const offsets = computePlateGridOffsets([], 1, bambuBed, u1Bed);
    assert.deepEqual(offsets.sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(offsets.targetOffset, { x: 0, y: 0 });
  });

  it("computes continuous multi-plate grids identically for source and target", () => {
    // 4 plates in 2x2 grid: pitchX = 307.2, pitchY = -307.2
    const plates = [1, 2, 3, 4];

    // Plate 1: col 0, row 0
    assert.deepEqual(computePlateGridOffsets(plates, 1, bambuBed, u1Bed).sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 1, bambuBed, u1Bed).targetOffset, { x: 0, y: 0 });

    // Plate 2: col 1, row 0
    assert.deepEqual(computePlateGridOffsets(plates, 2, bambuBed, u1Bed).sourceOffset, {
      x: 307.2,
      y: 0,
    });
    assert.deepEqual(computePlateGridOffsets(plates, 2, bambuBed, u1Bed).targetOffset, {
      x: 324,
      y: 0,
    });

    // Plate 3: col 0, row 1
    assert.deepEqual(computePlateGridOffsets(plates, 3, bambuBed, u1Bed).sourceOffset, {
      x: 0,
      y: -307.2,
    });
    assert.deepEqual(computePlateGridOffsets(plates, 3, bambuBed, u1Bed).targetOffset, {
      x: 0,
      y: -324,
    });

    // Plate 4: col 1, row 1
    assert.deepEqual(computePlateGridOffsets(plates, 4, bambuBed, u1Bed).sourceOffset, {
      x: 307.2,
      y: -307.2,
    });
    assert.deepEqual(computePlateGridOffsets(plates, 4, bambuBed, u1Bed).targetOffset, {
      x: 324,
      y: -324,
    });
  });

  it("correctly handles multi-plate files with gaps (reproducing '0246 Larvitar SPLIT.3mf')", () => {
    // 8-plate Bambu project where plates 2 and 3 are empty:
    // Populated plates: [1, 4, 5, 6, 7, 8]
    // Total slots: 8 -> sourceCols = ceil(sqrt(8)) = 3
    // Populated count: 6 -> targetCols = ceil(sqrt(6)) = 3
    const plates = [1, 4, 5, 6, 7, 8];

    // Plate 1 (0-based abs 0: col 0, row 0)
    const p1 = computePlateGridOffsets(plates, 1, bambuBed, u1Bed);
    assert.deepEqual(p1.sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(p1.targetOffset, { x: 0, y: 0 });

    // Plate 4 (0-based abs 3: col 3%3 = 0, row floor(3/3) = 1)
    // In old buggy code: platesList.indexOf(4) = 1 -> col 1, row 0 -> sourceOffset was (307.2, 0)
    // Correct sourceOffset: col 0, row 1 -> (0, -307.2)
    const p4 = computePlateGridOffsets(plates, 4, bambuBed, u1Bed);
    assertClose(p4.sourceOffset.x, 0);
    assertClose(p4.sourceOffset.y, -307.2);

    // Verify object 2 raw coords from brief: tx = 128.00, ty = -162.03
    const rawTx = 128.0;
    const rawTy = -162.03;
    const localX = rawTx - p4.sourceOffset.x;
    const localY = rawTy - p4.sourceOffset.y;
    assertClose(localX, 128.0);
    assertClose(localY, 145.17); // Squarely within 0..256 mm bed!

    // Meanwhile, target side uses compacted index (plates.indexOf(4) = 1 -> col 1, row 0):
    assertClose(p4.targetOffset.x, 324);
    assertClose(p4.targetOffset.y, 0);

    // Plate 5 (0-based abs 4: col 1, row 1)
    const p5 = computePlateGridOffsets(plates, 5, bambuBed, u1Bed);
    assertClose(p5.sourceOffset.x, 307.2);
    assertClose(p5.sourceOffset.y, -307.2);

    // Plate 6 (0-based abs 5: col 2, row 1)
    const p6 = computePlateGridOffsets(plates, 6, bambuBed, u1Bed);
    assertClose(p6.sourceOffset.x, 614.4);
    assertClose(p6.sourceOffset.y, -307.2);

    // Plate 7 (0-based abs 6: col 0, row 2)
    const p7 = computePlateGridOffsets(plates, 7, bambuBed, u1Bed);
    assertClose(p7.sourceOffset.x, 0);
    assertClose(p7.sourceOffset.y, -614.4);

    // Plate 8 (0-based abs 7: col 1, row 2)
    const p8 = computePlateGridOffsets(plates, 8, bambuBed, u1Bed);
    assertClose(p8.sourceOffset.x, 307.2);
    assertClose(p8.sourceOffset.y, -614.4);
  });
});
