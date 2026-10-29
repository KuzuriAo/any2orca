// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { remapBrimType } from "./remapBrimType.js";

describe("remapBrimType", () => {
  it("remaps brim_ears (Bambu Studio's own value for Painted) to painted", () => {
    const warnings: string[] = [];
    const result = remapBrimType({ brim_type: "brim_ears" }, warnings);
    expect(result.brim_type).toBe("painted");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("brim_ears");
  });

  it("leaves every other brim_type value untouched, without a warning", () => {
    for (const value of ["auto_brim", "outer_only", "inner_only", "outer_and_inner", "no_brim", "painted"]) {
      const warnings: string[] = [];
      const result = remapBrimType({ brim_type: value }, warnings);
      expect(result.brim_type).toBe(value);
      expect(warnings).toHaveLength(0);
    }
  });

  it("leaves settings with no brim_type key untouched", () => {
    const warnings: string[] = [];
    const result = remapBrimType({ other_key: "x" }, warnings);
    expect(result).toEqual({ other_key: "x" });
    expect(warnings).toHaveLength(0);
  });

  it("does not mutate the input object", () => {
    const input = { brim_type: "brim_ears" };
    remapBrimType(input, []);
    expect(input.brim_type).toBe("brim_ears");
  });

  it("preserves every other key in the settings object unchanged", () => {
    const result = remapBrimType({ brim_type: "brim_ears", wall_loops: "2", other: "keep-me" }, []);
    expect(result).toEqual({ brim_type: "painted", wall_loops: "2", other: "keep-me" });
  });
});
