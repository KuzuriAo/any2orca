// SPDX-License-Identifier: MIT
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "../errors.js";
import { loadCatalog } from "../profiles.js";
import { convert } from "../project.js";
import { decodeStamp, STAMP_PATH } from "../stamp.js";
import { readFixture, testProfileSource } from "../test-helpers.js";
import { extractPreset } from "./extractPreset.js";
import { MAX_PRESETS_FILE_BYTES, parsePresetFile, serializePresets, type Preset } from "./preset.js";
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { MACHINE_SETTINGS_KEYS } from "../engine/policy.js";
import { PRESET_EXCLUDED_KEYS, PRESET_KEYS } from "./presetKeys.js";

const SETTINGS_PATH = "Metadata/project_settings.config";
const BASE = "snapmaker-u1-0.4-standard";
const catalogPromise = loadCatalog(testProfileSource());

function settingsOf(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(strFromU8(unzipSync(bytes)[SETTINGS_PATH]));
}

function withSettings(bytes: Uint8Array, edit: (settings: Record<string, unknown>) => void): Uint8Array {
  const files = unzipSync(bytes);
  const settings = JSON.parse(strFromU8(files[SETTINGS_PATH]));
  edit(settings);
  files[SETTINGS_PATH] = strToU8(JSON.stringify(settings));
  return zipSync(files);
}

/** A U1 file as a user would tune it: the demo converted onto BASE, then edited as if in Snapmaker Orca. */
async function master(edit: (settings: Record<string, unknown>) => void = () => {}): Promise<Uint8Array> {
  const { output } = await convert(readFixture("synthetic-demo.3mf"), { profiles: await catalogPromise, profileId: BASE, stamp: false });
  return withSettings(output, edit);
}

const preset = (changes: Preset["changes"], base = BASE): Preset => ({
  name: "Mine",
  base,
  baseInferred: false,
  catalog: { version: "test", tracks: "Snapmaker Orca 2.4.0" },
  changes,
  created: "2026-10-21",
});

describe("the preset allowlist", () => {
  it("is print settings only, without the model's layout, slots, bookkeeping or scripts", () => {
    expect(PRESET_KEYS).toContain("wall_loops");
    expect(PRESET_KEYS).toContain("outer_wall_speed");
    for (const key of ["print_sequence", "wall_filament", "post_process", "filename_format", "inherits", "machine_start_gcode", "retraction_length", "nozzle_temperature"]) {
      expect(PRESET_KEYS, key).not.toContain(key);
    }
    expect(Object.keys(PRESET_EXCLUDED_KEYS).every((key) => !PRESET_KEYS.includes(key))).toBe(true);
  });

  it("holds only keys the settings catalog files under print, and no printer setting or G-code", () => {
    for (const key of PRESET_KEYS) expect(SETTINGS_CATALOG[key]?.group, key).toBe("print");
    for (const key of [...MACHINE_SETTINGS_KEYS, "printable_area", "bed_exclude_area", "printable_height", "nozzle_diameter"]) {
      expect(PRESET_KEYS, key).not.toContain(key);
    }
    expect(PRESET_KEYS.filter((key) => key.endsWith("_gcode"))).toEqual([]);
  });
});

describe("extractPreset", () => {
  it("keeps only the print settings that differ from the profile the file was tuned on", async () => {
    const file = await master((s) => {
      s.wall_loops = "4";
      s.sparse_infill_pattern = "gyroid";
      s.post_process = ["rm -rf ~"];
      s.machine_start_gcode = "G28\nM104 S999";
    });
    const { preset: p, changes, notes } = await extractPreset(file, { profiles: await catalogPromise });
    expect(p).toMatchObject({ base: BASE, baseInferred: false });
    expect(p.changes).toMatchObject({ wall_loops: "4", sparse_infill_pattern: "gyroid" });
    expect(p.changes).not.toHaveProperty("post_process");
    expect(p.changes).not.toHaveProperty("machine_start_gcode");
    expect(changes.find((c) => c.key === "wall_loops")).toMatchObject({ label: expect.stringContaining("Wall loops"), yours: "4", aboveStock: false });
    expect(notes.join("\n")).toMatch(/Left out .*post_process|Left out .*Post-processing/i);
  });

  it("stores the standard value of a setting kept per hotend type", async () => {
    const stock = settingsOf(await master()).outer_wall_speed;
    const file = await master((s) => {
      s.outer_wall_speed = Array.isArray(stock) ? ["180", ...stock.slice(1)] : "180";
    });
    const { preset: p } = await extractPreset(file, { profiles: await catalogPromise });
    expect(p.changes.outer_wall_speed).toBe("180");
  });

  it("marks speeds above stock, and the ones the U1's machine limit will cap", async () => {
    const file = await master((s) => {
      s.outer_wall_speed = "450";
      s.inner_wall_speed = "900";
    });
    const { changes } = await extractPreset(file, { profiles: await catalogPromise });
    expect(changes.find((c) => c.key === "outer_wall_speed")).toMatchObject({ aboveStock: true });
    expect(changes.find((c) => c.key === "outer_wall_speed")?.cappedAt).toBeUndefined();
    expect(changes.find((c) => c.key === "inner_wall_speed")).toMatchObject({ aboveStock: true, cappedAt: 500 });
  });

  it("leaves out values Snapmaker Orca wouldn't accept, with a note", async () => {
    const file = await master((s) => {
      s.wall_loops = "-5";
      s.seam_position = "sideways";
      s.sparse_infill_density = "lots";
      s.top_shell_layers = "7";
    });
    const { preset: p, notes } = await extractPreset(file, { profiles: await catalogPromise });
    expect(Object.keys(p.changes)).not.toEqual(expect.arrayContaining(["wall_loops"]));
    expect(p.changes).not.toHaveProperty("seam_position");
    expect(p.changes).not.toHaveProperty("sparse_infill_density");
    expect(p.changes.top_shell_layers).toBe("7");
    expect(notes.filter((n) => n.startsWith("Left out")).length).toBeGreaterThanOrEqual(3);
  });

  it("finds the profile a custom print preset was made from", async () => {
    const catalog = await catalogPromise;
    const file = await master((s) => {
      s.print_settings_id = "My tuned settings";
      s.inherits_group = [catalog.get(BASE)?.displayName, ""];
    });
    const { preset: p, notes } = await extractPreset(file, { profiles: catalog });
    expect(p).toMatchObject({ base: BASE, baseInferred: false });
    expect(notes.join("\n")).toContain("its own print preset");
  });

  it("recognizes a profile named the way older Snapmaker Orca releases did, without \"mm\"", async () => {
    const file = await master((s) => {
      s.print_settings_id = "0.20 Standard @Snapmaker U1 (0.4 nozzle)";
      s.small_area_infill_flow_compensation_model = [];
    });
    const { preset: p, notes } = await extractPreset(file, { profiles: await catalogPromise });
    expect(p).toMatchObject({ base: BASE, baseInferred: false });
    expect(p.changes.small_area_infill_flow_compensation_model).toEqual([]);
    expect(notes).toEqual([]);
  });

  it("infers the profile from nozzle and layer height when the file doesn't name one, and says so", async () => {
    const file = await master((s) => {
      s.print_settings_id = "Something else";
      delete s.inherits_group;
    });
    const { preset: p, notes } = await extractPreset(file, { profiles: await catalogPromise });
    expect(p.baseInferred).toBe(true);
    expect(notes.join("\n")).toContain("closest match");
  });

  it("refuses a file that isn't set up for the U1", async () => {
    await expect(extractPreset(readFixture("synthetic-demo.3mf"), { profiles: await catalogPromise })).rejects.toMatchObject({ code: "preset_base_unknown" });
  });
});

describe("converting with a preset", () => {
  it("converts onto the preset's base and writes its values over the creator's", async () => {
    const { output, report } = await convert(readFixture("synthetic-demo.3mf"), {
      profiles: await catalogPromise,
      preset: preset({ wall_loops: "5", seam_position: "back" }, "snapmaker-u1-0.4-0.16hq"),
    });
    expect(report.profile.id).toBe("snapmaker-u1-0.4-0.16hq");
    const s = settingsOf(output);
    expect(s).toMatchObject({ wall_loops: "5", seam_position: "back" });
    expect(report.preset?.changes.map((c) => c.key)).toEqual(["seam_position", "wall_loops"]);
  });

  it("with no changes, gives the same file as choosing its base profile", async () => {
    const catalog = await catalogPromise;
    const plain = await convert(readFixture("synthetic-demo.3mf"), { profiles: catalog, profileId: BASE, stamp: false });
    const withPreset = await convert(readFixture("synthetic-demo.3mf"), { profiles: catalog, preset: preset({}), stamp: false });
    expect(settingsOf(withPreset.output)).toEqual(settingsOf(plain.output));
  });

  it("records the base, the keys and a fingerprint in the stamp, never the name", async () => {
    const { output } = await convert(readFixture("synthetic-demo.3mf"), { profiles: await catalogPromise, preset: { ...preset({ wall_loops: "5" }), name: "Secret name" } });
    const entry = unzipSync(output)[STAMP_PATH];
    expect(strFromU8(entry)).not.toContain("Secret name");
    expect(decodeStamp(entry)?.options.preset).toMatchObject({ base: BASE, keys: ["wall_loops"], sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("round-trips: a preset made from the converted file has the same changes", async () => {
    const changes = { wall_loops: "5", top_shell_layers: "6", sparse_infill_pattern: "gyroid" };
    const { output } = await convert(readFixture("synthetic-demo.3mf"), { profiles: await catalogPromise, preset: preset(changes) });
    const { preset: again } = await extractPreset(output, { profiles: await catalogPromise });
    expect(again.base).toBe(BASE);
    expect(again.changes).toMatchObject(changes);
  });

  it("sets the standard entry of a per-hotend-type setting, and still caps at the machine limit", async () => {
    const { output } = await convert(readFixture("synthetic-demo.3mf"), {
      profiles: await catalogPromise,
      preset: preset({ outer_wall_speed: "180", inner_wall_speed: "900" }),
    });
    const s = settingsOf(output);
    const outer = s.outer_wall_speed;
    expect(Array.isArray(outer) ? outer[0] : outer).toBe("180");
    const inner = s.inner_wall_speed;
    expect(Array.isArray(inner) ? inner[0] : inner).toBe("500");
  });

  it("never applies a key outside the allowlist or an invalid value, even from a hand-made preset", async () => {
    const { output, report } = await convert(readFixture("synthetic-demo.3mf"), {
      profiles: await catalogPromise,
      preset: preset({ machine_start_gcode: "M104 S999", print_sequence: "by object", wall_loops: "-1", top_shell_layers: "6" }),
    });
    const s = settingsOf(output);
    expect(s.machine_start_gcode).not.toBe("M104 S999");
    expect(s.top_shell_layers).toBe("6");
    expect(s.wall_loops).not.toBe("-1");
    expect(report.preset?.notes.length).toBe(3);
    expect(report.warnings.join("\n")).toContain("Left out");
  });

  it("can't be combined with a profile id, and rejects a malformed preset", async () => {
    const catalog = await catalogPromise;
    const bytes = readFixture("synthetic-demo.3mf");
    await expect(convert(bytes, { profiles: catalog, profileId: BASE, preset: preset({}) })).rejects.toMatchObject({ code: "invalid_preset" });
    await expect(convert(bytes, { profiles: catalog, preset: { ...preset({}), base: "../etc/passwd" } })).rejects.toMatchObject({ code: "invalid_preset" });
    await expect(convert(bytes, { profiles: catalog, preset: preset({}, "no-such-profile") })).rejects.toMatchObject({ code: "invalid_preset" });
  });

  it("notes a nozzle size different from the original project's", async () => {
    const { report } = await convert(readFixture("synthetic-demo.3mf"), { profiles: await catalogPromise, preset: preset({}, "snapmaker-u1-0.6-standard") });
    expect(report.warnings.join("\n")).toMatch(/0\.6mm nozzle preset.*0\.4mm/);
  });
});

describe("presets files", () => {
  it("round-trips through serializePresets and parsePresetFile", () => {
    const text = serializePresets([preset({ wall_loops: "4", small_area_infill_flow_compensation_model: ["0,0", "\n0.2,0.4444"] })]);
    expect(parsePresetFile(text).presets[0]).toMatchObject({ name: "Mine", changes: { wall_loops: "4" } });
  });

  it("rejects hostile or malformed files with invalid_preset", () => {
    const valid = JSON.parse(serializePresets([preset({ wall_loops: "4" })]));
    const cases: Array<[string, string | Uint8Array]> = [
      ["not JSON", "{"],
      ["wrong format", JSON.stringify({ ...valid, format: "something-else" })],
      ["future version", JSON.stringify({ ...valid, version: 2 })],
      ["proto key", '{"format":"any2orca-presets","version":1,"presets":[{"name":"x","base":"b","baseInferred":false,"catalog":{"version":"1","tracks":"t"},"changes":{"__proto__":{"polluted":"1"}},"created":"2026-10-21"}]}'],
      ["deep nesting", `${"[".repeat(5000)}${"]".repeat(5000)}`],
      ["too big", " ".repeat(MAX_PRESETS_FILE_BYTES + 1)],
      ["duplicate names", JSON.stringify({ ...valid, presets: [valid.presets[0], { ...valid.presets[0], name: "MINE" }] })],
      ["name with a line break", JSON.stringify({ ...valid, presets: [{ ...valid.presets[0], name: "a\nb" }] })],
      ["too many presets", JSON.stringify({ ...valid, presets: Array.from({ length: 101 }, (_, i) => ({ ...valid.presets[0], name: `p${i}` })) })],
      ["unknown field", JSON.stringify({ ...valid, presets: [{ ...valid.presets[0], extra: 1 }] })],
      ["invalid UTF-8", new Uint8Array([0x7b, 0xff, 0x7d])],
    ];
    for (const [label, input] of cases) {
      let error: unknown;
      try {
        parsePresetFile(input);
      } catch (err) {
        error = err;
      }
      expect(error, label).toBeInstanceOf(Any2orcaError);
      expect((error as Any2orcaError).code, label).toBe("invalid_preset");
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
