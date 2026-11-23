// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { PlateFilaments } from "../archive/plateFilaments.js";
import { layerHeightNotes, layerLimitsOf } from "./layerNotes.js";

const plate = (n: number, layerHeights?: { thinnest: number; thickest: number }): PlateFilaments => ({ plate: n, filaments: [], mostAtOnce: 0, ...(layerHeights ? { layerHeights } : {}) });
const SIX = { min: 0.12, max: 0.42 };

describe("the note about layers a nozzle doesn't take", () => {
  it("says layers thinner than the nozzle's minimum stay as the creator set them, and what to set instead", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.09, thickest: 0.28 })], "0.6", SIX)).toEqual([
      "The project has layers as thin as 0.09 mm, thinner than the 0.12 mm the U1's 0.6 mm nozzle takes. They stay as the creator set them, and Snapmaker Orca slices them that way without a warning. To change that, set the layers to heights from 0.12 to 0.42 mm in Snapmaker Orca.",
    ]);
  });

  it("says the same for layers thicker than the maximum, and for both at once in two notes", () => {
    const thick = layerHeightNotes([plate(1, { thinnest: 0.2, thickest: 0.25 })], "0.2", { min: 0.04, max: 0.14 });
    expect(thick).toEqual([
      "The project has layers as thick as 0.25 mm, thicker than the 0.14 mm the U1's 0.2 mm nozzle takes. They stay as the creator set them, and Snapmaker Orca slices them that way without a warning. To change that, set the layers to heights from 0.04 to 0.14 mm in Snapmaker Orca.",
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

  it("says nothing when the nozzle's limits aren't usable numbers", () => {
    expect(layerHeightNotes([plate(1, { thinnest: 0.01, thickest: 9 })], "0.6", { min: 0, max: 0.42 })).toEqual([]);
    expect(layerHeightNotes([plate(1, { thinnest: 0.01, thickest: 9 })], "0.6", { min: 0.3, max: 0.1 })).toEqual([]);
    expect(layerLimitsOf({ min_layer_height: ["0.12", "0.12"], max_layer_height: ["0.42", "0.42"] })).toEqual({ min: 0.12, max: 0.42 });
    expect(layerLimitsOf({ min_layer_height: "x", max_layer_height: ["0.42"] })).toBeNull();
    expect(layerLimitsOf({})).toBeNull();
  });
});
