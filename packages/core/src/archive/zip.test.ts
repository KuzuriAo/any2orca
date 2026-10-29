// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { applyConvertResponse, prepareConvertRequest } from "./zip.js";

const fixturePath = fileURLToPath(new URL("../test-fixtures/synthetic-2plate.3mf", import.meta.url));
const fixtureBytes = new Uint8Array(readFileSync(fixturePath));
const TEST_APPLICATION = "Snapmaker_Orca-2.4.0";

describe("prepareConvertRequest", () => {
  it("parses project_settings.config, tolerating the trailing cache_hash garbage", () => {
    const { request, warnings } = prepareConvertRequest(fixtureBytes);
    expect(request.projectSettings.layer_height).toBe("0.28");
    expect(request.projectSettings.filament_colour).toEqual(["#FF0000", "#00FF00"]);
    expect(warnings.some((w) => w.includes("cache_hash"))).toBe(true);
  });

  it("computes each object's plate assignment and world-space bounding box", () => {
    const { request } = prepareConvertRequest(fixtureBytes);
    expect(request.objects).toHaveLength(2);

    const obj1 = request.objects.find((o) => o.id === "1")!;
    expect(obj1.plate).toBe(1);
    expect(obj1.bbox).toEqual([10, 20, 10, 20]); // 10x10 cube translated by (10, 10, 0)

    const obj2 = request.objects.find((o) => o.id === "2")!;
    expect(obj2.plate).toBe(2);
    expect(obj2.bbox).toEqual([500, 520, 10, 30]); // 20x20 cube translated by (500, 10, 0)
  });

  it("finds the bbox centers known for this fixture", () => {
    // The fixture's known centers:
    // "plate 1: true geometric center (15.00, 15.00)" / "plate 2: true geometric center (510.00, 20.00)".
    const { request } = prepareConvertRequest(fixtureBytes);
    const center = (bbox: readonly [number, number, number, number]): [number, number] => [
      (bbox[0] + bbox[1]) / 2,
      (bbox[2] + bbox[3]) / 2,
    ];
    expect(center(request.objects.find((o) => o.id === "1")!.bbox!)).toEqual([15, 15]);
    expect(center(request.objects.find((o) => o.id === "2")!.bbox!)).toEqual([510, 20]);
  });

  const text = (s: string) => new TextEncoder().encode(s);

  it("explains a 3MF with no print settings, without talking about uploads", () => {
    const zip = zipSync({ "3D/3dmodel.model": text("<model/>") });
    expect(() => prepareConvertRequest(zip)).toThrow(/holds only the model, with no print settings, so there's nothing to convert: open it in Snapmaker Orca/);
    expect(() => prepareConvertRequest(zip)).not.toThrow(/upload/);
  });

  it("refuses a sliced plate file, which carries another printer's G-code, even with print settings", () => {
    const sliced = zipSync({
      "3D/3dmodel.model": text("<model/>"),
      "Metadata/project_settings.config": text("{}"),
      "Metadata/plate_1.gcode": text("G28\n"),
    });
    expect(() => prepareConvertRequest(sliced)).toThrow(/sliced plate file \(\.gcode\.3mf\).*Convert the project file it was sliced from/);
    const noSettings = zipSync({ "3D/3dmodel.model": text("<model/>"), "Metadata/plate_2.gcode": text("G28\n") });
    expect(() => prepareConvertRequest(noSettings)).toThrow(/sliced plate file/);
  });

  it("says when the print settings aren't valid JSON", () => {
    const zip = zipSync({ "Metadata/project_settings.config": text("not json at all"), "3D/3dmodel.model": text("<model/>") });
    expect(() => prepareConvertRequest(zip)).toThrow(/print settings are damaged/);
  });

  it("explains a 3MF with no model", () => {
    const zip = zipSync({ "Metadata/project_settings.config": text("{}") });
    expect(() => prepareConvertRequest(zip)).toThrow(/has no model in it/);
  });
});

describe("applyConvertResponse", () => {
  it("drops Bambu-only files (plate_N.json, filament_sequence.json, cut_information.xml)", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const output = applyConvertResponse(parsed, {
      projectSettings: { layer_height: "0.28" },
      configFiles: {},
      shifts: {},
      application: TEST_APPLICATION,
    });
    const outputEntries = unzipSync(output);
    expect(outputEntries).not.toHaveProperty("Metadata/plate_1.json");
    expect(outputEntries).not.toHaveProperty("Metadata/filament_sequence.json");
    expect(outputEntries).not.toHaveProperty("Metadata/cut_information.xml");
  });

  it("strips filament_volume_maps from model_settings.config", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const output = applyConvertResponse(parsed, {
      projectSettings: {},
      configFiles: {},
      shifts: {},
      application: TEST_APPLICATION,
    });
    const outputEntries = unzipSync(output);
    const modelSettingsText = new TextDecoder().decode(outputEntries["Metadata/model_settings.config"]);
    expect(modelSettingsText).not.toContain("filament_volume_maps");
  });

  it("applies shifts to both 3dmodel.model items and model_settings.config assemble_items", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const output = applyConvertResponse(parsed, {
      projectSettings: {},
      configFiles: {},
      shifts: { "1": [100, 200], "2": [-50, 0] },
      application: TEST_APPLICATION,
    });
    const outputEntries = unzipSync(output);

    const modelText = new TextDecoder().decode(outputEntries["3D/3dmodel.model"]);
    expect(modelText).toContain('transform="1 0 0 0 1 0 0 0 1 110 210 0"'); // 10+100, 10+200
    expect(modelText).toContain('transform="1 0 0 0 1 0 0 0 1 450 10 0"'); // 500-50, 10+0

    const modelSettingsText = new TextDecoder().decode(outputEntries["Metadata/model_settings.config"]);
    expect(modelSettingsText).toContain('transform="1 0 0 0 1 0 0 0 1 110 210 0"');
    expect(modelSettingsText).toContain('transform="1 0 0 0 1 0 0 0 1 450 10 0"');
  });

  it("writes the response's merged project_settings.config and every config_files entry", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const output = applyConvertResponse(parsed, {
      projectSettings: { layer_height: "0.28", nozzle_type: "stainless_steel" },
      configFiles: { "Metadata/machine_settings_1.config": { name: "U1" } },
      shifts: {},
      application: TEST_APPLICATION,
    });
    const outputEntries = unzipSync(output);

    const projectSettings = JSON.parse(new TextDecoder().decode(outputEntries["Metadata/project_settings.config"]));
    expect(projectSettings).toEqual({ layer_height: "0.28", nozzle_type: "stainless_steel" });

    const machineSettings = JSON.parse(new TextDecoder().decode(outputEntries["Metadata/machine_settings_1.config"]));
    expect(machineSettings).toEqual({ name: "U1" });
  });

  it("carries every other zip entry through byte-for-byte untouched", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const originalContentTypes = parsed.zipEntries["[Content_Types].xml"];
    const output = applyConvertResponse(parsed, {
      projectSettings: {},
      configFiles: {},
      shifts: {},
      application: TEST_APPLICATION,
    });
    const outputEntries = unzipSync(output);
    expect(outputEntries["[Content_Types].xml"]).toEqual(originalContentTypes);
    expect(outputEntries["_rels/.rels"]).toEqual(parsed.zipEntries["_rels/.rels"]);
  });

  it("writes every entry with the same fixed time, so output doesn't depend on when or where it was converted", () => {
    const parsed = prepareConvertRequest(fixtureBytes);
    const output = applyConvertResponse(parsed, { projectSettings: {}, configFiles: {}, shifts: {}, application: TEST_APPLICATION });
    // Each local file header starts with PK\x03\x04; its time and date fields are bytes 10 to 13.
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const times = new Set<string>();
    for (let i = 0; i + 30 <= output.length; i++) {
      if (view.getUint32(i, true) !== 0x04034b50) continue;
      times.add(`${view.getUint16(i + 10, true)}:${view.getUint16(i + 12, true)}`);
      i += 29;
    }
    // 2000-01-01 00:00:00 as a zip (DOS) time: time 0, date ((2000 - 1980) << 9) | (1 << 5) | 1.
    expect([...times]).toEqual([`0:${(20 << 9) | (1 << 5) | 1}`]);
  });
});
