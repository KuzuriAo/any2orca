// SPDX-License-Identifier: MIT
// The swap plan for a plate with more filaments than toolheads, and the note that says it. The first case is a real
// project's plate (five filaments, a pause at 13 mm) as the owner printed it on a U1: filament 3 went in at the pause
// in filament 5's place. Its numbers here are the ones the reading gives for that file, which Snapmaker Orca 2.4.1's
// G-code bears out (filament 5's last layer 134, filament 3's first 157, the pause written before layer 137).
import { describe, expect, it } from "vitest";
import type { PlateFilaments, PlateFilamentUse } from "./archive/plateFilaments.js";
import { plateFilamentNotes } from "./explain/plateNotes.js";
import { planFilamentSwaps } from "./swapPlan.js";

const use = (slot: number, from: number, to: number, firstLayer?: number, lastLayer?: number): PlateFilamentUse => ({
  slot,
  uses: ["paint"],
  from,
  to,
  ...(firstLayer !== undefined ? { firstLayer, lastLayer: lastLayer! } : {}),
});

/** The printed project's plate: filament 5 ends at 12.656 mm, filament 3 starts at 14.648 mm, its pause at 13 mm. */
const cow: PlateFilaments = {
  plate: 1,
  filaments: [use(1, 0, 21.513, 1, 228), use(2, 0, 19.199, 1, 206), use(3, 14.648, 21.206, 156, 225), use(4, 0, 18.231, 1, 197), use(5, 0, 12.656, 1, 134)],
  mostAtOnce: 4,
  pauses: [{ height: 13, layer: 138, stopsBefore: 137, kind: "pause" }],
};

const noteFor = (plate: PlateFilaments) => {
  const plan = planFilamentSwaps(plate, 4);
  return plateFilamentNotes([plate], plate.filaments.length, 4, new Map(plan ? [[plate.plate, plan]] : []))[0]!.text;
};

describe("the swap plan", () => {
  it("puts the filament that starts later on the toolhead whose filament is done, with the pause already in the file", () => {
    expect(planFilamentSwaps(cow, 4)).toEqual({
      plate: 1,
      load: [1, 2, 4, 5],
      shared: [{ filaments: [5, 3], swaps: [{ outgoing: 5, incoming: 3, after: 12.656, before: 14.648, pauseLayers: { first: 135, last: 156 }, pauses: [cow.pauses![0]] }] }],
      otherPauses: [],
    });
    expect(noteFor(cow)).toBe(
      "Plate 1 uses 5 filaments but no more than 4 at the same height, so two of them share a toolhead, with a pause between. " +
        "Filament 5 prints up to layer 134 and filament 3 from layer 156, and the project already has a pause at layer 138, between the two. " +
        "These layer numbers are worked out from the file, not from a slice, so check the sliced preview before you print: filament 5 should end below the pause and filament 3 start above it. " +
        "If you change the layer height, the numbers change too. " +
        "Load filaments 1, 2, 4 and 5 to start. " +
        "When you send the print, filament 3 isn't loaded yet, so it can't be matched by its color: put it on the same toolhead as filament 5 yourself. " +
        "At the pause, unload filament 5, load filament 3 and resume.",
    );
  });

  it("says where to add the pause when the file has none there, and lists a pause elsewhere without judging it", () => {
    const plate: PlateFilaments = { ...cow, pauses: [{ height: 5, layer: 40, stopsBefore: 40, kind: "pause" }] };
    const plan = planFilamentSwaps(plate, 4)!;
    expect(plan.shared[0]!.swaps[0]!.pauses).toEqual([]);
    expect(plan.otherPauses).toEqual(plate.pauses);
    expect(noteFor(plate)).toContain("Filament 5 prints up to layer 134 and filament 3 from layer 156. In Snapmaker Orca, add a pause on a layer from 135 to 156. The project also has a pause at layer 40. These layer numbers are worked out from the file");
  });

  it("counts a pause by the layer the print stops before, not the one the slider shows it on", () => {
    // Stored between layers 134 and 135, nearer 134: the slicer stops before 134, while filament 5 is still printing.
    const plate: PlateFilaments = { ...cow, pauses: [{ height: 12.72, layer: 135, stopsBefore: 134, kind: "pause" }] };
    expect(planFilamentSwaps(plate, 4)!.shared[0]!.swaps[0]!.pauses).toEqual([]);
  });

  it("gives the one layer when the gap is a single layer", () => {
    const plate: PlateFilaments = { ...cow, filaments: cow.filaments.map((f) => (f.slot === 3 ? use(3, 12.7, 21.206, 135, 225) : f)), pauses: [] };
    expect(noteFor(plate)).toContain("In Snapmaker Orca, add a pause on layer 135.");
  });

  it("chains three filaments on one toolhead, and shares a second toolhead, with a sentence each", () => {
    const plate: PlateFilaments = {
      plate: 2,
      filaments: [use(1, 0, 8, 1, 40), use(2, 0, 12, 1, 60), use(3, 0, 30, 1, 150), use(4, 0, 30, 1, 150), use(5, 9, 20, 46, 100), use(6, 13, 30, 66, 150), use(7, 21, 30, 106, 150)],
      mostAtOnce: 4,
      pauses: [{ height: 8.6, layer: 43, stopsBefore: 43, kind: "pause" }],
    };
    const plan = planFilamentSwaps(plate, 4)!;
    expect(plan.load).toEqual([1, 2, 3, 4]);
    expect(plan.shared.map((h) => h.filaments)).toEqual([[1, 5, 7], [2, 6]]);
    expect(noteFor(plate)).toBe(
      "Plate 2 uses 7 filaments but no more than 4 at the same height, so some of them share a toolhead, with a pause between each change. " +
        "Filaments 1, 5 and 7 share one: filament 1 prints up to layer 40, filament 5 from layer 46 to layer 100 and filament 7 from layer 106. " +
        "Filaments 2 and 6 share another: filament 2 prints up to layer 60 and filament 6 from layer 66. " +
        "The project already has a pause at layer 43, between filaments 1 and 5. " +
        "In Snapmaker Orca, add a pause on a layer from 61 to 66, between filaments 2 and 6, and one on a layer from 101 to 106, between filaments 5 and 7. " +
        "These layer numbers are worked out from the file, not from a slice, so check the sliced preview before you print: at each pause, the filament that is done should end below it and the next one start above it. " +
        "If you change the layer height, the numbers change too. " +
        "Load filaments 1, 2, 3 and 4 to start. " +
        "When you send the print, filaments 5, 6 and 7 aren't loaded yet, so they can't be matched by their color: put 5 and 7 on the same toolhead as filament 1, and 6 on the same toolhead as filament 2, yourself. " +
        "At each pause, unload the filament that is done, load the next one on that toolhead and resume.",
    );
  });

  it("uses a toolhead nothing has printed on yet before sharing one", () => {
    // Three filaments from the start, a fourth from 10 mm, a fifth from 20 mm: only the fifth shares.
    const plate: PlateFilaments = { plate: 1, filaments: [use(1, 0, 30, 1, 150), use(2, 0, 30, 1, 150), use(3, 0, 5, 1, 25), use(4, 10, 30, 51, 150), use(5, 20, 30, 101, 150)], mostAtOnce: 4 };
    expect(planFilamentSwaps(plate, 4)!.shared.map((h) => h.filaments)).toEqual([[3, 5]]);
  });

  it("gives heights when the plate's layers aren't known", () => {
    const plate: PlateFilaments = { ...cow, filaments: cow.filaments.map((f) => use(f.slot, f.from, f.to)), pauses: [{ height: 13, kind: "pause" }] };
    const plan = planFilamentSwaps(plate, 4)!;
    expect(plan.shared[0]!.swaps[0]!.pauseLayers).toBeUndefined();
    expect(plan.shared[0]!.swaps[0]!.pauses).toEqual(plate.pauses);
    expect(noteFor(plate)).toContain(
      "Filament 5 prints up to 12.66 mm and filament 3 from 14.65 mm, and the project already has a pause at 13 mm, between the two. " +
        "These heights are worked out from the file, not from a slice, so check the sliced preview before you print: filament 5 should end below the pause and filament 3 start above it. Load filaments",
    );
    // No layer numbers here, so nothing about them changing.
    expect(noteFor(plate)).not.toContain("layer height");
  });

  it("has no plan for a plate that fits on the toolheads, or one that needs more at once than there are", () => {
    expect(planFilamentSwaps({ ...cow, filaments: cow.filaments.slice(0, 4) }, 4)).toBeNull();
    expect(planFilamentSwaps({ ...cow, mostAtOnce: 5 }, 4)).toBeNull();
    expect(planFilamentSwaps(cow, 0)).toBeNull();
    // A support filament used the whole height takes a toolhead for the whole print.
    const supported: PlateFilaments = { ...cow, filaments: [...cow.filaments, { slot: 6, uses: ["support"], from: 0, to: 21.513, firstLayer: 1, lastLayer: 228 }], mostAtOnce: 5 };
    expect(planFilamentSwaps(supported, 4)).toBeNull();
  });
});
