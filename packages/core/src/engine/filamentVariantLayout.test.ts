// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { filamentVariantLayout } from "./filamentVariantLayout.js";

describe("filamentVariantLayout", () => {
  it("reads a Snapmaker Orca save where every filament has a standard and a high-flow value", () => {
    const source = { filament_flow_step_size: ["2", "2"], filament_flow_support: ["standard", "high_flow", "standard", "high_flow"] };
    expect(filamentVariantLayout(source, 2)).toEqual({
      length: 4,
      slots: [
        { standard: 0, highFlow: 1 },
        { standard: 2, highFlow: 3 },
      ],
    });
  });

  it("reads a save mixing filaments with one value and with two", () => {
    // From a real Snapmaker Orca save: two Bambu-named filaments with a standard value only, then Snapmaker PLA SnapSpeed with both.
    const source = { filament_flow_step_size: ["1", "1", "2"], filament_flow_support: ["standard", "standard", "standard", "high_flow"] };
    expect(filamentVariantLayout(source, 3)).toEqual({
      length: 4,
      slots: [
        { standard: 0, highFlow: null },
        { standard: 1, highFlow: null },
        { standard: 2, highFlow: 3 },
      ],
    });
  });

  it("goes by the tags, not the position", () => {
    const source = { filament_flow_step_size: ["2"], filament_flow_support: ["high_flow", "standard"] };
    expect(filamentVariantLayout(source, 1)?.slots).toEqual([{ standard: 1, highFlow: 0 }]);
  });

  it("is null for a Bambu Studio source or anything malformed", () => {
    expect(filamentVariantLayout({ filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"] }, 1)).toBeNull();
    const support = ["standard", "high_flow"];
    expect(filamentVariantLayout({ filament_flow_step_size: ["2"], filament_flow_support: support }, 2)).toBeNull(); // wrong slot count
    expect(filamentVariantLayout({ filament_flow_step_size: ["2", "2"], filament_flow_support: support }, 2)).toBeNull(); // tags too short
    expect(filamentVariantLayout({ filament_flow_step_size: ["0", "2"], filament_flow_support: support }, 2)).toBeNull();
    expect(filamentVariantLayout({ filament_flow_step_size: ["1.5"], filament_flow_support: ["standard"] }, 1)).toBeNull();
    expect(filamentVariantLayout({ filament_flow_step_size: ["1e9"], filament_flow_support: ["standard"] }, 1)).toBeNull();
    expect(filamentVariantLayout({ filament_flow_step_size: ["1"], filament_flow_support: [{ toString: () => "standard" }] }, 1)).toBeNull();
    expect(filamentVariantLayout({ filament_flow_step_size: "2", filament_flow_support: support }, 1)).toBeNull();
    expect(filamentVariantLayout({ filament_flow_step_size: ["2"], filament_flow_support: support }, 0)).toBeNull();
  });
});
