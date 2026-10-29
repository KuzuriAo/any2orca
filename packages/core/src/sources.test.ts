// SPDX-License-Identifier: MIT
// One small project, built in Bambu Studio and re-saved by each supported slicer
// (test-fixtures/sources/README.md). Each file is checked against what the scene
// says it should contain, and against what its slicer did to it on the way.
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, inspect } from "./project.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const COLORS = ["#000000", "#FFFFFF", "#0056B8", "#C12E1F"];

interface Source {
  file: string;
  vendor: string;
  printerModel: string;
  profileId: string;
  /** The scene's four process changes survived in this file. */
  sceneSettings: boolean;
  /** Text every one of these warnings must contain, in any order. */
  warnings: string[];
}

const SOURCES: Source[] = [
  { file: "bambu-studio-2.8.4.57-beta.3mf", vendor: "bambu", printerModel: "Bambu Lab X1 Carbon", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "bambu-studio-2.8.4.57-beta-object-override.3mf", vendor: "bambu", printerModel: "Bambu Lab X1 Carbon", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "anycubic-slicer-next-2.0.0.3-scene.3mf", vendor: "anycubic", printerModel: "Anycubic Kobra S1", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "anycubic-slicer-next-2.0.0.3-reset.3mf", vendor: "anycubic", printerModel: "Anycubic Kobra S1", profileId: "snapmaker-u1-0.4-standard", sceneSettings: false, warnings: [] },
  { file: "creality-print-7.3.0.6157-scene.3mf", vendor: "creality", printerModel: "Creality K2 Plus", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: ["dont_slow_down_outer_wall", "max volumetric speed"] },
  // Creality Print reset the process to 0.12mm Standard on load but kept the four changes.
  { file: "creality-print-7.3.0.6157-reset.3mf", vendor: "creality", printerModel: "Creality K2 Plus", profileId: "snapmaker-u1-0.4-0.12fin", sceneSettings: true, warnings: ["dont_slow_down_outer_wall", "max volumetric speed"] },
  { file: "elegoo-slicer-1.5.3.5-scene.3mf", vendor: "elegoo", printerModel: "Elegoo Centauri Carbon 2", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "flash-studio-1.7.20-scene.3mf", vendor: "flashforge", printerModel: "Flashforge Creator 5 Pro", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  // Flash Studio dropped every change on load and switched to 0.08mm.
  { file: "flash-studio-1.7.20-reset.3mf", vendor: "flashforge", printerModel: "Flashforge Creator 5 Pro", profileId: "snapmaker-u1-0.4-0.08hq", sceneSettings: false, warnings: ["No changed print settings were marked"] },
];

function settingsOf(files: Record<string, Uint8Array>): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(files["Metadata/project_settings.config"]));
}

function text(files: Record<string, Uint8Array>, name: string): string {
  return new TextDecoder().decode(files[name]);
}

/** The `<object>` block in model_settings.config whose name is `name`. */
function objectBlock(modelSettings: string, name: string): string {
  const block = [...modelSettings.matchAll(/<object id="\d+">([\s\S]*?)<\/object>/g)]
    .map((m) => m[1])
    .find((b) => b.includes(`key="name" value="${name}"`));
  if (!block) throw new Error(`no object named ${name}`);
  return block;
}

describe.each(SOURCES)("$file", (source) => {
  const input = readFixture(`sources/${source.file}`);

  it("is recognized as its slicer's project, with the scene's plates, objects and filaments", () => {
    const info = inspect(input);
    expect(info.sourceVendor).toBe(source.vendor);
    expect(info.printerModel).toBe(source.printerModel);
    expect(info.matchNozzleDiameter).toBe("0.4");
    expect(info.plates).toEqual([1, 2]);
    expect(info.objects).toHaveLength(5);
    expect(info.filaments).toHaveLength(4);
  });

  it("converts onto the matching U1 profile, keeping colors, plate order and meshes", async () => {
    const { output, report } = await convert(input, { profiles: testProfileSource() });
    expect(report.profile.id).toBe(source.profileId);

    const before = unzipSync(input);
    const after = unzipSync(output);
    const settings = settingsOf(after);
    expect(settings.filament_colour).toEqual(COLORS);

    // Plate 1 prints by object; plate 2 follows the project, which prints by layer.
    const plates = [...text(after, "Metadata/model_settings.config").matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => m[1]);
    expect(plates).toHaveLength(2);
    expect(plates[0]).toContain('key="print_sequence" value="by object"');
    expect(plates[1]).not.toContain('key="print_sequence" value="by object"');
    expect(settings.print_sequence).toBe("by layer");

    for (const name of Object.keys(before).filter((n) => n.startsWith("3D/Objects/"))) {
      expect(after[name], name).toEqual(before[name]);
    }

    const warnings = report.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w)));
    expect(warnings).toHaveLength(source.warnings.length);
    for (const expected of source.warnings) {
      expect(warnings.some((w) => w.toLowerCase().includes(expected.toLowerCase())), expected).toBe(true);
    }

    if (source.sceneSettings) {
      expect(settings.wall_loops).toBe("3");
      expect(settings.top_surface_pattern).toBe("concentric");
      expect(settings.sparse_infill_density).toBe("10%");
      expect(settings.sparse_infill_pattern).toBe("gyroid");
    } else {
      // Nothing was marked as changed, so none of the scene's values can have come from the creator.
      expect(settings.wall_loops).not.toBe("3");
      expect(settings.sparse_infill_density).not.toBe("10%");
    }
  });
});

describe("Bambu Studio's per-variant filament values", () => {
  it("keeps the 225 °C edit on both filaments that share the edited preset", async () => {
    // Filaments 3 and 4 both use Bambu PLA Basic, so editing one slot edits the preset
    // for both. Values come in pairs per filament: the standard nozzle, then high flow.
    const { output } = await convert(readFixture("sources/bambu-studio-2.8.4.57-beta.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    const expected = ["220", "220", "220", "220", "225", "220", "225", "220"];
    expect(settings.nozzle_temperature).toEqual(expected);
    expect(settings.nozzle_temperature_initial_layer).toEqual(expected);
  });
});

describe("a per-object override", () => {
  it("keeps the Cube's 4 wall loops and leaves the other objects on the project's 3", async () => {
    const { output } = await convert(readFixture("sources/bambu-studio-2.8.4.57-beta-object-override.3mf"), { profiles: testProfileSource() });
    const after = unzipSync(output);
    const modelSettings = text(after, "Metadata/model_settings.config");
    expect(settingsOf(after).wall_loops).toBe("3");
    expect(objectBlock(modelSettings, "Cube")).toContain('key="wall_loops" value="4"');
    for (const name of ["Cylinder", "Disc", "Cone", "Hexagonal Prism"]) {
      expect(objectBlock(modelSettings, name), name).not.toContain('key="wall_loops"');
    }
  });
});
