// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { PlateFilaments } from "../archive/plateFilaments.js";
import { layerHeightNotes, layerLimitsOf } from "./layerNotes.js";

type Variable = { object: string; thinnest: number; thickest: number };
const plate = (n: number, layerHeights?: { thinnest: number; thickest: number; variable?: Variable[] }): PlateFilaments => ({ plate: n, filaments: [], mostAtOnce: 0, ...(layerHeights ? { layerHeights } : {}) });
const SIX = { min: 0.12, max: 0.42 };
const STAY = "The layers stay as the creator set them, and Snapmaker Orca slices them that way without a warning.";

describe("the note about layers a nozzle doesn't support", () => {
  it("says layers thinner than the nozzle's minimum stay as the creator set them, and what to set instead", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.09, thickest: 0.28 })], "0.6", SIX)).toEqual([
      `The project has layers as thin as 0.09 mm. The U1's 0.6 mm nozzle supports layers from 0.12 to 0.42 mm. ${STAY} To change that, set the layers to heights in that range in Snapmaker Orca.`,
    ]);
  });

  it("says the same for layers thicker than the maximum, and for both at once in two notes", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.2, thickest: 0.25 })], "0.2", { min: 0.04, max: 0.14 })).toEqual([
      `The project has layers as thick as 0.25 mm. The U1's 0.2 mm nozzle supports layers from 0.04 to 0.14 mm. ${STAY} To change that, set the layers to heights in that range in Snapmaker Orca.`,
    ]);
    expect(layerHeightNotes([plate(1, { thinnest: 0.03, thickest: 0.2 })], "0.2", { min: 0.04, max: 0.14 })).toHaveLength(2);
  });

  it("takes the thinnest and thickest across plates, and says nothing when every layer is in range", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.12, thickest: 0.2 }), plate(2, { thinnest: 0.1, thickest: 0.2 })], "0.6", SIX)[0]).toContain("as thin as 0.1 mm");
    expect(layerHeightNotes([plate(1, { thinnest: 0.12, thickest: 0.42 })], "0.6", SIX)).toEqual([]);
    // Heights are sums of floats: a hair past the limit isn't a layer outside it.
    expect(layerHeightNotes([plate(1, { thinnest: 0.11999, thickest: 0.42001 })], "0.6", SIX)).toEqual([]);
    expect(layerHeightNotes([plate(1)], "0.6", SIX)).toEqual([]);
  });

  it("names the objects whose variable layer heights are outside the range, since a layer height set in the slicer doesn't clear them", () => {
    const names = new Map([["2", "Cow"], ["5", "Base"], ["7", "Tail"]]);
    const variable = [{ object: "2", thinnest: 0.09, thickest: 0.3 }, { object: "5", thinnest: 0.1, thickest: 0.3 }, { object: "7", thinnest: 0.2, thickest: 0.3 }];
    expect(layerHeightNotes([plate(1, { thinnest: 0.09, thickest: 0.3, variable })], "0.6", SIX, names)).toEqual([
      `The project has layers as thin as 0.09 mm. The U1's 0.6 mm nozzle supports layers from 0.12 to 0.42 mm. ${STAY} ` +
        "The creator made the layer height vary on Cow and Base (variable layer heights), and a layer height set in Snapmaker Orca doesn't clear that: reset the variable layer heights on those objects, or apply them again with settings that suit this nozzle. The file doesn't say which settings the creator used.",
    ]);
    // One object, and other thin layers that no variable layer heights explain.
    const other = layerHeightNotes([plate(1, { thinnest: 0.08, thickest: 0.3, variable: [{ object: "2", thinnest: 0.1, thickest: 0.3 }] })], "0.6", SIX, names)[0]!;
    expect(other).toContain("vary on Cow (variable layer heights)");
    expect(other).toContain("reset the variable layer heights on that object");
    expect(other.endsWith("To change the other layers, set them to heights in that range in Snapmaker Orca.")).toBe(true);
  });

  it("cleans and cuts the names it quotes from the file, and names at most three objects", () => {
    const names = new Map([["1", "Evil\u0007\nname " + "x".repeat(100)]]);
    const many = Array.from({ length: 5 }, (_, i) => ({ object: String(i + 1), thinnest: 0.05, thickest: 0.2 }));
    const note = layerHeightNotes([plate(1, { thinnest: 0.05, thickest: 0.2, variable: many })], "0.6", SIX, names)[0]!;
    expect(note).toContain("object 2, object 3 and 2 more");
    expect(note).not.toMatch(/[\u0000-\u001f]/);
    expect(note.match(/vary on (.*?) \(variable/)![1]!.length).toBeLessThan(120);
  });

  it("says nothing when the nozzle's limits aren't usable numbers", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.01, thickest: 9 })], "0.6", { min: 0, max: 0.42 })).toEqual([]);
    expect(layerHeightNotes([plate(1, { thinnest: 0.01, thickest: 9 })], "0.6", { min: 0.3, max: 0.1 })).toEqual([]);
    expect(layerLimitsOf({ min_layer_height: ["0.12", "0.12"], max_layer_height: ["0.42", "0.42"] })).toEqual({ min: 0.12, max: 0.42 });
    expect(layerLimitsOf({ min_layer_height: "x", max_layer_height: ["0.42"] })).toBeNull();
    expect(layerLimitsOf({})).toBeNull();
  });
});
