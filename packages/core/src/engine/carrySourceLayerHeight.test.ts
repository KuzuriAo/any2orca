// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { carrySourceLayerHeight } from "./carrySourceLayerHeight.js";

const machine06 = { min_layer_height: ["0.12", "0.12", "0.12", "0.12"], max_layer_height: ["0.42", "0.42", "0.42", "0.42"] };

describe("carrySourceLayerHeight", () => {
  it("keeps the source's layer height on a non-exact tier, with a note", () => {
    const settings = { layer_height: "0.3" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.42" }, machine06, warnings);
    expect(settings.layer_height).toBe("0.42");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("WARN");
    expect(warnings[0]).toContain("0.42 mm");
  });

  it("clamps to the printer's max layer height and says so", () => {
    const settings = { layer_height: "0.3" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.5" }, machine06, warnings);
    expect(settings.layer_height).toBe("0.42");
    expect(warnings[0]).toContain("outside what the U1 supports");
  });

  it("clamps to the printer's min layer height", () => {
    const settings = { layer_height: "0.18" };
    carrySourceLayerHeight(settings, { layer_height: "0.06" }, machine06, []);
    expect(settings.layer_height).toBe("0.12");
  });

  it("is a no-op when the source already matches the tier", () => {
    const settings = { layer_height: "0.3" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.30" }, machine06, warnings);
    expect(settings.layer_height).toBe("0.3");
    expect(warnings).toEqual([]);
  });

  it("clamps a height already copied in from the creator's changed settings, and names the profile's own height", () => {
    // The creator changed 0.2 to 0.1 on their own process; it was copied over the profile's 0.18 before this runs.
    const settings = { layer_height: "0.1" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.1" }, machine06, warnings, "0.18");
    expect(settings.layer_height).toBe("0.12");
    expect(warnings).toEqual(["  WARN: your file's 0.1 mm layer height is outside what the U1 supports for this nozzle size, so it was set to 0.12 mm, on the closest profile (0.18 mm)."]);
  });

  it("leaves a height already copied in alone when it is in the printer's range", () => {
    const settings = { layer_height: "0.14" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.14" }, machine06, warnings, "0.18");
    expect(settings.layer_height).toBe("0.14");
    expect(warnings).toEqual([]);
  });

  it("is a no-op when the source has no usable layer height", () => {
    const settings = { layer_height: "0.3" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, {}, machine06, warnings);
    carrySourceLayerHeight(settings, { layer_height: "abc" }, machine06, warnings);
    expect(settings.layer_height).toBe("0.3");
    expect(warnings).toEqual([]);
  });

  it("is a no-op when clamping lands back on the tier's own value", () => {
    const settings = { layer_height: "0.42" };
    const warnings: string[] = [];
    carrySourceLayerHeight(settings, { layer_height: "0.6" }, machine06, warnings);
    expect(settings.layer_height).toBe("0.42");
    expect(warnings).toEqual([]);
  });

  it("still carries over when the machine has no layer-height limits", () => {
    const settings = { layer_height: "0.3" };
    carrySourceLayerHeight(settings, { layer_height: "0.36" }, {}, []);
    expect(settings.layer_height).toBe("0.36");
  });
});
