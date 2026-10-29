// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resolveMinIfLower } from "./resolveMinIfLower.js";

describe("resolveMinIfLower", () => {
  it("honors a lower Bambu value", () => {
    expect(resolveMinIfLower("500", "400", null)).toEqual(["400", true]);
  });

  it("ignores a higher Bambu value, keeping the baseline", () => {
    expect(resolveMinIfLower("500", "600", null)).toEqual(["500", false]);
  });

  it("keeps the baseline when values are equal", () => {
    expect(resolveMinIfLower("500", "500", null)).toEqual(["500", false]);
  });

  it("compares percentage values numerically, ignoring the '%' suffix", () => {
    expect(resolveMinIfLower("100%", "50%", null)).toEqual(["50%", true]);
  });

  it("keeps the baseline when either value isn't a recognizable number", () => {
    expect(resolveMinIfLower("500", "fast", null)).toEqual(["500", false]);
    expect(resolveMinIfLower("not-a-number", "400", null)).toEqual(["not-a-number", false]);
  });

  it("resolves a per-nozzle-variant paired array via variantIndex before comparing", () => {
    expect(resolveMinIfLower("500", ["400", "600"], 0)).toEqual(["400", true]);
    expect(resolveMinIfLower("500", ["400", "600"], 1)).toEqual(["500", false]);
  });

  it("falls back to index 0 of the array when variantIndex is null", () => {
    expect(resolveMinIfLower("500", ["400", "600"], null)).toEqual(["400", true]);
  });

  it("returns the baseline unchanged for an empty array", () => {
    expect(resolveMinIfLower("500", [], null)).toEqual(["500", false]);
  });

  it("ignores a Bambu '0' -- Bambu's sentinel for 'not overridden, use default', not a genuinely lower value", () => {
    expect(resolveMinIfLower("10000", "0", null)).toEqual(["10000", false]);
  });

  it("ignores a negative Bambu value the same way as zero", () => {
    expect(resolveMinIfLower("10000", "-5", null)).toEqual(["10000", false]);
  });

  it("compares entry by entry when the U1 value is stored per variant", () => {
    expect(resolveMinIfLower(["10000", "10000"], "6000", null)).toEqual([["6000", "6000"], true]);
    expect(resolveMinIfLower(["300", "600"], "400", null)).toEqual([["300", "400"], true]);
    expect(resolveMinIfLower(["5000", "5000"], "8000", null)).toEqual([["5000", "5000"], false]);
    expect(resolveMinIfLower(["5000", "5000"], "0", null)).toEqual([["5000", "5000"], false]);
  });
});
