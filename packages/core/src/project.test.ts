// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "./errors.js";
import { convert, inspect, openProject } from "./project.js";
import { loadCatalog } from "./profiles.js";
import { decodeStamp, STAMP_PATH } from "./stamp.js";
import { readFixture, testProfileSource } from "./test-helpers.js";
import { VERSION } from "./version.js";

describe("inspect", () => {
  it("describes plates, objects, filaments and the source setup", () => {
    const info = inspect(readFixture("synthetic-demo.3mf"));
    expect(info.plates).toEqual([1, 2]);
    expect(info.objects).toHaveLength(3);
    expect(info.filaments).toHaveLength(3);
    expect(info.filaments.every((f) => f.colorName?.vendor === "bambu")).toBe(true);
    expect(info.printerModel).toBe("Bambu Lab X1C");
    expect(info.sourceVendor).toBe("bambu");
    expect(info.tierName).toBe("Standard");
    expect(info.matchNozzleDiameter).toBe("0.4");
  });

  it("recognizes other source vendors from printer_model", () => {
    expect(inspect(readFixture("synthetic-creality.3mf")).sourceVendor).toBe("creality");
    expect(inspect(readFixture("synthetic-anycubic.3mf")).sourceVendor).toBe("anycubic");
  });
});

describe("convert", () => {
  it("auto-matches a profile, writes a stamp, and leaves mesh files byte-for-byte untouched", async () => {
    const input = readFixture("synthetic-demo.3mf");
    const { output, report } = await convert(input, { profiles: testProfileSource() });
    expect(report.profileMatch?.matchSource).toBe("auto-tier-name");
    expect(report.profile.id).toBe("snapmaker-u1-0.4-standard");

    const before = unzipSync(input);
    const after = unzipSync(output);
    for (const name of Object.keys(before).filter((n) => n.startsWith("3D/Objects/"))) {
      expect(Buffer.compare(Buffer.from(after[name]), Buffer.from(before[name]))).toBe(0);
    }
    const stamp = decodeStamp(after[STAMP_PATH]);
    const { slicer } = (await loadCatalog(testProfileSource())).index;
    expect(stamp).toEqual({
      stamp: 1,
      generator: "any2orca",
      version: VERSION,
      profiles: expect.objectContaining({ tracks: `${slicer.name} ${slicer.version}` }),
      profileId: "snapmaker-u1-0.4-standard",
      options: { highFlowHotends: false, hardenedNozzles: false, filamentComplianceMode: null },
    });
    // The catalog names Snapmaker Orca's own Application value, so the file says what a save in that release says.
    const model = new TextDecoder().decode(after["3D/3dmodel.model"]);
    expect(model).toContain(`<metadata name="Application">Snapmaker_Orca-${slicer.version}</metadata>`);
    expect(model).not.toContain('<metadata name="OrcaSlicer">');
  });

  it("leaves the stamp out when asked", async () => {
    const { output, report } = await convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), stamp: false });
    expect(unzipSync(output)[STAMP_PATH]).toBeUndefined();
    expect(report.stamp).toBeNull();
  });

  it("converts a retired profile id with its successor and says so", async () => {
    const { report } = await convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-benchy" });
    expect(report.profile.id).toBe("snapmaker-u1-0.4-standard");
    expect(report.retiredProfile?.id).toBe("snapmaker-u1-0.4-benchy");
    expect(report.warnings.some((w) => w.includes("retired"))).toBe(true);
  });

  it("rejects an unknown profile id", async () => {
    await expect(convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), profileId: "nope" })).rejects.toMatchObject({
      code: "profile_not_found",
    });
  });

  it("can convert one opened project several times without repeating notes", async () => {
    const project = openProject(readFixture("synthetic-2plate.3mf"));
    const catalog = await loadCatalog(testProfileSource());
    const first = await project.convert({ profiles: catalog });
    const second = await project.convert({ profiles: catalog });
    expect(second.report.log).toEqual(first.report.log);
  });

  it("records per-toolhead high-flow hotends in the file and the stamp", async () => {
    const { output } = await convert(readFixture("synthetic-2plate.3mf"), {
      profiles: testProfileSource(),
      profileId: "snapmaker-u1-0.4-standard",
      highFlowHotends: [true, false, false, false],
    });
    const entries = unzipSync(output);
    const settings = JSON.parse(new TextDecoder().decode(entries["Metadata/project_settings.config"]));
    expect(settings.nozzle_volume_type).toEqual(["high_flow", "standard", "standard", "standard"]);
    expect(settings.process_flow_support).toEqual(["standard", "high_flow"]);
    expect(settings.outer_wall_speed).toHaveLength(2);
    // Filament 1 prints on toolhead 1, so it slices with its high-flow filament values.
    expect(settings.filament_volume_type[0]).toBe("high_flow");
    expect(settings.filament_volume_type.slice(1).every((t: string) => t === "standard")).toBe(true);
    expect(decodeStamp(entries[STAMP_PATH])?.options.highFlowHotends).toEqual([true, false, false, false]);
  });

  it("keeps every filament's standard and high-flow values from a Snapmaker Orca save, including one mixing one- and two-value filaments", async () => {
    // A U1 project as Snapmaker Orca 2.4 saves it: slot 1 has a standard value only, slots 2 and 3 have both.
    const entries = unzipSync(readFixture("synthetic-demo.3mf"));
    const source = JSON.parse(new TextDecoder().decode(entries["Metadata/project_settings.config"]));
    for (const key of Object.keys(source)) if (key.endsWith("_extruder_variant") || key === "extruder_variant_list") delete source[key];
    Object.assign(source, {
      printer_settings_id: "Snapmaker U1 (0.4 nozzle)",
      nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"],
      filament_flow_step_size: ["1", "2", "2"],
      filament_flow_support: ["standard", "standard", "high_flow", "standard", "high_flow"],
      nozzle_temperature: ["210", "215", "220", "225", "230"],
      filament_flow_ratio: ["0.98", "1", "0.99", "0.97", "0.95"],
      enable_pressure_advance: ["0", "0", "1", "0", "1"],
      filament_max_volumetric_speed: ["18", "22", "40", "20", "48"],
    });
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
    const input = zipSync(entries);
    const settingsOf = (output: Uint8Array) => JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"]));

    const onFour = settingsOf((await convert(input, { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-standard" })).output);
    expect(onFour.filament_flow_step_size).toEqual(["2", "2", "2"]);
    expect(onFour.nozzle_temperature).toEqual(["210", "210", "215", "220", "225", "230"]);
    expect(onFour.filament_flow_ratio).toEqual(["0.98", "0.98", "1", "0.99", "0.97", "0.95"]);
    expect(onFour.enable_pressure_advance).toEqual(["0", "0", "0", "1", "0", "1"]);
    expect(onFour.filament_max_volumetric_speed).toEqual(["18", "18", "22", "40", "20", "40"]);

    // A nozzle without high flow keeps each filament's standard value.
    const onSix = settingsOf((await convert(input, { profiles: testProfileSource(), profileId: "snapmaker-u1-0.6-standard" })).output);
    expect(onSix.filament_flow_step_size).toEqual(["1", "1", "1"]);
    expect(onSix.nozzle_temperature).toEqual(["210", "215", "225"]);
    expect(onSix.filament_max_volumetric_speed).toEqual(["18", "22", "20"]);
  });

  it("stamps true as all four toolheads, and a list with none selected as false", async () => {
    const all = await convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.4-standard", highFlowHotends: true });
    expect(decodeStamp(unzipSync(all.output)[STAMP_PATH])?.options.highFlowHotends).toEqual([true, true, true, true]);
    const none = await convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), highFlowHotends: [false, false, false, false] });
    const noneEntries = unzipSync(none.output);
    expect(decodeStamp(noneEntries[STAMP_PATH])?.options.highFlowHotends).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(noneEntries["Metadata/project_settings.config"])).nozzle_volume_type).toEqual(["standard", "standard", "standard", "standard"]);
  });

  it("rejects a high-flow list that doesn't name exactly four toolheads", async () => {
    for (const bad of [[true], [true, false, false, false, true], ["yes", false, false, false]]) {
      await expect(
        convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), highFlowHotends: bad as unknown as boolean[] }),
      ).rejects.toThrow(/exactly 4 booleans/);
    }
  });

  it("still reads a stamp written before per-toolhead high flow (a plain boolean)", () => {
    const old = { stamp: 1, generator: "any2orca", version: "0.0.1", profiles: { version: "0.0.0", tracks: "Snapmaker Orca 2.4.0" }, profileId: "x", options: { highFlowHotends: true, filamentComplianceMode: null } };
    expect(decodeStamp(new TextEncoder().encode(JSON.stringify(old)))?.options.highFlowHotends).toBe(true);
    expect(decodeStamp(new TextEncoder().encode(JSON.stringify(old)))?.options.hardenedNozzles).toBe(false);
  });

  it("notes when high-flow is asked for on a nozzle without it", async () => {
    const { report } = await convert(readFixture("synthetic-2plate.3mf"), {
      profiles: testProfileSource(),
      profileId: "snapmaker-u1-0.8-standard",
      highFlowHotends: true,
    });
    expect(report.warnings.some((w) => w.includes("high-flow"))).toBe(true);
  });
});

describe("hostile input", () => {
  const good = unzipSync(readFixture("synthetic-2plate.3mf"));

  it("rejects bytes that aren't a zip", () => {
    expect(() => openProject(new TextEncoder().encode("not a zip"))).toThrow(Any2orcaError);
  });

  it("rejects a zip with no project settings, with a clear message", () => {
    const { "Metadata/project_settings.config": _, ...rest } = good;
    expect(() => openProject(zipSync(rest))).toThrow(/no print settings/);
  });

  for (const name of ["../evil.txt", "a/../../evil.txt", "/etc/evil", "C:/evil.txt", "a\\..\\evil.txt"]) {
    it(`rejects a zip-slip entry name: ${name}`, () => {
      expect(() => openProject(zipSync({ ...good, [name]: new Uint8Array(1) }))).toThrow(/a kind of path a real 3MF never has/);
    });
  }

  it("rejects project settings nested absurdly deep instead of recursing", () => {
    const deep = `{"a":${"[".repeat(200)}${"]".repeat(200)}}`;
    const bytes = zipSync({ ...good, "Metadata/project_settings.config": new TextEncoder().encode(deep) });
    expect(() => openProject(bytes)).toThrow(/print settings are damaged/);
    // The reason stays on the error for bug reports and logs.
    try {
      openProject(bytes);
    } catch (err) {
      expect(String((err as Error).cause)).toMatch(/nests deeper/);
    }
  });

  it("rejects more objects than the limit", () => {
    const model = new TextDecoder().decode(good["3D/3dmodel.model"]);
    const items = Array.from({ length: 1001 }, (_, i) => `<item objectid="${i + 1000}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join("");
    const bytes = zipSync({ ...good, "3D/3dmodel.model": new TextEncoder().encode(model.replace("</build>", `${items}</build>`)) });
    expect(() => openProject(bytes)).toThrow(expect.objectContaining({ code: "invalid_project" }));
  });

  it("never touches a file that isn't in the profile catalog's index", async () => {
    const reads: string[] = [];
    const source = testProfileSource();
    const spy = { readIndex: () => source.readIndex(), readProfile: (id: string) => (reads.push(id), source.readProfile(id)) };
    await expect(convert(readFixture("synthetic-2plate.3mf"), { profiles: spy, profileId: "../../etc/passwd" })).rejects.toThrow();
    expect(reads).toEqual([]);
  });
});

describe("version", () => {
  it("matches package.json (run `npm run sync-version` if this fails)", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    expect(VERSION).toBe(pkg.version);
  });
});
