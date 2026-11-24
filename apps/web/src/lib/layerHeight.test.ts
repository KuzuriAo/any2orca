// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  availableLayerHeights,
  findLayersOutsideLimits,
  formatLayerHeightMm,
  nearestSupportedLayerHeight,
} from "./layerHeight";

describe("availableLayerHeights", () => {
  it("returns unique profile heights sorted lowest first for the nozzle diameter", () => {
    const catalog = {
      list: ({ nozzleDiameter }: { nozzleDiameter?: string }) =>
        nozzleDiameter === "0.6"
          ? [
              { layerHeight: 0.3 },
              { layerHeight: 0.18 },
              { layerHeight: 0.24 },
              { layerHeight: 0.18 },
            ]
          : [],
    };
    assert.deepEqual(availableLayerHeights(catalog as any, "0.6"), [0.18, 0.24, 0.3]);
    assert.deepEqual(availableLayerHeights(catalog as any, "0.6mm"), [0.18, 0.24, 0.3]);
    assert.deepEqual(availableLayerHeights(null, "0.6"), []);
  });
});

describe("formatLayerHeightMm", () => {
  it("formats heights in mm with two decimal places", () => {
    assert.equal(formatLayerHeightMm(0.18), "0.18 mm");
    assert.equal(formatLayerHeightMm(0.2), "0.20 mm");
    assert.equal(formatLayerHeightMm(0.3), "0.30 mm");
  });
});

describe("findLayersOutsideLimits and nearestSupportedLayerHeight", () => {
  const limits06 = { min: 0.12, max: 0.42 };
  const limits04 = { min: 0.08, max: 0.32 };

  it("detects layers thinner than the nozzle minimum", () => {
    const plates = [
      { plate: 1, filaments: [], mostAtOnce: 1, layerHeights: { thinnest: 0.2, thickest: 0.2 } },
      { plate: 2, filaments: [], mostAtOnce: 1, layerHeights: { thinnest: 0.1, thickest: 0.2 } },
    ];
    const outside = findLayersOutsideLimits(plates, limits06);
    assert.deepEqual(outside, { thinnest: 0.1, thickest: 0.2, tooThin: true, tooThick: false });
    assert.equal(nearestSupportedLayerHeight([0.18, 0.24, 0.3], outside!), 0.18);
  });

  it("returns null when all layers are inside the nozzle limits", () => {
    const plates = [
      { plate: 1, filaments: [], mostAtOnce: 1, layerHeights: { thinnest: 0.1, thickest: 0.2 } },
    ];
    assert.equal(findLayersOutsideLimits(plates, limits04), null);
  });

  it("detects layers thicker than the nozzle maximum and picks the nearest supported height", () => {
    const plates = [
      { plate: 1, filaments: [], mostAtOnce: 1, layerHeights: { thinnest: 0.2, thickest: 0.5 } },
    ];
    const outside = findLayersOutsideLimits(plates, limits06);
    assert.deepEqual(outside, { thinnest: 0.2, thickest: 0.5, tooThin: false, tooThick: true });
    assert.equal(nearestSupportedLayerHeight([0.18, 0.24, 0.3], outside!), 0.3);
  });
});
