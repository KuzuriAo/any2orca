// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { coerceValue } from "./coerceValue.js";

describe("coerceValue", () => {
  it("list/list, same length: uses bambu's value, changed=true when different", () => {
    const warnings: string[] = [];
    const [val, changed] = coerceValue(["a", "a"], ["b", "b"], "k", warnings);
    expect(val).toEqual(["b", "b"]);
    expect(changed).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("list/list, same length: changed=false when identical", () => {
    const [val, changed] = coerceValue(["a", "a"], ["a", "a"], "k", []);
    expect(val).toEqual(["a", "a"]);
    expect(changed).toBe(false);
  });

  it("list/list, mismatched length, bambu uniform: broadcasts bambu's single value to baseline's length", () => {
    const warnings: string[] = [];
    const [val, changed] = coerceValue(["x", "x", "x"], ["y", "y"], "k", warnings);
    expect(val).toEqual(["y", "y", "y"]);
    expect(changed).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("list/list, mismatched length, bambu NOT uniform: skips and warns, keeps baseline", () => {
    const warnings: string[] = [];
    const [val, changed] = coerceValue(["x", "x", "x"], ["y", "z"], "k", warnings);
    expect(val).toEqual(["x", "x", "x"]);
    expect(changed).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("SKIP k");
    expect(warnings[0]).toContain("template=3");
    expect(warnings[0]).toContain("source=2");
  });

  it("list/list, a 4-value source against 1- and 2-value baselines: never passes the 4 values through", () => {
    for (const baseline of [["a"], ["a", "b"]]) {
      const warnings: string[] = [];
      expect(coerceValue(baseline, ["1", "2", "3", "4"], "k", warnings)).toEqual([baseline, false, true]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("SKIP k");
    }
  });

  it("baseline list, bambu scalar: broadcasts the scalar to baseline's length", () => {
    const [val, changed] = coerceValue(["x", "x"], "y", "k", []);
    expect(val).toEqual(["y", "y"]);
    expect(changed).toBe(true);
  });

  it("baseline scalar, bambu list, uniform: uses the first element", () => {
    const warnings: string[] = [];
    const [val, changed] = coerceValue("x", ["y", "y"], "k", warnings);
    expect(val).toBe("y");
    expect(changed).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("baseline scalar, bambu list, NOT uniform: warns but still uses the first element", () => {
    const warnings: string[] = [];
    const [val, changed] = coerceValue("x", ["y", "z"], "k", warnings);
    expect(val).toBe("y");
    expect(changed).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("WARN k");
  });

  it("scalar/scalar: uses bambu's value, changed reflects equality", () => {
    expect(coerceValue("x", "y", "k", [])).toEqual(["y", true]);
    expect(coerceValue("x", "x", "k", [])).toEqual(["x", false]);
  });

  describe("variantIndex (nozzle-variant paired values)", () => {
    it("baseline scalar, bambu list, NOT uniform, variantIndex given: uses that index, notes rather than warns", () => {
      const warnings: string[] = [];
      const [val, changed] = coerceValue("x", ["210", "350"], "k", warnings, 1);
      expect(val).toBe("350");
      expect(changed).toBe(true);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("NOTE k");
      expect(warnings[0]).not.toContain("WARN");
    });

    it("variantIndex out of bounds for this key's own array: falls back to the WARN/first-value behavior", () => {
      const warnings: string[] = [];
      const [val, changed] = coerceValue("x", ["210", "350"], "k", warnings, 5);
      expect(val).toBe("210");
      expect(changed).toBe(true);
      expect(warnings[0]).toContain("WARN k");
    });

    it("variantIndex null (no signal available): unchanged from the original WARN/first-value behavior", () => {
      const warnings: string[] = [];
      const [val] = coerceValue("x", ["210", "350"], "k", warnings, null);
      expect(val).toBe("210");
      expect(warnings[0]).toContain("WARN k");
    });
  });
});
