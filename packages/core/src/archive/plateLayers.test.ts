// SPDX-License-Identifier: MIT
// A plate's layers as Snapmaker Orca 2.4.1 slices them. The variable-layer numbers were checked against the slicer's
// own G-code: a real project with an adaptive profile (228 computed layer tops, each equal to the G-code's `;Z:` to
// 0.0001 mm, the top one aside, which the slicer drops as empty) and its pause at 13 mm, which the layer slider shows
// on layer 138 and the G-code writes before layer 137.
import { describe, expect, it } from "vitest";
import { layerEndingAt, layerStartingAt, mergeLayerTops, objectLayerTops, pauseLayerAt, rangesLayerProfile, readLayerProfiles } from "./plateLayers.js";

const close = (values: readonly number[]) => values.map((v) => Math.round(v * 10000) / 10000);

describe("an object's layers", () => {
  it("are the first layer, then the layer height up to the object's top", () => {
    const tops = objectLayerTops({ height: 1, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08 })!;
    expect(close(tops)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    // A top that ends inside a layer: the slicer adds the layer while its middle is below the top.
    expect(close(objectLayerTops({ height: 1.05, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08 })!)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    expect(close(objectLayerTops({ height: 1.11, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08 })!)).toEqual([0.2, 0.4, 0.6, 0.8, 1, 1.2]);
    // A first layer of its own height.
    expect(close(objectLayerTops({ height: 0.95, firstLayer: 0.3, layerHeight: 0.2, minLayer: 0.08 })!)).toEqual([0.3, 0.5, 0.7, 0.9]);
  });

  it("follow a variable layer height profile, interpolating between its points, when it ends at the object's top", () => {
    // From 0.2 mm the layers thin from 0.2 to 0.1 by 1 mm, then stay 0.1.
    const profile = [0, 0.2, 0.2, 0.2, 1, 0.1, 2, 0.1];
    const tops = objectLayerTops({ height: 2, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08, profile })!;
    expect(tops[0]).toBe(0.2);
    // Each layer's height is the profile's at the layer's lower edge plus half the thinnest layer: 0.195, then 0.1706.
    expect(close(tops.slice(1, 3))).toEqual([0.395, 0.5656]);
    expect(tops.length).toBeGreaterThan(14);
    for (let i = 1; i < tops.length; i++) expect(tops[i]! - tops[i - 1]!).toBeLessThanOrEqual(0.2 + 1e-9);
    // A profile whose last point isn't the object's top is set aside, as the slicer does: the layer height applies.
    expect(close(objectLayerTops({ height: 1, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08, profile })!)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("follow a layer height set for a range of heights, as a color-by-layer print's thicker first layers", () => {
    // A real project of that kind: 0.16 mm layers up to 0.64 mm, 0.08 mm above; Snapmaker Orca 2.4.1's G-code has the same 23 layers.
    const ranges = [{ from: 0, to: 0.64, layerHeight: 0.16 }];
    expect(close(rangesLayerProfile(ranges, { height: 2.16, firstLayer: 0.16, layerHeight: 0.08 }))).toEqual([0, 0.16, 0.64, 0.16, 0.64, 0.08, 2.16, 0.08]);
    const tops = objectLayerTops({ height: 2.16, firstLayer: 0.16, layerHeight: 0.08, minLayer: 0.08, ranges })!;
    expect(close(tops.slice(0, 7))).toEqual([0.16, 0.32, 0.48, 0.64, 0.72, 0.8, 0.88]);
    expect(tops).toHaveLength(23);
    // A range above the first layer, with the normal height below and above it.
    expect(close(rangesLayerProfile([{ from: 1, to: 2, layerHeight: 0.1 }], { height: 3, firstLayer: 0.2, layerHeight: 0.2 }))).toEqual([0, 0.2, 1, 0.2, 1, 0.1, 2, 0.1, 2, 0.2, 3, 0.2]);
  });

  it("are not worked out for nonsense or for more layers than the cap", () => {
    expect(objectLayerTops({ height: 0, firstLayer: 0.2, layerHeight: 0.2, minLayer: 0.08 })).toBeNull();
    expect(objectLayerTops({ height: 10, firstLayer: 0.2, layerHeight: -1, minLayer: 0.08 })).toBeNull();
    expect(objectLayerTops({ height: 1000, firstLayer: 0.2, layerHeight: 0.01, minLayer: 0.01 }, 5000)).toBeNull();
  });
});

describe("the variable layer height file", () => {
  it("numbers objects by their position in the build list, or by their object id from format version 2", () => {
    const old = readLayerProfiles("object_id=2|0;0.2;0.2;0.2;10;0.1\n", ["7", "9"]);
    expect([...old.keys()]).toEqual(["9"]);
    const byId = readLayerProfiles("layer_heights_profile_format_version=2\nobject_id=9|0;0.2;0.2;0.2;10;0.1\n", []);
    expect(byId.get("9")).toEqual([0, 0.2, 0.2, 0.2, 10, 0.1]);
  });

  it("skips entries the slicer refuses, and junk", () => {
    const profiles = readLayerProfiles(
      [
        "object_id=1|0;0.2;10;0.2", // four values
        "object_id=2|0;0.2;0.2;0.2;10", // an odd count
        "object_id=3|0;0.2;5;-1;10;0.2", // a layer height below zero
        "object_id=4|0;0.2;5;0.2;4;0.2", // heights going down
        "object_id=5|0;0.2;x;0.2;10;0.2",
        "object_id=0|0;0.2;0.2;0.2;10;0.1",
        "object_id=6|0;0.2;0.2;0.2;10;0.1",
        "object_id=6|0;0.3;0.2;0.3;10;0.3", // the second of a pair
      ].join("\n"),
      ["a", "b", "c", "d", "e", "f"],
    );
    expect([...profiles.keys()]).toEqual(["f"]);
    expect(profiles.get("f")![1]).toBe(0.2);
  });
});

describe("a plate's layers and the layer a height is on", () => {
  it("merges the objects' layers, joining heights the slicer treats as one", () => {
    expect(close(mergeLayerTops([[0.2, 0.4, 0.5, 0.6], [0.2, 0.35, 0.50005, 0.65]]))).toEqual([0.2, 0.35, 0.4, 0.5, 0.6, 0.65]);
  });

  it("puts a start in the layer above a boundary and an end in the layer below it", () => {
    const tops = [0.2, 0.4, 0.6, 0.8];
    expect(layerStartingAt(tops, 0)).toBe(1);
    expect(layerStartingAt(tops, 0.4)).toBe(3);
    expect(layerStartingAt(tops, 0.45)).toBe(3);
    expect(layerEndingAt(tops, 0.4)).toBe(2);
    expect(layerEndingAt(tops, 0.45)).toBe(3);
    expect(layerEndingAt(tops, 5)).toBe(4);
  });

  it("places a pause on the nearest layer, as the slicer writes it, while the slider shows the next one up", () => {
    // The real project's layers around 13 mm.
    const tops = [12.6994, 12.7886, 12.877, 12.965, 13.0525, 13.1399];
    expect(pauseLayerAt(tops, 13)).toBe(4); // 12.965 is nearer
    expect(layerEndingAt(tops, 13)).toBe(5); // the slider's lower bound
    expect(pauseLayerAt(tops, 13.0525)).toBe(5); // a pause set on a layer stays on it
    expect(pauseLayerAt(tops, 99)).toBe(6); // above the top, the top layer
    expect(pauseLayerAt([0.2, 0.4], 0.05)).toBeNull(); // below the first layer's middle: dropped
    expect(pauseLayerAt([0.2, 0.4], 0.15)).toBe(1);
  });
});
