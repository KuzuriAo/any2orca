// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { detectNozzleDiameter, sourceNozzleSizes } from "./detectNozzleDiameter.js";

describe("detectNozzleDiameter", () => {
  it("reads the first entry of a Bambu-style per-extruder array", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"] })).toBe("0.4");
  });

  it("accepts a bare scalar", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: "0.6" })).toBe("0.6");
    expect(detectNozzleDiameter({ nozzle_diameter: 0.6 })).toBe("0.6");
  });

  it("snaps an exact match for each supported size", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.2"] })).toBe("0.2");
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.8"] })).toBe("0.8");
  });

  it("fuzzy-matches an unsupported diameter to the nearest supported one", () => {
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.3"] })).toBe("0.2");
    expect(detectNozzleDiameter({ nozzle_diameter: ["0.5"] })).toBe("0.4");
    expect(detectNozzleDiameter({ nozzle_diameter: ["1.0"] })).toBe("0.8");
  });

  it("returns null when nozzle_diameter is missing or unparseable", () => {
    expect(detectNozzleDiameter({})).toBeNull();
    expect(detectNozzleDiameter({ nozzle_diameter: "not-a-number" })).toBeNull();
    expect(detectNozzleDiameter({ nozzle_diameter: [] })).toBeNull();
  });
});

describe("sourceNozzleSizes", () => {
  it("is one size for a single-nozzle file", () => {
    expect(sourceNozzleSizes({ nozzle_diameter: ["0.6"], filament_colour: ["#000", "#fff"] })).toEqual({ sizes: ["0.6"], mixed: false, filamentSizes: ["0.6", "0.6"] });
  });

  it("reads each nozzle's size and each filament's nozzle from a multi-nozzle file", () => {
    // An H3C with a 0.2 PrintTool in slot 1 and 0.4 in the rest; filament 1 on it, the others on 0.4.
    const settings = {
      nozzle_diameter: ["0.2"],
      extruder_nozzle_diameter: ["0.2", "0.4", "0.4", "0.4", "0.4", "0.4", "0.4", "0.4", "0.4"],
      multi_nozzle_diameter_mode: "1",
      filament_nozzle_map: ["0", "1", "1", "1"],
      filament_colour: ["#000000", "#FFFFFF", "#0056B8", "#C12E1F"],
    };
    expect(sourceNozzleSizes(settings)).toEqual({ sizes: ["0.2", "0.4"], mixed: true, filamentSizes: ["0.2", "0.4", "0.4", "0.4"] });
  });

  it("is one size when every nozzle has the same", () => {
    const settings = { nozzle_diameter: ["0.4"], extruder_nozzle_diameter: Array(9).fill("0.4"), multi_nozzle_diameter_mode: "0", filament_nozzle_map: ["0", "0"], filament_colour: ["#000", "#fff"] };
    expect(sourceNozzleSizes(settings)).toEqual({ sizes: ["0.4"], mixed: false, filamentSizes: ["0.4", "0.4"] });
  });

  it("leaves a filament's size unknown when the map doesn't point at a listed nozzle", () => {
    const settings = { extruder_nozzle_diameter: ["0.2", "0.4"], filament_nozzle_map: ["7", "x"], filament_colour: ["#000", "#fff"] };
    expect(sourceNozzleSizes(settings)).toEqual({ sizes: ["0.2", "0.4"], mixed: true, filamentSizes: [null, null] });
  });

  it("has no sizes when the file gives none", () => {
    expect(sourceNozzleSizes({ filament_colour: ["#000"] })).toEqual({ sizes: [], mixed: false, filamentSizes: [null] });
  });
});
