// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, filamentNotes, loadCatalog, memoryProfileSource } from "../index.js";
import { PROFILES_DATA_DIR, readFixture, testProfileSource } from "../test-helpers.js";

const BAMBU = "sources/bambu-studio-2.8.4.57-beta.3mf";
const projectSettings = (output: Uint8Array) => JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as Record<string, unknown>;
const presets = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "filament-presets.json"), "utf-8"));
const preset = (printer: string, name: string) => ({ ...presets.printers[printer].shared, ...presets.printers[printer].presets[name] });
/** Each filament's entry in different_settings_to_system, as a list of settings. */
const entriesOf = (s: Record<string, unknown>) => (s.different_settings_to_system as string[]).slice(1, -1).map((entry) => (entry ? entry.split(";") : []));
/** The Bambu Studio fixture with its first filament renamed and given another material, and any other change to its settings. */
function withFirstFilament(name: string, material: string, change: (source: Record<string, unknown>) => void = () => {}): Uint8Array {
  const files = unzipSync(readFixture(BAMBU));
  const source = JSON.parse(strFromU8(files["Metadata/project_settings.config"]!));
  (source.filament_type as string[])[0] = material;
  (source.filament_settings_id as string[])[0] = name;
  change(source);
  files["Metadata/project_settings.config"] = strToU8(JSON.stringify(source));
  return zipSync(files);
}
const convertOriginal = async (input: Uint8Array) => projectSettings((await convert(input, { profiles: testProfileSource() })).output);

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

  it("Snapmaker and Generic: each filament's entry names only what differs from its preset", async () => {
    const snapmaker = projectSettings((await convert(readFixture(BAMBU), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" })).output);
    expect(entriesOf(snapmaker)).toEqual([[], [], [], []]);
    expect(snapmaker.inherits_group).toBeUndefined();
    // The U1's 0.4 nozzle sets every filament up for both hotends; Snapmaker's Generic presets list the standard one only.
    const generic = projectSettings((await convert(readFixture(BAMBU), { profiles: testProfileSource(), filamentComplianceMode: "generic" })).output);
    expect(entriesOf(generic)).toEqual(Array(4).fill(["filament_flow_support"]));
  });

  it("Original: the creator's values stay, each filament has the Snapmaker option's preset as its parent, and its entry names what differs from it", async () => {
    const { output, report } = await convert(readFixture(BAMBU), { profiles: testProfileSource() });
    const s = projectSettings(output);
    expect(s.filament_settings_id).toEqual(["Bambu PLA Matte @BBL X1C", "Bambu PLA Matte @BBL X1C", "Bambu PLA Basic @BBL X1C", "Bambu PLA Basic @BBL X1C"]);
    expect((s.nozzle_temperature as string[]).slice(4, 8)).toEqual(["225", "220", "225", "220"]);
    const parents = ["Snapmaker PLA Matte @U1", "Snapmaker PLA Matte @U1", "Snapmaker PLA SnapSpeed @U1", "Snapmaker PLA SnapSpeed @U1"];
    expect(s.inherits_group).toEqual(["", ...parents, ""]);
    const entries = entriesOf(s);
    expect(entries.length).toBe(4);
    // A value that differs from the parent's is named, so Snapmaker Orca keeps it: Bambu PLA Matte's 220 °C
    // (Snapmaker PLA Matte's is 215 °C), and the creator's 225 °C on filaments 3 and 4 (SnapSpeed's is 220 °C).
    expect((s.nozzle_temperature as string[]).slice(0, 2)).toEqual(["220", "220"]);
    expect(preset("snapmaker-u1", "Snapmaker PLA Matte @U1").nozzle_temperature[0]).toBe("215");
    expect(entries[0]).toContain("nozzle_temperature");
    expect(entries[2]).toContain("nozzle_temperature");
    // Each filament takes its parent's G-code, the U1's own, so none is named and Snapmaker Orca has none to warn about.
    expect(s.filament_start_gcode).toEqual(parents.map((name) => preset("snapmaker-u1", name).filament_start_gcode[0]));
    for (const entry of entries) expect(entry.filter((key) => key.endsWith("_gcode"))).toEqual([]);
    expect(report.filamentPresets).toBeUndefined();
    expect(filamentNotes(report)).toEqual([]);
  });

  it("Original: a filament already named like a U1 preset takes that preset's G-code, and its entry names no G-code", async () => {
    const s = await convertOriginal(withFirstFilament("Snapmaker PLA Silk @U1", "PLA"));
    expect((s.inherits_group as string[])[1]).toBe("");
    const silk = preset("snapmaker-u1", "Snapmaker PLA Silk @U1");
    expect((s.filament_start_gcode as string[])[0]).toBe(silk.filament_start_gcode[0]);
    expect(entriesOf(s)[0].filter((key) => key.endsWith("_gcode"))).toEqual([]);
  });

  it("Original: a filament no U1 preset fits names what the creator changed, what the conversion changed and the printers it suits", async () => {
    const withFirst = (change: (source: Record<string, unknown>) => void) => withFirstFilament("Acme Unobtainium @Acme", "UNOBTAINIUM", change);
    const run = convertOriginal;

    const s = await run(withFirst((source) => ((source.different_settings_to_system as string[])[1] = "filament_flow_ratio;not_a_setting")));
    expect((s.inherits_group as string[]).slice(0, 3)).toEqual(["", "", "Snapmaker PLA Matte @U1"]);
    const [first] = entriesOf(s);
    expect(first).toEqual(expect.arrayContaining(["filament_flow_ratio", "filament_start_gcode", "compatible_printers"]));
    expect(first).not.toContain("not_a_setting");
    expect(first).not.toContain("nozzle_temperature");

    // A material Snapmaker makes no preset for has the Generic one as its parent.
    const pc = await run(withFirst((source) => {
      (source.filament_type as string[])[0] = "PC";
      (source.filament_settings_id as string[])[0] = "Bambu PC @BBL X1C";
    }));
    expect((pc.inherits_group as string[])[1]).toBe("Generic PC");

    // A list that can't be read for that filament: every filament setting is named.
    const unread = await run(withFirst((source) => (source.different_settings_to_system = ["only one entry"])));
    expect(entriesOf(unread)[0]).toEqual(expect.arrayContaining(["nozzle_temperature", "filament_flow_ratio", "filament_start_gcode", "compatible_printers"]));

    // A name or material that matches an object's own properties is just an unknown filament.
    const hostile = await run(withFirst((source) => {
      (source.filament_type as string[])[0] = "constructor";
      (source.filament_settings_id as string[])[0] = "__proto__";
    }));
    expect((hostile.inherits_group as string[])[1]).toBe("");
    expect(entriesOf(hostile)[0]).toContain("compatible_printers");
    expect(({} as Record<string, unknown>).filament_flow_ratio).toBeUndefined();
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

describe("Snapmaker Orca keeps what the file says", () => {
  const fixtures = ["sources", "prusaslicer"].flatMap((dir) =>
    readdirSync(new URL(`../test-fixtures/${dir}`, import.meta.url))
      .filter((f) => f.endsWith(".3mf"))
      .map((f) => `${dir}/${f}`),
  );
  const index = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "index.json"), "utf-8")) as { profiles: { id: string; printerId: string }[] };
  /** One filament's values of a setting: one per filament, or two (standard, high flow). */
  const slotOf = (value: unknown, slot: number, count: number) =>
    (!Array.isArray(value) ? [value] : value.length === count * 2 ? value.slice(slot * 2, slot * 2 + 2) : [value[slot]]).map(String);

  // The app resets every setting a filament's entry doesn't name to its parent's value, or the same-named preset's
  // (Preset.cpp, load_external_preset), and warns about each G-code setting an entry names (validate_presets).
  it.each(fixtures.flatMap((file) => (["original", "snapmaker", "generic"] as const).map((option) => [file, option] as const)))(
    "%s with %s: resetting what an entry doesn't name changes nothing, and no entry names G-code",
    async (file, option) => {
      const { output, report } = await convert(readFixture(file), { profiles: testProfileSource(), ...(option === "original" ? {} : { filamentComplianceMode: option }) });
      const s = projectSettings(output);
      const printer = presets.printers[index.profiles.find((p) => p.id === report.profile.id)!.printerId];
      const names = s.filament_settings_id as string[];
      const parents = Array.isArray(s.inherits_group) ? (s.inherits_group as string[]).slice(1, -1) : [];
      const entries = entriesOf(s);
      let checked = 0;
      names.forEach((name, slot) => {
        const base = parents[slot] || name;
        // No U1 preset fits: the app resets to whatever preset of that name is installed, which the catalog can't know.
        if (!Object.hasOwn(printer.presets, base)) return;
        const values: Record<string, string[]> = { ...printer.shared, ...printer.presets[base] };
        for (const [key, value] of Object.entries(values)) {
          if (entries[slot].includes(key) || !Object.hasOwn(s, key)) continue;
          const own = slotOf(s[key], slot, names.length);
          // One preset value stands for both hotends, as Snapmaker Orca reads it.
          expect(value.length === 1 ? own.every((v) => v === value[0]) : own.join("\n") === value.join("\n"), `filament ${slot + 1} (${base}): ${key}`).toBe(true);
        }
        expect(entries[slot].filter((key) => key.endsWith("_gcode")), `filament ${slot + 1}`).toEqual([]);
        checked++;
      });
      expect(checked).toBeGreaterThan(0);
    },
  );
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
