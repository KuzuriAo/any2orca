// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_VENDORS } from "any2orca";
import { computePlateGridOffsets, resolveSourceVendor, VENDOR_NAMES } from "./plateGrid";

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
  it("uses sourcePlateOrigins for sourceOffset when provided and leaves targetOffset unchanged", () => {
    const xlBed = { width: 360, height: 360 };
    const plates = [1, 2, 3, 4];
    const origins: Record<number, [number, number]> = {
      1: [0, 0],
      2: [460, 0],
      3: [0, 460],
      4: [460, 460],
    };

    const p1 = computePlateGridOffsets(plates, 1, xlBed, u1Bed, origins);
    assert.deepEqual(p1.sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(p1.targetOffset, { x: 0, y: 0 });

    const p2 = computePlateGridOffsets(plates, 2, xlBed, u1Bed, origins);
    assert.deepEqual(p2.sourceOffset, { x: 460, y: 0 });
    assert.deepEqual(p2.targetOffset, { x: 324, y: 0 });

    const p3 = computePlateGridOffsets(plates, 3, xlBed, u1Bed, origins);
    assert.deepEqual(p3.sourceOffset, { x: 0, y: 460 });
    assert.deepEqual(p3.targetOffset, { x: 0, y: -324 });

    const p4 = computePlateGridOffsets(plates, 4, xlBed, u1Bed, origins);
    assert.deepEqual(p4.sourceOffset, { x: 460, y: 460 });
    assert.deepEqual(p4.targetOffset, { x: 324, y: -324 });
  });

  it("falls back to { x: 0, y: 0 } when a plate is missing or has a non-finite entry in sourcePlateOrigins", () => {
    const xlBed = { width: 360, height: 360 };
    const plates = [1, 2, 3, 4];
    const origins: Record<number, [number, number]> = {
      1: [460, 0],
      2: [Number.NaN, 460],
      3: [460, Number.POSITIVE_INFINITY],
      4: [Number.NEGATIVE_INFINITY, 0],
    };

    // Missing plate (plate 5 not in origins)
    const missing = computePlateGridOffsets(plates, 5, xlBed, u1Bed, origins);
    assert.deepEqual(missing.sourceOffset, { x: 0, y: 0 });

    // Non-finite entries fall back to zero
    assert.deepEqual(computePlateGridOffsets(plates, 2, xlBed, u1Bed, origins).sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 3, xlBed, u1Bed, origins).sourceOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 4, xlBed, u1Bed, origins).sourceOffset, { x: 0, y: 0 });
  });

  it("uses targetPlateOrigins (report.plateOrigins) for targetOffset when provided, keeping empty plates in place", () => {
    // 3-plate project where plate 2 is empty: platesList = [1, 3]
    // Without targetPlateOrigins, fallback puts plate 3 at index 1 -> (324, 0).
    // With targetPlateOrigins from report.plateOrigins, plate 3 is at (0, -324).
    const plates = [1, 3];
    const plateOrigins: Record<number, [number, number]> = {
      1: [0, 0],
      2: [324, 0],
      3: [0, -324],
    };

    const p1 = computePlateGridOffsets(plates, 1, bambuBed, u1Bed, null, plateOrigins);
    assert.deepEqual(p1.targetOffset, { x: 0, y: 0 });

    const p2 = computePlateGridOffsets(plates, 2, bambuBed, u1Bed, null, plateOrigins);
    assert.deepEqual(p2.targetOffset, { x: 324, y: 0 });

    const p3 = computePlateGridOffsets(plates, 3, bambuBed, u1Bed, null, plateOrigins);
    assert.deepEqual(p3.targetOffset, { x: 0, y: -324 });

    // Without targetPlateOrigins, falls back to today's compacted math:
    const p3Fallback = computePlateGridOffsets(plates, 3, bambuBed, u1Bed);
    assert.deepEqual(p3Fallback.targetOffset, { x: 324, y: 0 });
  });

  it("falls back to { x: 0, y: 0 } when a plate is missing or has a non-finite entry in targetPlateOrigins", () => {
    const plates = [1, 2, 3, 4];
    const plateOrigins: Record<number, [number, number]> = {
      1: [324, -324],
      2: [Number.NaN, -324],
      3: [324, Number.POSITIVE_INFINITY],
      4: [Number.NEGATIVE_INFINITY, 0],
    };

    assert.deepEqual(computePlateGridOffsets(plates, 5, bambuBed, u1Bed, null, plateOrigins).targetOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 2, bambuBed, u1Bed, null, plateOrigins).targetOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 3, bambuBed, u1Bed, null, plateOrigins).targetOffset, { x: 0, y: 0 });
    assert.deepEqual(computePlateGridOffsets(plates, 4, bambuBed, u1Bed, null, plateOrigins).targetOffset, { x: 0, y: 0 });
  });

  it("sizes the source grid from plateCount when provided (empty plate at the end changes column count)", () => {
    // 5 plates in the file: plates 1..4 used, plate 5 empty.
    // Bambu Studio uses ceil(sqrt(5)) = 3 columns, so plate 3 is col 2, row 0: (2 * 256 * 1.2, 0) = (614.4, 0),
    // and plate 4 is col 0, row 1: (0, -307.2).
    const plates = [1, 2, 3, 4];

    const p3WithCount = computePlateGridOffsets(plates, 3, bambuBed, u1Bed, null, null, 5);
    assertClose(p3WithCount.sourceOffset.x, 2 * 256 * 1.2);
    assertClose(p3WithCount.sourceOffset.y, 0);

    const p4WithCount = computePlateGridOffsets(plates, 4, bambuBed, u1Bed, null, null, 5);
    assertClose(p4WithCount.sourceOffset.x, 0);
    assertClose(p4WithCount.sourceOffset.y, -307.2);

    // Without plateCount (or with invalid plateCount), falls back to today's 2-column math from plates [1..4]:
    const p3Fallback = computePlateGridOffsets(plates, 3, bambuBed, u1Bed);
    assertClose(p3Fallback.sourceOffset.x, 0);
    assertClose(p3Fallback.sourceOffset.y, -307.2);

    for (const bad of [null, undefined, 0, -5, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p3Bad = computePlateGridOffsets(plates, 3, bambuBed, u1Bed, null, null, bad);
      assertClose(p3Bad.sourceOffset.x, 0);
      assertClose(p3Bad.sourceOffset.y, -307.2);
    }
  });
});

describe("resolveSourceVendor", () => {
  it("resolves every known source vendor in SOURCE_VENDORS", () => {
    for (const vendor of SOURCE_VENDORS) {
      assert.equal(typeof VENDOR_NAMES[vendor], "string");
      assert.ok(VENDOR_NAMES[vendor].length > 0);
      if (vendor !== "other") {
        assert.deepEqual(resolveSourceVendor(vendor, "Custom Model"), {
          id: vendor,
          name: VENDOR_NAMES[vendor],
        });
      }
    }
    assert.deepEqual(resolveSourceVendor("other"), { id: "other", name: "Source" });
    assert.deepEqual(resolveSourceVendor("other", "Voron 2.4"), {
      id: "other",
      name: "Voron 2.4",
    });
  });

  it("shows the same maker name as 'other' for a source vendor not in SOURCE_VENDORS", () => {
    const unknownVendor = "future-maker";
    assert.ok(!(SOURCE_VENDORS as readonly string[]).includes(unknownVendor));

    assert.equal(
      resolveSourceVendor(unknownVendor).name,
      resolveSourceVendor("other").name,
    );
    assert.equal(resolveSourceVendor(unknownVendor).name, "Source");

    assert.equal(
      resolveSourceVendor(unknownVendor, "Future Printer X1").name,
      resolveSourceVendor("other", "Future Printer X1").name,
    );
    assert.equal(
      resolveSourceVendor(unknownVendor, "Future Printer X1").name,
      "Future Printer X1",
    );
  });
});
