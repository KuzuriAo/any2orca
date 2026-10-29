// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { buildFilamentConfigs } from "./buildFilamentConfigs.js";

const filamentShape = {
  filament_type: [""],
  filament_vendor: [""],
  default_filament_colour: [""],
  name: "",
  filament_settings_id: [""],
  compatible_printers: [""],
};
const filamentKeyBlocklist = new Set(["compatible_printers", "compatible_printers_condition"]);

describe("buildFilamentConfigs", () => {
  it("returns empty results for no slots", () => {
    expect(buildFilamentConfigs([], filamentShape, filamentKeyBlocklist)).toEqual({
      files: {},
      uniqueNames: null,
    });
  });

  it("deduplicates slots sharing the same filament_settings_id into one file", () => {
    const slots = [
      { filament_settings_id: "Bambu PLA Basic", filament_colour: "#FF0000", filament_type: "PLA" },
      { filament_settings_id: "Bambu PETG", filament_colour: "#00FF00", filament_type: "PETG" },
      { filament_settings_id: "Bambu PLA Basic", filament_colour: "#0000FF", filament_type: "PLA" },
    ];
    const result = buildFilamentConfigs(slots, filamentShape, filamentKeyBlocklist);

    expect(result.uniqueNames).toEqual(["Bambu PLA Basic", "Bambu PETG"]);
    expect(Object.keys(result.files)).toEqual([
      "Metadata/filament_settings_1.config",
      "Metadata/filament_settings_2.config",
    ]);
    // Representative slot is the FIRST match for that name (index 0's color, not index 2's).
    expect(result.files["Metadata/filament_settings_1.config"].default_filament_colour).toEqual(["#FF0000"]);
  });

  it("falls back to 'Unnamed Filament' when filament_settings_id is missing", () => {
    const result = buildFilamentConfigs([{ filament_colour: "#FF0000" }], filamentShape, filamentKeyBlocklist);
    expect(result.uniqueNames).toEqual(["Unnamed Filament"]);
    expect(result.files["Metadata/filament_settings_1.config"].name).toBe("Unnamed Filament");
  });

  it("renames filament_colour to default_filament_colour, wrapped in an array", () => {
    const result = buildFilamentConfigs(
      [{ filament_settings_id: "X", filament_colour: "#ABCDEF" }],
      filamentShape,
      filamentKeyBlocklist,
    );
    const cfg = result.files["Metadata/filament_settings_1.config"];
    expect(cfg.default_filament_colour).toEqual(["#ABCDEF"]);
    expect(cfg).not.toHaveProperty("filament_colour");
  });

  it("skips keys in filamentKeyBlocklist even if present in the shape template", () => {
    const result = buildFilamentConfigs(
      [{ filament_settings_id: "X", compatible_printers: "Some Printer" }],
      filamentShape,
      filamentKeyBlocklist,
    );
    // Shape default survives untouched (not [Some Printer]) since the blocklisted key was never applied.
    expect(result.files["Metadata/filament_settings_1.config"].compatible_printers).toEqual([""]);
  });

  it("skips keys not present in the shape template at all", () => {
    const result = buildFilamentConfigs(
      [{ filament_settings_id: "X", filament_ids: "GFA00" }],
      filamentShape,
      filamentKeyBlocklist,
    );
    expect(result.files["Metadata/filament_settings_1.config"]).not.toHaveProperty("filament_ids");
  });

  it("sets name and filament_settings_id (wrapped in an array) from the unique name", () => {
    const result = buildFilamentConfigs([{ filament_settings_id: "Bambu ABS" }], filamentShape, filamentKeyBlocklist);
    const cfg = result.files["Metadata/filament_settings_1.config"];
    expect(cfg.name).toBe("Bambu ABS");
    expect(cfg.filament_settings_id).toEqual(["Bambu ABS"]);
  });
});
