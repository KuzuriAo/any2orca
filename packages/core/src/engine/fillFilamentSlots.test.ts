// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { fillFilamentSlots } from "./fillFilamentSlots.js";

describe("fillFilamentSlots", () => {
  it("repeats the stock standard value for each slot when the source didn't carry the setting", () => {
    const settings = { filament_cooling_moves: ["2"], filament_multitool_ramming_flow: ["30", "40"], filament_type: ["PLA", "PETG", "PLA"] };
    fillFilamentSlots(settings, new Set(["filament_cooling_moves", "filament_multitool_ramming_flow", "filament_type"]), new Set(["filament_type"]), 3);
    expect(settings.filament_cooling_moves).toEqual(["2", "2", "2"]);
    expect(settings.filament_multitool_ramming_flow).toEqual(["30", "30", "30"]);
    expect(settings.filament_type).toEqual(["PLA", "PETG", "PLA"]);
  });

  it("leaves the creator's values, scalars and already-matching lists alone", () => {
    const settings = { filament_density: ["1.24", "1.27"], filament_end_gcode: "x", filament_cost: ["20", "20"] };
    fillFilamentSlots(settings, new Set(["filament_density", "filament_end_gcode", "filament_cost"]), new Set(["filament_density"]), 2);
    expect(settings).toEqual({ filament_density: ["1.24", "1.27"], filament_end_gcode: "x", filament_cost: ["20", "20"] });
  });
});
