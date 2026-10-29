// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { extractFilamentSlots } from "./extractFilamentSlots.js";

const templateKeys = new Set(["filament_type", "filament_vendor"]);
const extraKeys = new Set(["filament_colour", "filament_ids"]);
const filamentKeyBlocklist = new Set(["compatible_printers"]);

describe("extractFilamentSlots", () => {
  it("returns null/[] and warns when filament_colour is missing", () => {
    const warnings: string[] = [];
    const result = extractFilamentSlots({}, templateKeys, extraKeys, filamentKeyBlocklist, warnings);
    expect(result).toEqual({ filamentKeyArrays: null, slots: [] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("has no filament_colour list");
  });

  it("returns null/[] and warns when filament_colour is an empty array", () => {
    const result = extractFilamentSlots({ filament_colour: [] }, templateKeys, extraKeys, filamentKeyBlocklist, []);
    expect(result).toEqual({ filamentKeyArrays: null, slots: [] });
  });

  it("reshapes each relevant key to the filament count and builds one slot per filament", () => {
    const bambuSettings = {
      filament_colour: ["#FF0000", "#00FF00"],
      filament_type: ["PLA", "PETG"],
      filament_vendor: ["Bambu", "Bambu"],
      filament_ids: ["GFA00", "GFA01"],
      not_a_filament_key: ["x", "y"],
    };
    const result = extractFilamentSlots(bambuSettings, templateKeys, extraKeys, filamentKeyBlocklist, []);

    expect(result.filamentKeyArrays).toEqual({
      filament_colour: ["#FF0000", "#00FF00"],
      filament_type: ["PLA", "PETG"],
      filament_vendor: ["Bambu", "Bambu"],
      filament_ids: ["GFA00", "GFA01"],
    });
    expect(result.slots).toEqual([
      { filament_colour: "#FF0000", filament_type: "PLA", filament_vendor: "Bambu", filament_ids: "GFA00" },
      { filament_colour: "#00FF00", filament_type: "PETG", filament_vendor: "Bambu", filament_ids: "GFA01" },
    ]);
  });

  it("skips a filament key blocked via filamentKeyBlocklist even if it's in the template keys", () => {
    const bambuSettings = {
      filament_colour: ["#FF0000"],
      compatible_printers: ["Some Printer"],
    };
    const withBlockedKey = new Set(["filament_type", "compatible_printers"]);
    const result = extractFilamentSlots(bambuSettings, withBlockedKey, extraKeys, filamentKeyBlocklist, []);
    expect(result.filamentKeyArrays).not.toHaveProperty("compatible_printers");
  });

  it("uses the first values of a longer list with no variant names, with a warning", () => {
    const warnings: string[] = [];
    const bambuSettings = {
      filament_colour: ["#FF0000", "#00FF00"],
      filament_type: ["PLA", "PETG", "TPU"], // a stale third entry
    };
    const result = extractFilamentSlots(bambuSettings, templateKeys, extraKeys, filamentKeyBlocklist, warnings);
    expect(result.filamentKeyArrays?.filament_type).toEqual(["PLA", "PETG"]);
    expect(warnings.some((w) => w.includes("filament_type has 3 values for 2 filaments"))).toBe(true);
  });

  it("skips a list shorter than the filament count, with a warning", () => {
    const warnings: string[] = [];
    const bambuSettings = { filament_colour: ["#FF0000", "#00FF00", "#0000FF"], filament_type: ["PLA", "PETG"] };
    const result = extractFilamentSlots(bambuSettings, templateKeys, extraKeys, filamentKeyBlocklist, warnings);
    expect(result.filamentKeyArrays).not.toHaveProperty("filament_type");
    expect(warnings.some((w) => w.startsWith("  WARN: filament_type has 2 values for 3 filaments"))).toBe(true);
  });

  it("reports many stale lists as one warning, naming the settings", () => {
    const warnings: string[] = [];
    const keys = ["filament_type", "filament_density", "filament_cost", "filament_diameter", "nozzle_temperature", "bed_temperature", "fan_min_speed", "fan_max_speed"];
    const bambuSettings: Record<string, unknown> = { filament_colour: ["#FF0000", "#00FF00"] };
    for (const key of keys) bambuSettings[key] = ["1", "2", "3"]; // each has a stale third entry
    const result = extractFilamentSlots(bambuSettings, new Set(keys), extraKeys, filamentKeyBlocklist, warnings);
    for (const key of keys) expect(result.filamentKeyArrays?.[key]).toEqual(["1", "2"]);
    const stale = warnings.filter((w) => w.includes("values for 2 filaments"));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatch(/^ {2}WARN: 8 filament settings have 3 values for 2 filaments in the source file; the first 2 of each are used: .+ and 2 more\.$/);
  });

  it("ignores non-array values for a relevant key", () => {
    const bambuSettings = { filament_colour: ["#FF0000"], filament_type: "PLA" };
    const result = extractFilamentSlots(bambuSettings, templateKeys, extraKeys, filamentKeyBlocklist, []);
    expect(result.filamentKeyArrays).not.toHaveProperty("filament_type");
  });

  it("uses the High Flow column of a per-nozzle-variant array when nozzle_volume_type says HighFlow", () => {
    const bambuSettings = {
      nozzle_diameter: ["0.4"],
      filament_colour: ["#FF0000"],
      nozzle_volume_type: ["HighFlow"],
      filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
      filament_type: ["PETG-Standard", "PETG-HighFlow"], // 2 values for 1 filament slot -> reshaped by variant
    };
    const result = extractFilamentSlots(bambuSettings, templateKeys, extraKeys, filamentKeyBlocklist, []);
    expect(result.filamentKeyArrays?.filament_type).toEqual(["PETG-HighFlow"]);
  });

  it("takes each filament's standard value from a Snapmaker Orca save, even when filaments carry different numbers of values", () => {
    // Shaped like a real save: two filaments with a standard value only, then one with standard and high flow.
    const warnings: string[] = [];
    const source = {
      nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"],
      filament_colour: ["#FFFFFF", "#000000", "#FF0000"],
      filament_flow_step_size: ["1", "1", "2"],
      filament_flow_support: ["standard", "standard", "standard", "high_flow"],
      filament_flow_ratio: ["0.98", "0.97", "0.966", "0.95"],
      nozzle_temperature: ["220", "215", "210", "230"],
    };
    const keys = new Set([...templateKeys, "filament_flow_ratio", "nozzle_temperature", "filament_flow_support", "filament_flow_step_size"]);
    const result = extractFilamentSlots(source, keys, extraKeys, filamentKeyBlocklist, warnings);
    expect(result.filamentKeyArrays?.filament_flow_ratio).toEqual(["0.98", "0.97", "0.966"]);
    expect(result.filamentKeyArrays?.nozzle_temperature).toEqual(["220", "215", "210"]);
    // The layout's own keys are rewritten for the target later, not reshaped (and not warned about).
    expect(result.filamentKeyArrays).not.toHaveProperty("filament_flow_support");
    expect(warnings).toEqual([]);
  });
});
