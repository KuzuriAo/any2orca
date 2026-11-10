// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../../index.js";
import { catalogEngine, loadCatalog, ProfileDataError, withCatalogEngine } from "../../profiles.js";
import { readFixture, testProfileSource } from "../../test-helpers.js";
import type { PrusaBundle } from "./bundle.js";
import type { ProfileCatalog } from "../../profiles.js";
import type { PrusaProjectInfo } from "../reader.js";
import { applyPolicyB, changedPrintKeys, statedPrintKeys } from "./policyB.js";

const dec = new TextDecoder();
const enc = new TextEncoder();
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../test-fixtures/prusaslicer/${name}`, import.meta.url)));
const bundle: PrusaBundle = {
  schema: 1,
  vendor: "Test",
  name: "Test Vendor",
  configVersion: "1.0.0",
  slicer: { name: "PrusaSlicer", version: "1.0.0", repository: "x/y", tag: "v1", commit: "0".repeat(40) },
  license: "AGPL-3.0-or-later",
  groups: ["print"],
  printerModels: {},
  presets: { print: { P: { values: { perimeters: "2", fill_density: "15%", infill_speed: "150.0", bed_shape: "0x0,250x0", notes: "x", overhang_speed_3: "70%", start_gcode: "M104 S[first_layer_temperature]" } } } },
  renamedFrom: {},
  defaults: { brim_width: "0", gap_fill_enabled: "1" },
};

describe("policy B: what the creator changed from the vendor's print preset", () => {
  it("compares in PrusaSlicer's value forms and counts a key the preset lacks as changed", () => {
    const settings = new Map([
      ["perimeters", "2"],
      ["fill_density", "15.0%"],
      ["infill_speed", "150"],
      ["overhang_speed_3", "75%"],
      ["bed_shape", "0x0,250x0"],
      ["notes", "y"],
      ["brim_width", "5"],
      ["gap_fill_enabled", "1"],
      ["raft_layers", "2"],
      ["print_settings_id", "P"],
      ["filament_colour", "#FF0000"],
    ]);
    const printKeys = new Set(["perimeters", "fill_density", "infill_speed", "overhang_speed_3", "notes", "brim_width", "gap_fill_enabled", "raft_layers", "print_settings_id"]);
    const result = changedPrintKeys(bundle, "P", settings, printKeys);
    expect(result?.presetName).toBe("P");
    // 75% differs; brim_width differs from the built-in default; gap_fill_enabled equals it; raft_layers has neither; the rest
    // are equal by value; notes and ids aren't compared.
    expect(result?.changedKeys).toEqual(["brim_width", "overhang_speed_3", "raft_layers"]);
    expect(result?.compared).toBe(6);
    expect(changedPrintKeys(bundle, "Q", settings, printKeys)).toBeNull();
  });

  it("carries only what the creator changed: a stock-profile fixture takes Snapmaker's values, an edited key comes through", async () => {
    const catalog = await loadCatalog(testProfileSource());
    const baseline = (await catalogEngine(catalog).load("snapmaker-u1-0.4-standard")).convertProfile.profile.baselineProjectSettings as Record<string, unknown>;
    const stock = await convert(fixture("prusaslicer-2.9.6.3mf"), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-standard" });
    const stockNote = stock.report.warnings?.find((w) => w.includes("compared with PrusaSlicer's"));
    expect(stockNote).toMatch(/compared with PrusaSlicer's "0\.20mm BALANCED @COREONE HF0\.4" \(Prusa Research's presets of PrusaSlicer 2\.9\.6\): \d+ of \d+ differ/);
    const stockSettings = JSON.parse(dec.decode(unzipSync(stock.output)["Metadata/project_settings.config"])) as Record<string, unknown>;
    // The box was saved on the stock profile with nothing changed, so Prusa's top shell count (5) isn't carried: the U1's stands.
    expect(stockSettings.top_shell_layers).toEqual(baseline.top_shell_layers);
    expect(stockSettings.wall_loops).toEqual(baseline.wall_loops);

    const entries = unzipSync(fixture("prusaslicer-2.9.6.3mf"));
    const ini = dec.decode(entries["Metadata/Slic3r_PE.config"]).replace(/^; perimeters = .*$/m, "; perimeters = 7").replace(/^; top_solid_layers = .*$/m, "; top_solid_layers = 9");
    entries["Metadata/Slic3r_PE.config"] = enc.encode(ini);
    const edited = await convert(zipSync(entries), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-standard" });
    const editedSettings = JSON.parse(dec.decode(unzipSync(edited.output)["Metadata/project_settings.config"])) as Record<string, unknown>;
    expect(editedSettings.wall_loops).toBe("7");
    expect(editedSettings.top_shell_layers).toBe("9");
    const editedNote = edited.report.warnings?.find((w) => w.includes("compared with PrusaSlicer's")) ?? "";
    const [stockChanged] = /(\d+) of \d+ differ/.exec(stockNote ?? "")!.slice(1).map(Number);
    const [editedChanged] = /(\d+) of \d+ differ/.exec(editedNote)!.slice(1).map(Number);
    expect(editedChanged).toBe(stockChanged + 2);
  });

  it("falls back to carrying every mapped print setting, and says so, for a preset the bundle doesn't have", async () => {
    const entries = unzipSync(fixture("prusaslicer-2.9.6.3mf"));
    const ini = dec.decode(entries["Metadata/Slic3r_PE.config"]).replace(/^; print_settings_id = .*$/m, "; print_settings_id = My own profile").replace(/^; top_solid_layers = .*$/m, "; top_solid_layers = 9");
    entries["Metadata/Slic3r_PE.config"] = enc.encode(ini);
    const { output, report } = await convert(zipSync(entries), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-standard" });
    expect(report.warnings).toContainEqual(expect.stringContaining('print preset "My own profile" isn\'t in Prusa Research\'s presets'));
    const settings = JSON.parse(dec.decode(unzipSync(output)["Metadata/project_settings.config"])) as Record<string, unknown>;
    expect(settings.top_shell_layers).toBe("9");
    expect(settings.wall_loops).toBe("2");
  });

  it("converts, with every mapped print setting carried and a note, when the bundle can't be read", async () => {
    const broken = { ...testProfileSource(), readSource: async () => { throw new ProfileDataError("gone"); } };
    const { output, report } = await convert(fixture("prusaslicer-2.9.6.3mf"), { profiles: broken, profileId: "snapmaker-u1-0.4-standard" });
    expect(report.warnings).toContainEqual(expect.stringContaining("isn't in Prusa Research's presets"));
    const settings = JSON.parse(dec.decode(unzipSync(output)["Metadata/project_settings.config"])) as Record<string, unknown>;
    expect(settings.top_shell_layers).toBe("5");
  });

  it("counts the Supports menu and the support filaments as stated, the menu's choices only when supports are on", () => {
    const off = new Map([["support_material", "0"], ["support_material_auto", "1"], ["support_material_buildplate_only", "0"], ["support_material_style", "snug"], ["support_material_extruder", "0"], ["support_material_interface_extruder", "0"], ["support_material_contact_distance", "0.2"]]);
    expect(statedPrintKeys(off)).toEqual(["support_material", "support_material_extruder", "support_material_interface_extruder"]);
    const on = new Map([...off, ["support_material", "1"]]);
    expect(statedPrintKeys(on)).toEqual(["support_material", "support_material_extruder", "support_material_interface_extruder", "support_material_auto", "support_material_buildplate_only", "support_material_style"]);
    const soluble = new Map([...on, ["support_material_interface_extruder", "5"], ["support_material_bottom_contact_distance", "0"]]);
    expect(statedPrintKeys(soluble).slice(-2)).toEqual(["support_material_contact_distance", "support_material_bottom_contact_distance"]);
    // Keys the project doesn't have aren't listed.
    expect(statedPrintKeys(new Map())).toEqual([]);
  });

  it("carries a soluble-support preset's support settings even when the project leaves them as the preset has them", async () => {
    const soluble: PrusaBundle = {
      ...bundle,
      presets: { print: { S: { values: { support_material: "1", support_material_auto: "0", support_material_style: "snug", support_material_buildplate_only: "0", support_material_interface_extruder: "2", support_material_extruder: "0", support_material_contact_distance: "0", perimeters: "2" } } } },
    };
    const settings = new Map([...Object.entries(soluble.presets.print.S!.values), ["print_settings_id", "S"]]);
    const targets = new Map<string, readonly string[]>([
      ["support_material", ["enable_support"]],
      ["support_material_auto", ["support_type"]],
      ["support_material_style", ["support_style"]],
      ["support_material_buildplate_only", ["support_on_build_plate_only"]],
      ["support_material_interface_extruder", ["support_interface_filament"]],
      ["support_material_extruder", ["support_filament"]],
      ["support_material_contact_distance", ["support_top_z_distance"]],
      ["perimeters", ["wall_loops"]],
    ]);
    const prusa: PrusaProjectInfo = { version: "1.0.0", settings, targets, presets: { print: "S", printer: "", filaments: [] }, vendorKeyword: null };
    const entry = { vendor: "Test", name: "Test Vendor", path: "sources/prusaslicer/Test-1.0.0.json", slicerVersion: "1.0.0", configVersion: "1.0.0", slicerTag: "v1" };
    const catalog = withCatalogEngine({ prusaBundles: () => [entry] } as unknown as ProfileCatalog, { prusaBundle: async () => soluble });
    const applied = await applyPolicyB(prusa, catalog, { different_settings_to_system: ["", ""] });
    // Nothing differs from the preset, yet the menu, the kind of support, the filaments and the contact distance are carried; the walls aren't.
    expect(applied?.notes[0]).toMatch(/: 0 of \d+ differ from the preset, and only those are carried, with the Supports menu and the support filaments as the project has them;/);
    expect((applied?.projectSettings.different_settings_to_system as string[])[0]!.split(";")).toEqual([
      "enable_support",
      "support_filament",
      "support_interface_filament",
      "support_on_build_plate_only",
      "support_style",
      "support_top_z_distance",
      "support_type",
    ]);
  });

  it("leaves a Bambu-family project alone", async () => {
    const { report } = await convert(readFixture("synthetic-demo.3mf"), { profiles: testProfileSource() });
    expect(report.warnings?.some((w) => w.includes("PrusaSlicer"))).toBe(false);
  });
});
