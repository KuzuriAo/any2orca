// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { FILAMENT_COLOR_ROWS } from "../archive/filamentColorNames.js";
import { lookupFilamentColorName } from "../archive/lookupFilamentColorName.js";
import { inspectProject } from "../inspect.js";
import { buildFilamentConfigs } from "./buildFilamentConfigs.js";

const shape = { filament_type: [""], filament_colour: [""], filament_settings_id: [""] };

describe("buildFilamentConfigs", () => {
  it("one preset per name, from the first slot with it, in the order the names first appear", () => {
    const slots = [
      { filament_settings_id: "B", filament_type: "PLA", filament_colour: "#111111" },
      { filament_settings_id: "A", filament_type: "PETG", filament_colour: "#222222" },
      { filament_settings_id: "B", filament_type: "ABS", filament_colour: "#333333" },
      { filament_type: "TPU", filament_colour: "#444444" },
      { filament_type: "ASA", filament_colour: "#555555" },
    ];
    const { files, uniqueNames } = buildFilamentConfigs(slots, shape, new Set());
    expect(uniqueNames).toEqual(["B", "A", "Unnamed Filament"]);
    expect(Object.keys(files)).toEqual(["Metadata/filament_settings_1.config", "Metadata/filament_settings_2.config", "Metadata/filament_settings_3.config"]);
    expect(files["Metadata/filament_settings_1.config"].filament_type).toEqual(["PLA"]);
    expect(files["Metadata/filament_settings_3.config"].filament_type).toEqual(["TPU"]);
  });

  it("50,000 slots with distinct names, in linear time", () => {
    // Scanning the list of names for every slot took about 40 seconds at this size.
    const slots = Array.from({ length: 50_000 }, (_, i) => ({ filament_settings_id: `Filament ${i}`, filament_type: "PLA", filament_colour: "#FF0000" }));
    const started = performance.now();
    const { files } = buildFilamentConfigs(slots, shape, new Set());
    expect(performance.now() - started).toBeLessThan(1000);
    expect(Object.keys(files)).toHaveLength(50_000);
  });
});

describe("lookupFilamentColorName", () => {
  it("finds every row the way a scan in row order did, the first row winning a shared line and hex", () => {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    for (const [, type, hex] of FILAMENT_COLOR_ROWS) {
      const first = FILAMENT_COLOR_ROWS.find(([, t, h]) => normalize(t) === normalize(type) && h === hex)!;
      expect(lookupFilamentColorName(`  ${type.toUpperCase()}  @Any Printer`, ` ${hex.toLowerCase().slice(1)} `)).toEqual({ vendor: first[0], name: first[3] });
    }
    expect(lookupFilamentColorName("Bambu PLA Matte @BBL X1C", "#123457")).toBeNull();
    expect(lookupFilamentColorName("Unknown Line @X", "#000000")).toBeNull();
  });

  it("an inspection of 50,000 filament slots, in linear time", () => {
    // Normalizing every catalog row for every slot took about eight seconds at this size.
    const n = 50_000;
    const settings = { filament_colour: Array(n).fill("#000000"), filament_type: Array(n).fill("PLA"), filament_settings_id: Array.from({ length: n }, (_, i) => (i % 2 ? "Bambu PLA Matte @BBL X1C" : `Filament ${i}`)) };
    const started = performance.now();
    const inspection = inspectProject(settings, [], [], 0);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(inspection.filaments).toHaveLength(n);
    expect(inspection.filaments[1].colorName).toEqual({ vendor: "bambu", name: "Matte Charcoal" });
  });
});
