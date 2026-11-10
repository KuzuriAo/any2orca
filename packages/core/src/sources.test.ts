// SPDX-License-Identifier: MIT
// One small project, built in Bambu Studio and re-saved by each supported slicer
// (test-fixtures/sources/README.md). Each file is checked against what the scene
// says it should contain, and against what its slicer did to it on the way.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, inspect } from "./project.js";
import { SETTINGS_CATALOG } from "./diff/settingsCatalog.js";
import { PROFILES_DATA_DIR, readFixture, testProfileSource } from "./test-helpers.js";

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
  /** The creator's nozzle size, snapped to a U1 size (default "0.4"). */
  matchNozzle?: string;
  /** Every nozzle size the project uses (default ["0.4"]). */
  nozzleDiameters?: string[];
  /** The wall loops the converted file has when the scene settings survived (default "3"). */
  wallLoops?: string;
  /** Each filament's material (default four PLA). */
  types?: string[];
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
  { file: "qidi-studio-2.7.2.73-scene.3mf", vendor: "qidi", printerModel: "Q1 Pro", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  // QIDI Studio switched to the QIDI Q1 Pro and QIDI PLA Basic (colors kept, 210 °C) and kept the four process changes.
  { file: "qidi-studio-2.7.2.73-reset.3mf", vendor: "qidi", printerModel: "Q1 Pro", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  // Bambu Studio 2.9 saves of the scene: the X1C again, and the scene switched to Bambu's multi-nozzle printers.
  { file: "bambu-studio-2.9.1.70.3mf", vendor: "bambu", printerModel: "Bambu Lab X1 Carbon", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "bambu-studio-2.9.1.70-h2c.3mf", vendor: "bambu", printerModel: "Bambu Lab H2C", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: ["max volumetric speed"] },
  { file: "bambu-studio-2.9.1.70-x2d.3mf", vendor: "bambu", printerModel: "Bambu Lab X2D", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: [] },
  { file: "bambu-studio-2.9.1.70-h3c.3mf", vendor: "bambu", printerModel: "Bambu Lab H3C", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: ["max volumetric speed"] },
  // Creality Print's four-toolhead K3 (a nozzle-variant table per head); every filament became Hyper PLA, so the 225 °C is on all four.
  { file: "creality-print-7.3.1.6378-k3.3mf", vendor: "creality", printerModel: "Creality K3", profileId: "snapmaker-u1-0.4-standard", sceneSettings: true, warnings: ["dont_slow_down_outer_wall", "max volumetric speed"] },
  // Multi-diameter mode: a 0.2 PrintTool for filament 1 and the 2.85 mm TPU tool for filament 3; walls can't be set there ("Auto").
  {
    file: "bambu-studio-2.9.1.70-h3c-mixed.3mf",
    vendor: "bambu",
    printerModel: "Bambu Lab H3C",
    profileId: "snapmaker-u1-0.4-standard",
    sceneSettings: true,
    wallLoops: "2",
    matchNozzle: "0.2",
    nozzleDiameters: ["0.2", "0.4"],
    types: ["PLA", "PLA", "TPU", "PLA"],
    warnings: ["0.2 and 0.4 mm nozzles (filament 1 on 0.2 mm); converted for your 0.4 mm", "Filament 3 was Bambu TPU 75A(2.85mm) @BBL H3C (2.85 mm) on the creator's printer", "max volumetric speed", "8 values for 4 filaments"],
  },
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
    expect(info.matchNozzleDiameter).toBe(source.matchNozzle ?? "0.4");
    expect(info.nozzleDiameters).toEqual(source.nozzleDiameters ?? ["0.4"]);
    expect(info.plates).toEqual([1, 2]);
    expect(info.objects).toHaveLength(5);
    expect(info.filaments).toHaveLength(4);
    expect(info.filaments.map((f) => f.type)).toEqual(source.types ?? ["PLA", "PLA", "PLA", "PLA"]);
  });

  it("converts onto the matching U1 profile, keeping colors, plate order and meshes", async () => {
    const { output, report } = await convert(input, { profiles: testProfileSource() });
    expect(report.profile.id).toBe(source.profileId);

    const before = unzipSync(input);
    const after = unzipSync(output);
    const settings = settingsOf(after);
    expect(settings.filament_colour).toEqual(COLORS);
    // The U1 takes 1.75 mm filament, whatever the creator's printer took.
    expect(settings.filament_diameter).toEqual(["1.75", "1.75", "1.75", "1.75"]);

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
      expect(settings.wall_loops).toBe(source.wallLoops ?? "3");
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

/** The lines of G-code that would run: anything but blank lines and comments. */
function runnableLines(gcode: unknown): string[] {
  return String(gcode)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(";"));
}

describe("filament G-code from another printer", () => {
  it.each(SOURCES.map((s) => s.file))("never reaches the U1 file from %s, in the project or a filament preset", async (file) => {
    const { output } = await convert(readFixture(`sources/${file}`), { profiles: testProfileSource() });
    const after = unzipSync(output);
    const configs = [settingsOf(after), ...Object.keys(after).filter((n) => /^Metadata\/filament_settings_\d+\.config$/.test(n)).map((n) => JSON.parse(text(after, n)))];
    for (const config of configs) {
      for (const key of Object.keys(config).filter((k) => k.startsWith("filament_") && k.endsWith("_gcode"))) {
        for (const value of [config[key]].flat()) expect(runnableLines(value), key).toEqual([]);
      }
    }
  });

  it.each([
    ["creality-print-7.3.0.6157-scene.3mf", "Creality Print's moves Z for the K2"],
    ["bambu-studio-2.8.4.57-beta.3mf", "Bambu's switches its chamber fan"],
  ])("is counted with the printer settings that use the U1's own in What changed, for %s (%s)", async (file) => {
    const input = readFixture(`sources/${file}`);
    const source = settingsOf(unzipSync(input));
    expect(runnableLines([source.filament_start_gcode].flat()[0]).length).toBeGreaterThan(0);

    // The same file with the filament G-code already the U1's own: the printer-settings count is one lower.
    const entries = unzipSync(input);
    const { output: plain } = await convert(input, { profiles: testProfileSource() });
    source.filament_start_gcode = settingsOf(unzipSync(plain)).filament_start_gcode;
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));

    const count = (groups: { reason: string; items: { label: string }[] }[]) => {
      const line = groups.find((g) => g.reason === "stock")?.items.find((i) => /printer settings? \(G-code/.test(i.label))?.label ?? "";
      return Number(/^(\d+)/.exec(line)?.[1] ?? 0);
    };
    const { report: withCode } = await convert(input, { profiles: testProfileSource() });
    const { report: without } = await convert(zipSync(entries), { profiles: testProfileSource() });
    expect(count(withCode.whatChanged.groups)).toBe(count(without.whatChanged.groups) + 1);

    const filaments = withCode.whatChanged.groups.flatMap((g) => g.items).find((i) => /^4 filaments:/.test(i.label));
    expect(filaments?.label).toContain("except G-code, which is the U1's own");
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

  it.each([
    ["bambu-studio-2.9.1.70.3mf", "Bambu Studio 2.9 names the edited preset after the file"],
    ["bambu-studio-2.9.1.70-h3c.3mf", "an H3C stores one extruder with nine nozzles"],
    ["bambu-studio-2.9.1.70-h2c.3mf", "an H2C stores two extruders with three variants on the left"],
    ["bambu-studio-2.9.1.70-x2d.3mf", "an X2D stores direct-drive and Bowden variants for two nozzles"],
  ])("keeps the 225 °C edit in the standard value of filaments 3 and 4 from %s (%s)", async (file) => {
    const { output } = await convert(readFixture(`sources/${file}`), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    expect(settings.nozzle_temperature).toEqual(["220", "220", "220", "220", "225", "220", "225", "220"]);
    expect(settings.nozzle_temperature_initial_layer).toEqual(["220", "220", "220", "220", "225", "220", "225", "220"]);
  });

  it("takes the X2D's direct-drive values, which suit the U1's direct-drive toolheads, not its Bowden ones", async () => {
    // Filaments 3 and 4 print on the X2D's Bowden nozzle, whose retraction is 3 mm; the U1's toolheads are direct drive.
    const { output } = await convert(readFixture("sources/bambu-studio-2.9.1.70-x2d.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    expect(settings.filament_retraction_length).toEqual(Array(8).fill("0.4"));
  });

  it("reads a filament with one value column among filaments with two (the H3C's TPU285 nozzle)", async () => {
    const { output, report } = await convert(readFixture("sources/bambu-studio-2.9.1.70-h3c-mixed.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    // Filament 3 (TPU) had one column and is set to Snapmaker TPU's preset (235 °C) for its 2.85 mm diameter; filament 4 has its 225 °C in the standard column.
    expect((settings.nozzle_temperature as string[]).filter((_, i) => i % 2 === 0).slice(0, 4)).toEqual(["220", "220", "235", "225"]);
    expect(report.nozzle).toEqual({ choice: "0.4", size: "0.4", sourceSizes: ["0.2", "0.4"] });
    expect(settings.layer_height).toBe("0.2");
  });

  it("sets a 2.85 mm filament to Snapmaker's preset for its material, said first among the notes", async () => {
    const { output, report } = await convert(readFixture("sources/bambu-studio-2.9.1.70-h3c-mixed.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    // Bambu TPU 75A(2.85mm) was tuned for 2.85 mm filament in the H3C's TPU tool: flow ratio 1.21, 10 mm³/s.
    expect(report.filaments[2]).toMatchObject({ slot: 3, type: "TPU", sourceName: "Bambu TPU 75A(2.85mm) @BBL H3C", outputName: "Snapmaker TPU @U1 0.4 nozzle" });
    expect((settings.filament_settings_id as string[])[2]).toBe("Snapmaker TPU @U1 0.4 nozzle");
    expect((settings.filament_vendor as string[])[2]).toBe("Snapmaker");
    expect(settings.filament_diameter).toEqual(["1.75", "1.75", "1.75", "1.75"]);
    expect((settings.filament_flow_ratio as string[])[4]).not.toBe("1.21");
    expect(report.filamentPresets?.map((p) => p.slot)).toEqual([3]);
    expect(report.warnings[0]).toMatch(/^Filament 3 was Bambu TPU 75A\(2\.85mm\) @BBL H3C \(2\.85 mm\) on the creator's printer\. The U1 takes 1\.75 mm filament, so it's set to Snapmaker TPU @U1 0\.4 nozzle with that preset's settings/);
    const firmware = report.whatChanged.groups.find((g) => g.reason === "firmware")?.items.map((i) => i.label) ?? [];
    expect(firmware).toContain("Filament 3 set to Snapmaker TPU @U1 0.4 nozzle");
    // The other three filaments keep the creator's names.
    expect(report.filaments.filter((f) => f.slot !== 3).every((f) => f.outputName === f.sourceName)).toBe(true);
  });

  it("gives a 2.85 mm filament Generic's preset when the Generic option was chosen", async () => {
    const { report } = await convert(readFixture("sources/bambu-studio-2.9.1.70-h3c-mixed.3mf"), { profiles: testProfileSource(), filamentComplianceMode: "generic" });
    expect(report.filaments[2]?.outputName).toBe("Generic TPU");
    expect(report.warnings[0]).toContain("it's set to Generic TPU with that preset's settings");
  });

  it('converts a mixed-size project for its first nozzle under nozzle "match"', async () => {
    const { report } = await convert(readFixture("sources/bambu-studio-2.9.1.70-h3c-mixed.3mf"), { profiles: testProfileSource(), nozzle: "match" });
    expect(report.profile.nozzleDiameter).toBe("0.2");
    expect(report.nozzle).toEqual({ choice: "match", size: "0.2", sourceSizes: ["0.2", "0.4"] });
    expect(report.profileNotes.join("\n")).toContain("uses 0.2 and 0.4 mm nozzles");
  });

  it("keeps the 225 °C from a Creality K3 project, whose four toolheads each have one value per filament", async () => {
    const { output, report } = await convert(readFixture("sources/creality-print-7.3.1.6378-k3.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    expect(settings.nozzle_temperature).toEqual(Array(8).fill("225"));
    expect(report.nozzle).toEqual({ choice: "0.4", size: "0.4", sourceSizes: ["0.4"] });
  });

  it("keeps QIDI Studio's 225 °C edit on all four filaments, which share one preset", async () => {
    // QIDI Studio stores one value per filament; the U1's file has two (standard nozzle, then high flow).
    const { output } = await convert(readFixture("sources/qidi-studio-2.7.2.73-scene.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(unzipSync(output));
    expect(settings.nozzle_temperature).toEqual(Array(8).fill("225"));
    expect(settings.nozzle_temperature_initial_layer).toEqual(Array(8).fill("225"));
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

describe("filament settings in a converted project", () => {
  const index = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "index.json"), "utf-8")) as { releases: Array<{ version: string }> };

  // Snapmaker Orca writes each filament setting once per filament (twice where it keeps a high-flow value too);
  // one value for several filaments is what a setting missing from the filament template looks like.
  it.each(index.releases.map((r) => r.version))("has a value for every filament, for Snapmaker Orca %s", async (version) => {
    for (const source of SOURCES) {
      const { output } = await convert(readFixture(`sources/${source.file}`), { profiles: testProfileSource(), snapmakerOrcaVersion: version });
      const settings = JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"]!)) as Record<string, unknown>;
      const filaments = (settings.filament_settings_id as string[]).length;
      const short = Object.entries(settings)
        .filter(([key, value]) => SETTINGS_CATALOG[key]?.group === "filament" && Array.isArray(value) && value.length % filaments !== 0)
        .map(([key, value]) => `${key} (${(value as unknown[]).length})`);
      expect(short, `${source.file}, ${filaments} filaments`).toEqual([]);
    }
  });
});
