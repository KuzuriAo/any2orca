// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { spaceReviewNotes } from "./spaceNotes.js";

const plate = (number: number, count: number) => ({ plate: number, filaments: Array.from({ length: count }, (_, i) => ({ slot: i + 1, uses: ["object"], from: 0, to: 10 })), mostAtOnce: Math.min(count, 2) });
const U1 = { print: "0.20mm Standard @Snapmaker U1 (0.4 nozzle)", printer: "Snapmaker U1 (0.4 nozzle)" };

describe("what Snapmaker Space's review looks at besides filament brands", () => {
  it("says nothing for a file with at most four colors a plate and no other maker in a preset name", () => {
    expect(spaceReviewNotes([plate(1, 4), plate(2, 1)], { ...U1, filaments: [{ slot: 1, name: "Snapmaker PLA SnapSpeed @U1", unchanged: false }, { slot: 2, name: "Polymaker General PLA Family @U1", unchanged: false }] })).toEqual([]);
  });

  it("names the plate with more than four colors, whatever they need at once", () => {
    expect(spaceReviewNotes([plate(1, 3), plate(2, 5)], { ...U1, filaments: [] })).toEqual([
      { slots: [], text: "Snapmaker Space's review turns down more than four colors on one plate unless the print pauses at filament changes or uses Full Spectrum, and plate 2 uses 5." },
    ]);
    expect(spaceReviewNotes([plate(1, 6), plate(2, 5), plate(3, 2)], { ...U1, filaments: [] })[0]!.text).toMatch(/and plates 1 and 2 use more\.$/);
  });

  it("names a preset that still holds another maker's brand or printer, but not a filament the naming option already reported", () => {
    const notes = spaceReviewNotes([plate(1, 2)], {
      print: "0.20mm Standard @BBL X1C",
      printer: "Snapmaker U1 (0.4 nozzle)",
      filaments: [
        { slot: 1, name: "Generic PLA @BBL X1C", unchanged: false },
        { slot: 2, name: "Bambu Support For PLA @BBL X1C", unchanged: true },
        { slot: 3, name: "Generic PLA", unchanged: false },
      ],
    });
    expect(notes).toEqual([
      { slots: [1], text: 'Snapmaker Space\'s review turns down a preset name that holds another maker\'s brand or printer model, and this file has the print preset "0.20mm Standard @BBL X1C", filament 1\'s "Generic PLA @BBL X1C".' },
    ]);
  });

  it("is safe with values that aren't names", () => {
    expect(spaceReviewNotes([], { print: 5, printer: null, filaments: [{ slot: 1, name: "", unchanged: false }] })).toEqual([]);
    const long = spaceReviewNotes([], { print: `Creality ${"x".repeat(5000)}`, printer: undefined, filaments: Array.from({ length: 50 }, (_, i) => ({ slot: i + 1, name: "Bambu PLA", unchanged: false })) });
    expect(long[0]!.text.length).toBeLessThan(900);
    expect(long[0]!.text).toContain("and 45 more");
  });
});
