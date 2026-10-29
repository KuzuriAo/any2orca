// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { reshapeToCount } from "./reshapeToCount.js";

describe("reshapeToCount", () => {
  it("returns a copy unchanged when length already matches count", () => {
    expect(reshapeToCount(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });

  it("takes the first value of each group when length is a clean multiple of count", () => {
    // 6 values, 3 filaments -> group size 2 -> take index 0, 2, 4
    expect(reshapeToCount(["a0", "a1", "b0", "b1", "c0", "c1"], 3)).toEqual(["a0", "b0", "c0"]);
  });

  it("returns null when length isn't a clean multiple of count", () => {
    expect(reshapeToCount(["a", "b", "c", "d", "e"], 3)).toBeNull();
  });

  it("returns null when length is smaller than count (not a valid group multiple)", () => {
    expect(reshapeToCount(["a", "b"], 3)).toBeNull();
  });

  it("returns a defensive copy, not the original array reference", () => {
    const original = ["a", "b", "c"];
    const result = reshapeToCount(original, 3);
    expect(result).not.toBe(original);
  });

  describe("variantIndex", () => {
    it("takes the value at variantIndex within each group instead of the first", () => {
      expect(reshapeToCount(["a0", "a1", "b0", "b1", "c0", "c1"], 3, 1)).toEqual(["a1", "b1", "c1"]);
    });

    it("clamps an out-of-bounds variantIndex back to the first value of each group", () => {
      expect(reshapeToCount(["a0", "a1", "b0", "b1"], 2, 5)).toEqual(["a0", "b0"]);
    });

    it("defaults to the first value of each group when variantIndex is omitted", () => {
      expect(reshapeToCount(["a0", "a1", "b0", "b1"], 2)).toEqual(["a0", "b0"]);
    });
  });
});
