// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { stripBambuOnlyNozzleVariantKeys } from "./stripBambuOnlyNozzleVariantKeys.js";

describe("stripBambuOnlyNozzleVariantKeys", () => {
  it("removes nozzle_volume_type regardless of length", () => {
    const settings = { nozzle_volume_type: ["Standard"], other_key: "x" };
    stripBambuOnlyNozzleVariantKeys(settings, {});
    expect(settings).not.toHaveProperty("nozzle_volume_type");
    expect(settings.other_key).toBe("x");
  });

  it("removes default_nozzle_volume_type too", () => {
    const settings = { default_nozzle_volume_type: ["HighFlow"] };
    stripBambuOnlyNozzleVariantKeys(settings, {});
    expect(settings).not.toHaveProperty("default_nozzle_volume_type");
  });

  it("removes both when both are present, at any array length", () => {
    const settings = {
      nozzle_volume_type: ["Standard", "Standard", "Standard", "Standard"],
      default_nozzle_volume_type: ["Standard"],
    };
    stripBambuOnlyNozzleVariantKeys(settings, {});
    expect(settings).not.toHaveProperty("nozzle_volume_type");
    expect(settings).not.toHaveProperty("default_nozzle_volume_type");
  });

  it("is a no-op, without throwing, when neither key is present", () => {
    const settings = { some_other_key: "value" };
    expect(() => stripBambuOnlyNozzleVariantKeys(settings, {})).not.toThrow();
    expect(settings).toEqual({ some_other_key: "value" });
  });

  it("puts back the U1 profile's own nozzle_volume_type, one entry per toolhead", () => {
    const u1 = { nozzle_volume_type: ["standard", "standard", "standard", "standard"] };
    const settings = { nozzle_volume_type: ["Standard"], default_nozzle_volume_type: ["Standard"] };
    stripBambuOnlyNozzleVariantKeys(settings, u1);
    expect(settings.nozzle_volume_type).toEqual(["standard", "standard", "standard", "standard"]);
    expect(settings).not.toHaveProperty("default_nozzle_volume_type");
  });

  it("mutates the object in place rather than returning a new one", () => {
    const settings = { nozzle_volume_type: ["Standard"] };
    const result = stripBambuOnlyNozzleVariantKeys(settings, {});
    expect(result).toBeUndefined();
    expect(settings).not.toHaveProperty("nozzle_volume_type");
  });
});
