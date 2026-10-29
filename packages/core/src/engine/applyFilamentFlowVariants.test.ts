// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { applyFilamentFlowVariants } from "./applyFilamentFlowVariants.js";

describe("applyFilamentFlowVariants", () => {
  it("writes standard and high-flow values per filament from the source's own pairs, capped at 22 and 40", () => {
    const source = { filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"], filament_max_volumetric_speed: ["22", "29", "25", "45"], nozzle_temperature: ["220", "230", "215", "225"] };
    const settings = { filament_max_volumetric_speed: ["22", "25"], nozzle_temperature: ["220", "215"] };
    const warnings: string[] = [];
    applyFilamentFlowVariants(settings, source, {}, true, new Set(["filament_max_volumetric_speed", "nozzle_temperature"]), 2, warnings);
    expect(settings).toMatchObject({
      filament_max_volumetric_speed: ["22", "29", "22", "40"],
      nozzle_temperature: ["220", "230", "215", "225"],
      filament_flow_step_size: ["2", "2"],
      filament_flow_support: ["standard", "high_flow", "standard", "high_flow"],
      filament_volume_type: ["standard", "standard"],
    });
    expect(warnings.some((w) => w.includes("lowered to at most 22"))).toBe(true);
  });

  it("uses Snapmaker's stock high-flow value for settings the source doesn't carry", () => {
    const settings = { filament_multitool_ramming_flow: ["30", "30"] };
    applyFilamentFlowVariants(settings, {}, { filament_multitool_ramming_flow: ["30", "40"] }, true, new Set(), 2, []);
    expect(settings.filament_multitool_ramming_flow).toEqual(["30", "40", "30", "40"]);
  });

  it("repeats the standard value as high flow when the source has no high-flow value", () => {
    const settings = { filament_max_volumetric_speed: ["21"] };
    applyFilamentFlowVariants(settings, { filament_max_volumetric_speed: ["21"] }, {}, true, new Set(["filament_max_volumetric_speed"]), 1, []);
    expect(settings.filament_max_volumetric_speed).toEqual(["21", "21"]);
  });

  it("keeps one value per filament on a nozzle without high flow, capped at 22", () => {
    const settings = { filament_max_volumetric_speed: ["25", "12"] };
    applyFilamentFlowVariants(settings, {}, {}, false, new Set(["filament_max_volumetric_speed"]), 2, []);
    expect(settings).toMatchObject({ filament_max_volumetric_speed: ["22", "12"], filament_flow_step_size: ["1", "1"], filament_volume_type: ["standard", "standard"] });
  });

  it("never raises a value and leaves nil alone", () => {
    const settings = { filament_max_volumetric_speed: ["8", "nil"] };
    applyFilamentFlowVariants(settings, {}, {}, false, new Set(["filament_max_volumetric_speed"]), 2, []);
    expect(settings.filament_max_volumetric_speed).toEqual(["8", "nil"]);
  });

  it("keeps a Snapmaker Orca save's own high-flow values", () => {
    // From a real save (PLA Matte, then SnapSpeed): standard and high-flow values per filament, tagged by filament_flow_support.
    const source = {
      filament_flow_step_size: ["2", "2"],
      filament_flow_support: ["standard", "high_flow", "standard", "high_flow"],
      nozzle_temperature: ["215", "220", "220", "220"],
      filament_max_volumetric_speed: ["22", "40", "20", "40"],
      enable_pressure_advance: ["0", "1", "0", "1"],
      filament_retraction_length: ["nil", "1", "1.2", "1.2"],
    };
    const settings = { nozzle_temperature: ["215", "220"], filament_max_volumetric_speed: ["22", "20"], enable_pressure_advance: ["0", "0"], filament_retraction_length: ["nil", "1.2"] };
    const fromSource = new Set(Object.keys(settings));
    applyFilamentFlowVariants(settings, source, {}, true, fromSource, 2, []);
    expect(settings).toMatchObject({
      nozzle_temperature: ["215", "220", "220", "220"],
      filament_max_volumetric_speed: ["22", "40", "20", "40"],
      enable_pressure_advance: ["0", "1", "0", "1"],
      filament_retraction_length: ["nil", "1", "1.2", "1.2"],
    });
  });

  it("repeats the standard value for a filament the save gives only a standard value, and still caps", () => {
    const source = {
      filament_flow_step_size: ["1", "2"],
      filament_flow_support: ["standard", "standard", "high_flow"],
      filament_max_volumetric_speed: ["30", "22", "45"],
    };
    const settings = { filament_max_volumetric_speed: ["30", "22"] };
    applyFilamentFlowVariants(settings, source, {}, true, new Set(["filament_max_volumetric_speed"]), 2, []);
    expect(settings.filament_max_volumetric_speed).toEqual(["22", "30", "22", "40"]);
  });
});
