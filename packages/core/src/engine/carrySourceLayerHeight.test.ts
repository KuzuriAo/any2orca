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
    expect(warnings[0]).toContain("0.42mm");
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
