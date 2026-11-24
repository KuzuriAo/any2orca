// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { planFilamentSwaps, type SwapPlan } from "../swapPlan.js";
import { spaceReviewNotes } from "./spaceNotes.js";

const plate = (number: number, count: number) => ({ plate: number, filaments: Array.from({ length: count }, (_, i) => ({ slot: i + 1, uses: ["object"], from: 0, to: 10 })), mostAtOnce: Math.min(count, 2) });
const RULE = "To publish on Snapmaker Space: its review rules list more than four colors on one plate as a reason to turn a file down, unless the print pauses at filament changes or uses Full Spectrum.";

/** A plan for a plate whose filament 4 gives its toolhead to filament 5, with or without a pause between them already. */
const plan = (number: number, paused: boolean): SwapPlan => ({
  plate: number,
  load: [1, 2, 3, 4],
  shared: [{ filaments: [4, 5], swaps: [{ outgoing: 4, incoming: 5, after: 5, before: 6, pauses: paused ? [{ height: 5.5, kind: "pause" }] : [] }] }],
  otherPauses: [],
});

describe("what Snapmaker Space's review rules look at besides filament brands", () => {
  it("says nothing for a file with at most four colors a plate", () => {
    expect(spaceReviewNotes([plate(1, 4), plate(2, 1)])).toEqual([]);
  });

  it("names the plates with more than four colors, as the rules' reason and for publishing, not as what Space does", () => {
    expect(spaceReviewNotes([plate(1, 3), plate(2, 5)])).toEqual([{ slots: [], text: `${RULE} Plate 2 uses 5.` }]);
    expect(spaceReviewNotes([plate(1, 6), plate(2, 5), plate(3, 2)])[0]!.text).toBe(`${RULE} Plates 1 and 2 use more than four.`);
  });

  it("leaves out a plate that already pauses at every filament change, the rules' own exception, but not one still missing a pause", () => {
    expect(spaceReviewNotes([plate(1, 5)], [plan(1, true)])).toEqual([]);
    expect(spaceReviewNotes([plate(1, 5)], [plan(1, false)])[0]!.text).toBe(`${RULE} Plate 1 uses 5.`);
    // A plate with no plan (more than four at once, or printed object by object) is listed.
    expect(spaceReviewNotes([plate(1, 5), plate(2, 6)], [plan(1, true)])[0]!.text).toBe(`${RULE} Plate 2 uses 6.`);
  });

  it("goes by the real planner: the printed five-color plate with its pause already in the file isn't listed, and is without the pause", () => {
    // The plate the owner printed on a U1 (swapPlan.test.ts): filament 3 goes in at the 13 mm pause in filament 5's place.
    const use = (slot: number, from: number, to: number, firstLayer: number, lastLayer: number) => ({ slot, uses: ["paint"], from, to, firstLayer, lastLayer });
    const cow = {
      plate: 1,
      filaments: [use(1, 0, 21.513, 1, 228), use(2, 0, 19.199, 1, 206), use(3, 14.648, 21.206, 156, 225), use(4, 0, 18.231, 1, 197), use(5, 0, 12.656, 1, 134)],
      mostAtOnce: 4,
      pauses: [{ height: 13, layer: 138, stopsBefore: 137, kind: "pause" as const }],
    };
    const withPause = planFilamentSwaps(cow, 4)!;
    expect(spaceReviewNotes([cow], [withPause])).toEqual([]);
    const { pauses: _pauses, ...unpaused } = cow;
    expect(spaceReviewNotes([unpaused], [planFilamentSwaps(unpaused, 4)!])[0]!.text).toBe(`${RULE} Plate 1 uses 5.`);
  });
});
