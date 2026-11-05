// SPDX-License-Identifier: MIT
// What a conversion of each PrusaSlicer fixture contains, in one table. A change to the key map, the comparison with
// Prusa Research's presets or the reader that changes a converted file shows up here as a changed row, and the
// change needs a changeset marked "Output-affecting:" and its own test of the new behavior. Rows are facts a user
// sees in Snapmaker Orca, not a copy of the output.
import { readFileSync, readdirSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../../index.js";
import { testProfileSource } from "../../test-helpers.js";

const DIR = new URL("../../test-fixtures/prusaslicer/", import.meta.url);

interface Row {
  file: string;
  source: { format: string; slicerVersion: string };
  plates: number;
  objects: number;
  parts: number;
  colors: string[];
  /** Pauses and color changes at a height. */
  pauses: number;
  brimType: string;
  /** enable_support, support_type, support_style, support_on_build_plate_only. */
  supports: string[];
  /** The preset the project was compared with, and how many of its settings differed. */
  preset: [name: string, differing: string, compared: string];
}

const XL_COLORS = ["#000000", "#0000FF", "#21FF06", "#FB0207"];
const ROWS: Row[] = [
  { file: "prusaslicer-2.9.6.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.6" }, plates: 1, objects: 1, parts: 1, colors: ["#FFF2EC"], pauses: 0, brimType: "no_brim", supports: ["1", "normal(manual)", "snug", "0"], preset: ["0.20mm BALANCED @COREONE HF0.4", "3", "172"] },
  { file: "prusaslicer-2.9.6-fuzzy-skin.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.6" }, plates: 1, objects: 1, parts: 1, colors: ["#000000"], pauses: 0, brimType: "no_brim", supports: ["1", "normal(manual)", "snug", "0"], preset: ["0.20mm BALANCED @COREONE HF0.4", "3", "172"] },
  { file: "prusaslicer-2.9.6-scene.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.6" }, plates: 1, objects: 4, parts: 6, colors: XL_COLORS, pauses: 2, brimType: "no_brim", supports: ["1", "normal(auto)", "snug", "1"], preset: ["0.20mm QUALITY @XL 0.4", "7", "176"] },
  { file: "prusaslicer-2.9.6-beds.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.6" }, plates: 4, objects: 4, parts: 6, colors: XL_COLORS, pauses: 2, brimType: "no_brim", supports: ["1", "normal(auto)", "snug", "1"], preset: ["0.20mm QUALITY @XL 0.4", "7", "176"] },
  { file: "prusaslicer-2.9.7-beds-pauses.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.7" }, plates: 4, objects: 4, parts: 6, colors: XL_COLORS, pauses: 4, brimType: "no_brim", supports: ["1", "normal(auto)", "snug", "1"], preset: ["0.20mm QUALITY @XL 0.4", "7", "176"] },
  { file: "prusaslicer-2.9.7-beds.3mf", source: { format: "prusaslicer", slicerVersion: "2.9.7" }, plates: 4, objects: 4, parts: 6, colors: XL_COLORS, pauses: 2, brimType: "no_brim", supports: ["1", "normal(auto)", "snug", "1"], preset: ["0.20mm QUALITY @XL 0.4", "7", "176"] },
];

describe("what each PrusaSlicer fixture converts to", () => {
  it("has a row for every fixture, so a new one is a decision", () => {
    const files = readdirSync(DIR).filter((name) => name.endsWith(".3mf")).sort();
    expect(ROWS.map((row) => row.file).sort()).toEqual(files);
  });

  for (const row of ROWS) {
    it(row.file, async () => {
      const result = await convert(new Uint8Array(readFileSync(new URL(row.file, DIR))), { profiles: testProfileSource() });
      const entries = unzipSync(result.output);
      const settings = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]!)) as Record<string, unknown>;
      const modelSettings = strFromU8(entries["Metadata/model_settings.config"]!);
      const gcodes = entries["Metadata/custom_gcode_per_layer.xml"] ? strFromU8(entries["Metadata/custom_gcode_per_layer.xml"]) : "";
      const note = result.report.warnings.find((w) => w.includes("compared with"));
      const compared = /"([^"]+)".*?: (\d+) of (\d+) differ/.exec(note ?? "");

      expect(JSON.parse(strFromU8(entries["Metadata/any2orca.json"]!)).source).toEqual(row.source);
      expect(result.report.plates).toBe(row.plates);
      expect((modelSettings.match(/<plate>/g) ?? []).length).toBe(row.plates);
      expect(result.report.objects).toBe(row.objects);
      expect((modelSettings.match(/<part /g) ?? []).length).toBe(row.parts);
      expect(settings.filament_colour).toEqual(row.colors);
      expect((gcodes.match(/<layer /g) ?? []).length).toBe(row.pauses);
      expect(settings.brim_type).toBe(row.brimType);
      expect([settings.enable_support, settings.support_type, settings.support_style, settings.support_on_build_plate_only]).toEqual(row.supports);
      expect(compared?.slice(1)).toEqual(row.preset);
      // Always the U1's own printer, whatever printer the project was saved for.
      expect(settings.printer_model).toBe("Snapmaker U1");
    });
  }
});
