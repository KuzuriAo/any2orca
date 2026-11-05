// SPDX-License-Identifier: MIT
// Where a PrusaSlicer project's pauses and color changes land. In PrusaSlicer 2.9 each bed keeps its own list of
// codes at heights, applied to everything on that bed; the converter gives each bed's list to the plate the bed
// becomes, and to no other. The control project has a different set on each bed, and one bed with none.
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../../index.js";
import { testProfileSource } from "../../test-helpers.js";

const fixture = new URL("../../test-fixtures/prusaslicer/prusaslicer-2.9.7-beds-pauses.3mf", import.meta.url);

describe("the pause control project", () => {
  it("is the four-bed save with a color-change file in PrusaSlicer 2.9.7's own format: bed 0 always, other beds only with codes", () => {
    const xml = strFromU8(unzipSync(new Uint8Array(readFileSync(fixture)))["Metadata/Prusa_Slicer_custom_gcode_per_print_z.xml"]!);
    expect([...xml.matchAll(/<custom_gcodes_per_print_z bed_idx="(\d+)">/g)].map((m) => m[1])).toEqual(["0", "1", "3"]);
    expect((xml.match(/<mode value="MultiExtruder"\/>/g) ?? []).length).toBe(3);
  });

  it("gives each plate exactly its own bed's pauses, at the same heights, and the bed with none gets none", async () => {
    const { output, report } = await convert(new Uint8Array(readFileSync(fixture)), { profiles: testProfileSource() });
    const entries = unzipSync(output);
    const xml = strFromU8(entries["Metadata/custom_gcode_per_layer.xml"]!);
    const plates = [...xml.matchAll(/<plate>\n<plate_info id="(\d+)"\/>\n([\s\S]*?)<\/plate>/g)].map(([, id, body]) => ({
      plate: Number(id),
      layers: [...body!.matchAll(/<layer top_z="([^"]+)" type="(\d)" extruder="(\d+)" color="([^"]*)" extra="([^"]*)"/g)].map(([, z, type, extruder, color, extra]) => ({
        height: Math.round(Number(z) * 100) / 100,
        type,
        extruder,
        color,
        extra,
      })),
    }));
    expect(plates).toEqual([
      {
        plate: 1,
        layers: [
          { height: 10.2, type: "1", extruder: "1", color: "", extra: "Plate 1 pause at 10.2 mm" },
          { height: 20.2, type: "1", extruder: "2", color: "#FB0207", extra: "Color change to #FB0207" },
        ],
      },
      { plate: 2, layers: [{ height: 15.2, type: "1", extruder: "1", color: "", extra: "Plate 2 pause at 15.2 mm" }] },
      { plate: 4, layers: [{ height: 6.2, type: "1", extruder: "1", color: "#0000FF", extra: "Color change to #0000FF" }] },
    ]);
    // Each plate's object is the one from the bed of the same number, so the pauses act on what they did in PrusaSlicer.
    const modelSettings = strFromU8(entries["Metadata/model_settings.config"]!);
    const objectsOn = (plate: number) => [...new RegExp(`plater_id" value="${plate}"[\\s\\S]*?</plate>`).exec(modelSettings)![0].matchAll(/object_id" value="(\d+)"/g)].map((m) => m[1]);
    expect([1, 2, 3, 4].map(objectsOn)).toEqual([["1"], ["2"], ["3"], ["4"]]);
    expect(report.warnings).toContainEqual(expect.stringContaining("2 color change(s) at set heights become pauses"));
  });
});
