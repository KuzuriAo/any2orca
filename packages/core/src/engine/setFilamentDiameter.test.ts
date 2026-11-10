// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { setFilamentDiameter } from "./setFilamentDiameter.js";

describe("setFilamentDiameter", () => {
  it("leaves 1.75 mm filaments alone, without a note", () => {
    const settings = { filament_diameter: ["1.75", "1.75"] };
    const warnings: string[] = [];
    setFilamentDiameter(settings, 2, warnings);
    expect(settings.filament_diameter).toEqual(["1.75", "1.75"]);
    expect(warnings).toEqual([]);
  });

  it("sets a 2.85 mm filament to 1.75 and names it", () => {
    // An H3C project with soft TPU on the 2.85 mm PrintTool in slot 3.
    const settings = { filament_diameter: ["1.75", "1.75", "2.85", "1.75"] };
    const warnings: string[] = [];
    setFilamentDiameter(settings, 4, warnings);
    expect(settings.filament_diameter).toEqual(["1.75", "1.75", "1.75", "1.75"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("filament 3 (2.85 mm) is set to 1.75 mm");
  });

  it("says nothing about a slot the pipeline already explained, but still sets it", () => {
    const settings = { filament_diameter: ["1.75", "1.75", "2.85", "1.75"] };
    const warnings: string[] = [];
    setFilamentDiameter(settings, 4, warnings, new Set([2]));
    expect(settings.filament_diameter).toEqual(["1.75", "1.75", "1.75", "1.75"]);
    expect(warnings).toEqual([]);
  });

  it("writes one value per slot when the file has fewer, more, or none", () => {
    const short = { filament_diameter: ["2.85"] };
    const warnings: string[] = [];
    setFilamentDiameter(short, 3, warnings);
    expect(short.filament_diameter).toEqual(["1.75", "1.75", "1.75"]);
    expect(warnings[0]).toContain("filament 1 (2.85 mm)");

    const long = { filament_diameter: ["1.75", "1.75", "1.75", "2.85"] };
    setFilamentDiameter(long, 2, []);
    expect(long.filament_diameter).toEqual(["1.75", "1.75"]);

    const none: Record<string, unknown> = {};
    setFilamentDiameter(none, 2, []);
    expect(none.filament_diameter).toEqual(["1.75", "1.75"]);
  });
});
