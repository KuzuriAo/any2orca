// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { bambuFilamentVariantLayout, filamentVariantLayout } from "./filamentVariantLayout.js";

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

describe("bambuFilamentVariantLayout", () => {
  // Shaped like a real Bambu Studio 2.9.1 save: four filaments, the second (Generic PLA) with a standard value only.
  const STANDARD = "Direct Drive Standard";
  const HIGH_FLOW = "Direct Drive High Flow";
  const source = {
    nozzle_diameter: ["0.4"],
    nozzle_volume_type: ["Standard"],
    filament_self_index: ["1", "1", "2", "3", "3", "4", "4"],
    filament_extruder_variant: [STANDARD, HIGH_FLOW, STANDARD, STANDARD, HIGH_FLOW, STANDARD, HIGH_FLOW],
  };

  it("reads a save where filaments carry different numbers of values", () => {
    expect(bambuFilamentVariantLayout(source, 4)).toEqual({
      length: 7,
      slots: [
        { standard: 0, highFlow: 1 },
        { standard: 2, highFlow: null },
        { standard: 3, highFlow: 4 },
        { standard: 5, highFlow: 6 },
      ],
    });
  });

  it("reads the variant the source was sliced with, or the filament's first value when it has none for it", () => {
    const slots = bambuFilamentVariantLayout({ ...source, nozzle_volume_type: ["High Flow"] }, 4)?.slots;
    expect(slots?.map((slot) => slot.standard)).toEqual([1, 2, 4, 6]);
  });

  it("reads each filament's first value when the source doesn't say which variant it used", () => {
    const twoNozzles = { ...source, nozzle_diameter: ["0.4", "0.4"], filament_extruder_variant: [HIGH_FLOW, STANDARD, STANDARD, STANDARD, HIGH_FLOW, STANDARD, HIGH_FLOW] };
    expect(bambuFilamentVariantLayout(twoNozzles, 4)?.slots.map((slot) => slot.standard)).toEqual([0, 2, 3, 5]);
    const { nozzle_volume_type: _, ...unsaid } = source;
    expect(bambuFilamentVariantLayout(unsaid, 4)?.slots.map((slot) => slot.standard)).toEqual([0, 2, 3, 5]);
  });

  it("goes by the filament index, not the position", () => {
    const slots = bambuFilamentVariantLayout({ ...source, filament_self_index: [2, 2, 1], filament_extruder_variant: [STANDARD, HIGH_FLOW, STANDARD] }, 2)?.slots;
    expect(slots).toEqual([
      { standard: 2, highFlow: null },
      { standard: 0, highFlow: 1 },
    ]);
  });

  it("is null for one value per filament, a Snapmaker Orca save or anything malformed", () => {
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "2"], filament_extruder_variant: [STANDARD, STANDARD] }, 2)).toBeNull();
    expect(bambuFilamentVariantLayout({ filament_flow_step_size: ["2"], filament_flow_support: ["standard", "high_flow"] }, 1)).toBeNull();
    // Creality Print 7.3 writes one index for four filaments.
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1"] }, 4)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "1", "2", "3", "3", "5", "5"] }, 4)).toBeNull(); // no filament 4
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "1", "2", "3", "3", "0", "4"] }, 4)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "1", "2", "3", "3", "4", "4.5"] }, 4)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "1", "2", "3", "3", "4", { valueOf: () => 4 }] }, 4)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: ["1", "1", "1", "1", "1", "2"], filament_extruder_variant: Array(6).fill(STANDARD) }, 2)).toBeNull(); // five values for one filament
    expect(bambuFilamentVariantLayout({ ...source, filament_extruder_variant: [...source.filament_extruder_variant.slice(0, 6), 7] }, 4)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: "1,1,2" }, 2)).toBeNull();
    expect(bambuFilamentVariantLayout(source, 0)).toBeNull();
    expect(bambuFilamentVariantLayout({ ...source, filament_self_index: Array(100_000).fill("1"), filament_extruder_variant: Array(100_000).fill(STANDARD) }, 4)).toBeNull();
  });
});
