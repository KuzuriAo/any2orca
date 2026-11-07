// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, filamentNotes, loadCatalog, memoryProfileSource } from "../index.js";
import { PROFILES_DATA_DIR, readFixture, testProfileSource } from "../test-helpers.js";

const BAMBU = "sources/bambu-studio-2.8.4.57-beta.3mf";
const projectSettings = (output: Uint8Array) => JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as Record<string, unknown>;
const presets = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "filament-presets.json"), "utf-8"));
const preset = (printer: string, name: string) => ({ ...presets.printers[printer].shared, ...presets.printers[printer].presets[name] });

describe("the Snapmaker and Generic filament options use the presets' own settings", () => {
  it("Snapmaker: each slot takes its preset's standard and high-flow values, as Snapmaker Orca holds them", async () => {
    const { output, report } = await convert(readFixture(BAMBU), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" });
    const s = projectSettings(output);
    expect(s.filament_settings_id).toEqual(["Snapmaker PLA Matte @U1", "Snapmaker PLA Matte @U1", "Snapmaker PLA SnapSpeed @U1", "Snapmaker PLA SnapSpeed @U1"]);
    const snapSpeed = preset("snapmaker-u1", "Snapmaker PLA SnapSpeed @U1");
    // Two values per filament on the U1's 0.4 nozzle: standard, then high flow.
    for (const key of ["nozzle_temperature", "filament_flow_ratio", "filament_max_volumetric_speed", "pressure_advance"]) {
      expect((s[key] as string[]).slice(6, 8), key).toEqual(snapSpeed[key]);
    }
    expect((s.nozzle_temperature as string[]).slice(4, 8)).toEqual(["220", "220", "220", "220"]); // the creator's 225 °C is replaced
    // The slot's embedded preset carries the preset's settings too.
    const embedded = JSON.parse(strFromU8(unzipSync(output)["Metadata/filament_settings_2.config"]!));
    expect(embedded.name).toBe("Snapmaker PLA SnapSpeed @U1");
    expect(embedded.filament_flow_ratio[0]).toBe("0.966");
    // The report says what was replaced, and the notes say it in words.
    const slot4 = report.filamentPresets?.find((p) => p.slot === 4);
    expect(slot4?.preset).toBe("Snapmaker PLA SnapSpeed @U1");
    expect(slot4?.changed).toContainEqual({ key: "nozzle_temperature", before: "225", after: "220" });
    expect(filamentNotes(report).join(" ")).toMatch(/Filaments 3 and 4 use Snapmaker PLA SnapSpeed @U1's own settings instead of the creator's: nozzle temperature 225 °C → 220 °C/);
  });

  it("Generic: slots take the Generic preset's settings", async () => {
    const { output } = await convert(readFixture(BAMBU), { profiles: testProfileSource(), filamentComplianceMode: "generic" });
    const s = projectSettings(output);
    const generic = preset("snapmaker-u1", "Generic PLA");
    expect((s.filament_settings_id as string[])[0]).toBe("Generic PLA");
    // One stored value is written for both hotend types, as Snapmaker Orca repeats it.
    const [standard, highFlow = standard] = generic.filament_max_volumetric_speed;
    expect((s.filament_max_volumetric_speed as string[]).slice(0, 2)).toEqual([standard, highFlow]);
  });

  it("Original: the creator's values stay, and every filament's entry lists every filament setting, so Snapmaker Orca keeps them", async () => {
    const { output, report } = await convert(readFixture(BAMBU), { profiles: testProfileSource() });
    const s = projectSettings(output);
    expect((s.nozzle_temperature as string[]).slice(4, 8)).toEqual(["225", "220", "225", "220"]);
    const entries = s.different_settings_to_system as string[];
    expect(entries.length).toBe(6); // print, four filaments, printer
    for (const entry of entries.slice(1, 5)) expect(entry.split(";")).toEqual(expect.arrayContaining(["nozzle_temperature", "filament_flow_ratio", "filament_start_gcode"]));
    expect(report.filamentPresets).toBeUndefined();
    expect(filamentNotes(report)).toEqual([]);
  });

  it("changes only names, and says so, with a catalog that has no preset settings", async () => {
    const dir = PROFILES_DATA_DIR;
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf-8"));
    const { filamentPresets: _omit, releases: _r, ...older } = index;
    const profiles = Object.fromEntries(index.profiles.map((p: { id: string }) => [p.id, JSON.parse(readFileSync(join(dir, "profiles", `${p.id}.json`), "utf-8"))]));
    const catalog = await loadCatalog(memoryProfileSource({ index: older, profiles }));
    const { output, report } = await convert(readFixture(BAMBU), { profiles: catalog, filamentComplianceMode: "snapmaker" });
    expect((projectSettings(output).nozzle_temperature as string[]).slice(4, 6)).toEqual(["225", "220"]);
    expect(report.filamentPresets).toBeUndefined();
    expect(report.warnings.join(" ")).toMatch(/no filament preset settings, so only the filament names changed/);
  });

  it("refuses a presets file with a key that could reach an object's prototype, and says when one lacks a preset", async () => {
    const dir = PROFILES_DATA_DIR;
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf-8"));
    const { releases: _r, ...one } = index;
    const profiles = Object.fromEntries(index.profiles.map((p: { id: string }) => [p.id, JSON.parse(readFileSync(join(dir, "profiles", `${p.id}.json`), "utf-8"))]));
    const withFile = async (filamentPresets: unknown) => loadCatalog(memoryProfileSource({ index: one, profiles, filamentPresets }));
    // "constructor" is refused outright.
    const hostile = await withFile(JSON.parse('{"printers":{"snapmaker-u1":{"shared":{"constructor":["1"]},"presets":{}}}}'));
    await expect(convert(readFixture(BAMBU), { profiles: hostile, filamentComplianceMode: "snapmaker" })).rejects.toThrow(/filament-presets.json is malformed/);
    // "__proto__" is dropped while the file is read, so nothing is polluted; a preset the file lacks changes its name only, with a warning.
    const partial = await withFile(JSON.parse('{"printers":{"snapmaker-u1":{"shared":{"__proto__":["1"]},"presets":{}}}}'));
    const { report } = await convert(readFixture(BAMBU), { profiles: partial, filamentComplianceMode: "snapmaker" });
    expect(({} as Record<string, unknown>)["0"]).toBeUndefined();
    expect(report.filamentPresets).toBeUndefined();
    expect(report.warnings.join(" ")).toMatch(/no settings for Snapmaker PLA Matte @U1, Snapmaker PLA SnapSpeed @U1, so only their names changed/);
  });
});

describe("filamentNotes", () => {
  it("quotes a file's values without control codes, and short", () => {
    const notes = filamentNotes({
      filamentPresets: [{ slot: 1, preset: "Snapmaker PLA SnapSpeed @U1", changed: [{ key: "nozzle_temperature", before: `225\u001b]8;;https://example.test\u0007${"9".repeat(500)}`, after: "220" }] }],
    });
    expect(notes[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(notes[0].length).toBeLessThan(200);
    expect(notes[0]).toMatch(/nozzle temperature 225.*… °C → 220 °C/);
  });
});
