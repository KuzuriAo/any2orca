// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { computeShifts } from "./computeShifts.js";

// 270x271 bed -> center (135, 135.5), pitchX = 270*1.2 = 324, pitchY = -271*1.2 = -325.2
const orcaPrintableArea = ["0x0", "270x0", "270x271", "0x271"];

describe("computeShifts", () => {
  it("centers a single plate with one object directly on the Orca bed center", () => {
    const { shifts } = computeShifts(
      [{ id: "A", plate: 1, bbox: [10, 20, 10, 20] }],
      orcaPrintableArea,
      null,
      null,
    );
    // bbox center (15, 15) -> target (135, 135.5) -> shift (120, 120.5)
    expect(shifts.A).toEqual([120, 120.5]);
  });

  it("lays out multiple plates in a square grid using the Orca bed's own pitch", () => {
    const { shifts } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [10, 20, 10, 20] },
        { id: "B", plate: 2, bbox: [10, 20, 10, 20] },
      ],
      orcaPrintableArea,
      null,
      null,
    );
    expect(shifts.A).toEqual([120, 120.5]); // col 0, row 0 -> target (135, 135.5)
    expect(shifts.B[0]).toBeCloseTo(444, 6); // col 1, row 0 -> target (135+324, 135.5)
    expect(shifts.B[1]).toBeCloseTo(120.5, 6);
  });

  it("shifts every object on a plate by the same group-level offset", () => {
    const { shifts } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 10, 0, 10] },
        { id: "B", plate: 1, bbox: [20, 30, 20, 30] },
      ],
      orcaPrintableArea,
      null,
      null,
    );
    expect(shifts.A).toEqual(shifts.B);
  });

  it("targets the Orca bed center directly for an unassigned object (no plate field)", () => {
    const { shifts } = computeShifts([{ id: "C", bbox: [45, 55, 55, 65] }], orcaPrintableArea, null, null);
    // bbox center (50, 60) -> target (135, 135.5) -> shift (85, 75.5)
    expect(shifts.C).toEqual([85, 75.5]);
  });

  it("uses fallback_xy as the position when bbox is null", () => {
    const { shifts } = computeShifts(
      [{ id: "D", bbox: null, fallbackXy: [50, 60] }],
      orcaPrintableArea,
      null,
      null,
    );
    expect(shifts.D).toEqual([85, 75.5]);
  });

  it("treats a missing bbox with no fallback_xy as (0,0) and warns", () => {
    const { shifts, warnings } = computeShifts([{ id: "E", bbox: null }], orcaPrintableArea, null, null);
    expect(shifts.E).toEqual([135, 135.5]);
    expect(warnings.some((w) => w.includes("no bbox and no fallback_xy"))).toBe(true);
  });

  it("does not scale a single-object plate even when clearance radii differ", () => {
    const { shifts } = computeShifts(
      [{ id: "A", plate: 1, bbox: [0, 10, 0, 10] }],
      orcaPrintableArea,
      10,
      20,
    );
    expect(shifts.A).toEqual([130, 130.5]); // no extra scaling term applied
  });

  it("scales a multi-object plate apart from its centroid when Orca's clearance radius is larger", () => {
    const { shifts, warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 10, 0, 10] }, // center (5, 5)
        { id: "B", plate: 1, bbox: [20, 30, 0, 10] }, // center (25, 5)
      ],
      orcaPrintableArea,
      10,
      20, // ratio = 2.0, plenty of room on a 270x271 bed -> unclamped
    );
    // centroid (15, 5); base shift (120, 130.5); extra = (ratio-1)*(objCenter - centroid)
    expect(shifts.A[0]).toBeCloseTo(110, 6); // 120 + 1*(5-15)
    expect(shifts.A[1]).toBeCloseTo(130.5, 6);
    expect(shifts.B[0]).toBeCloseTo(130, 6); // 120 + 1*(25-15)
    expect(shifts.B[1]).toBeCloseTo(130.5, 6);
    expect(warnings.some((w) => w.includes("spacing scaled 2.0000x"))).toBe(true);
  });

  it("does not scale when the Bambu clearance radius is already >= Orca's", () => {
    const { shifts } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 10, 0, 10] },
        { id: "B", plate: 1, bbox: [20, 30, 0, 10] },
      ],
      orcaPrintableArea,
      20,
      10, // orca radius smaller -- no scaling pass at all
    );
    // No scaling pass runs at all -- both objects get the same uniform group-level shift.
    expect(shifts.A).toEqual([120, 130.5]);
    expect(shifts.B).toEqual([120, 130.5]);
  });

  it("clamps the scale ratio to fit the bed and flags it in a distinct WARN-prefixed entry", () => {
    // Small bed (with the 5mm edge margin taken out, still some room to
    // partially grow) so the ideal 5x scale would push objects off it.
    const tinyBed = ["0x0", "80x0", "80x80", "0x80"]; // center (40, 40)
    const { warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 10, 0, 10] },
        { id: "B", plate: 1, bbox: [40, 50, 0, 10] },
      ],
      tinyBed,
      10,
      50, // ratio = 5.0, should get clamped
    );
    // The routine "spacing scaled" line notes it was clamped...
    expect(warnings.some((w) => w.includes("spacing scaled") && w.includes("clamped, see below"))).toBe(true);
    // ...and a separate WARN-prefixed entry actually explains it (this is
    // the marker runConvertPipeline filters user-facing warnings on).
    expect(warnings.some((w) => w.includes("WARN:") && w.includes("clamped") && w.includes("Review spacing"))).toBe(true);
  });

  it("does not push a bed-fit warning when a plate's footprint fits the target bed", () => {
    const { warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 10, 0, 10] },
        { id: "B", plate: 1, bbox: [20, 30, 20, 30] },
      ],
      orcaPrintableArea,
      null,
      null,
    );
    expect(warnings.some((w) => w.includes("combined footprint"))).toBe(false);
  });

  it("silently shrinks a too-spread-out plate to fit the target bed when there's room to do so without objects touching", () => {
    // Originally reproduced with a real Bambu H2C file (330x320mm bed vs
    // the U1's 270x270mm) before the shrink-to-fit pass existed -- these
    // two objects have plenty of slack, so the pass fully resolves the
    // overflow with no warning needed at all, not even the "spacing
    // tightened" note (which is itself routine/non-actionable).
    const u1Bed = ["0x0", "270x0", "270x270", "0x270"];
    const { shifts, warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [20, 60, 20, 60] },
        { id: "B", plate: 1, bbox: [270, 310, 270, 310] },
      ],
      u1Bed,
      96, // H2C's own clearance radius -- larger than the U1's, so the grow pass never engages
      72.5,
    );
    expect(warnings.some((w) => w.includes("combined footprint"))).toBe(false);
    expect(warnings.some((w) => w.includes("WARN:"))).toBe(false);
    // Both objects now fit within the 270mm bed, kept 5mm clear of the true edge.
    expect(shifts.A[0] + 20).toBeCloseTo(5, 6); // A's original left edge (20) shifted to land at the 5mm margin
    expect(shifts.B[0] + 310).toBeCloseTo(265, 6); // B's original right edge (310) shifted to land at 270-5mm
  });

  it("warns when shrinking to fit the bed leaves two objects touching within tolerance", () => {
    // Objects wide enough (44.8mm each) that fitting both into a 100mm bed
    // with a 5mm edge margin on each side (90mm usable) -- with each
    // object's outward edge pinned to the usable window's edge, which is
    // what the clamp solves for -- leaves only a 0.4mm gap between them,
    // under the 2mm touching tolerance.
    const bed = ["0x0", "100x0", "100x100", "0x100"];
    const { shifts, warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [-12.4, 32.4, 40, 60] }, // 44.8mm wide, center (10, 50)
        { id: "B", plate: 1, bbox: [167.6, 212.4, 40, 60] }, // 44.8mm wide, center (190, 50)
      ],
      bed,
      null,
      null,
    );
    expect(warnings.some((w) => w.includes("combined footprint"))).toBe(false); // it does fit, just barely
    const touchWarning = warnings.find((w) => w.includes("touching or overlapping") || w.includes("apart"));
    expect(touchWarning).toBeDefined();
    expect(touchWarning).toContain("WARN:");
    expect(touchWarning).toContain("object A");
    expect(touchWarning).toContain("object B");
    // Confirm the actual final gap is indeed under the 2mm touching
    // tolerance, and that both objects are kept the 5mm edge margin clear
    // of the bed too.
    const aMinX = -12.4 + shifts.A[0];
    const aMaxX = 32.4 + shifts.A[0];
    const bMinX = 167.6 + shifts.B[0];
    const bMaxX = 212.4 + shifts.B[0];
    expect(bMinX - aMaxX).toBeLessThan(2);
    expect(bMinX - aMaxX).toBeGreaterThan(0); // not actually overlapping, just close
    expect(aMinX).toBeGreaterThanOrEqual(5 - 0.01);
    expect(bMaxX).toBeLessThanOrEqual(95 + 0.01);
  });

  it("never pulls objects into each other to fit the bed; it stops short and says the plate is too big", () => {
    // Two 60mm objects 100mm apart (center to center) don't fit 90mm of usable bed side by side at any
    // spacing; pulling them together far enough to fit would overlap them, which Snapmaker Orca refuses to slice.
    const bed = ["0x0", "100x0", "100x100", "0x100"];
    const { shifts, warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [0, 60, 40, 60] },
        { id: "B", plate: 1, bbox: [100, 160, 40, 60] },
      ],
      bed,
      null,
      null,
    );
    const aMaxX = 60 + shifts.A[0];
    const bMinX = 100 + shifts.B[0];
    expect(bMinX - aMaxX).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("combined footprint"))).toBe(true);
  });

  it("doesn't say objects were pulled together on a plate that wasn't shrunk", () => {
    // Two objects already touching in the source, on a plate with plenty of room.
    const { warnings } = computeShifts(
      [
        { id: "A", plate: 1, bbox: [100, 110, 100, 110] },
        { id: "B", plate: 1, bbox: [110, 120, 100, 110] },
      ],
      orcaPrintableArea,
      null,
      null,
    );
    expect(warnings.filter((w) => w.includes("pulled together"))).toEqual([]);
  });

  it("treats a 91mm-wide object as not fitting a 100mm bed, proving the 5mm edge margin is real", () => {
    // Without any margin, a 91mm object comfortably fits a 100mm bed (9mm
    // to spare). With the 5mm-per-side margin, the usable width is only
    // 90mm -- 1mm too little -- so this must be flagged as not fitting.
    // No scaling pass involved (single object, no clearance radii
    // supplied), so this isolates that the margin applies unconditionally,
    // not just as a side effect of the shrink-to-fit clamp.
    const smallBed = ["0x0", "100x0", "100x100", "0x100"];
    const { warnings } = computeShifts([{ id: "A", plate: 1, bbox: [0, 91, 40, 60] }], smallBed, null, null);
    const warning = warnings.find((w) => w.includes("combined footprint"));
    expect(warning).toBeDefined();
    expect(warning).toContain("usable printable area");
    expect(warning).toContain("5mm");
  });

  it("warns on a single oversized object even with no plate metadata -- shrinking can't help a lone object", () => {
    const smallBed = ["0x0", "100x0", "100x100", "0x100"];
    const { warnings } = computeShifts([{ id: "A", bbox: [0, 150, 0, 50] }], smallBed, null, null);
    expect(warnings.some((w) => w.includes("combined footprint") && w.includes("WARN:"))).toBe(true);
  });

  it("clamps a second plate's spacing correctly using its own grid position", () => {
    // The clamp now explicitly windows each plate around its own grid
    // target rather than the bed's absolute bounds -- this is a clarity/
    // robustness improvement (removes an implicit reliance on the bed
    // always being symmetric around its own center), not a behavior
    // change: the two formulations are mathematically equivalent given
    // that invariant, which always holds for this codebase's rectangular
    // beds. This test just confirms plate 2 still clamps sanely.
    const bed = ["0x0", "100x0", "100x100", "0x100"]; // 100x100, pitchX = 120
    const { shifts } = computeShifts(
      [
        { id: "P1", plate: 1, bbox: [45, 55, 45, 55] },
        { id: "A", plate: 2, bbox: [0, 10, 45, 55] },
        { id: "B", plate: 2, bbox: [90, 100, 45, 55] },
      ],
      bed,
      10,
      50, // ratio = 5.0 -- plate 2's footprint already fills its own window exactly, so this clamps to 1.0x
    );
    // Plate 2's target is (50 + 120, 50) = (170, 50); its own window is
    // [120, 220] x [0, 100]. Neither object's final position should fall
    // outside that window.
    const [dxA] = shifts.A;
    const [dxB] = shifts.B;
    expect(0 + dxA).toBeGreaterThanOrEqual(120 - 0.01);
    expect(100 + dxB).toBeLessThanOrEqual(220 + 0.01);
  });
});
