// SPDX-License-Identifier: MIT
// PrusaSlicer projects through the command line, as a user runs it: convert one or several, from a zip, next to a
// Bambu Studio project, and what the other commands do with one. The reader itself is tested in src/sources/prusa;
// this is the CLI's own path (what it prints, what it writes, its exit codes).
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli, type CliIo } from "./main.js";

const FIXTURES = new URL("../test-fixtures/", import.meta.url);
const prusa = (name: string) => new URL(`prusaslicer/${name}`, FIXTURES);

let dir: string;
let lines: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line: string) => lines.push(line),
  err: (line: string) => lines.push(line),
});
const run = (...args: string[]) => runCli(args, io());
const text = () => lines.join("\n");
const unzip = (file: string) => unzipSync(new Uint8Array(readFileSync(file)));
const settingsOf = (file: string) => JSON.parse(strFromU8(unzip(file)["Metadata/project_settings.config"]!)) as Record<string, unknown>;
const stampOf = (file: string) => JSON.parse(strFromU8(unzip(file)["Metadata/any2orca.json"]!)) as Record<string, unknown>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-prusa-cli-"));
  lines = [];
  // Conversion progress and errors go through the CLI's logger, which writes to the console.
  vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(String(line)));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("any2orca convert, with a PrusaSlicer project", () => {
  it("converts the four-bed project saved by PrusaSlicer 2.9.7: its plates, its brim and supports, a stamp that names the source", async () => {
    const input = join(dir, "beds.3mf");
    copyFileSync(prusa("prusaslicer-2.9.7-beds.3mf"), input);
    expect(await run("convert", input)).toBe(0);
    const output = join(dir, "beds_U1.3mf");
    expect(existsSync(output)).toBe(true);

    const settings = settingsOf(output);
    expect(settings.printer_model).toBe("Snapmaker U1");
    // The Brim box was unchecked and supports were on, build plate only, snug.
    expect([settings.brim_type, settings.enable_support, settings.support_on_build_plate_only, settings.support_type, settings.support_style]).toEqual(["no_brim", "1", "1", "normal(auto)", "snug"]);
    const plates = strFromU8(unzip(output)["Metadata/model_settings.config"]!).match(/<plate>/g) ?? [];
    expect(plates).toHaveLength(4);
    expect(stampOf(output).source).toEqual({ format: "prusaslicer", slicerVersion: "2.9.7" });

    // What it tells the user, in the notes under the file's name.
    const printed = text();
    expect(printed).toContain("beds_U1.3mf");
    expect(printed).toContain("The project's 4 beds become 4 plates.");
    expect(printed).toMatch(/Print settings compared with PrusaSlicer's "0\.20mm QUALITY @XL 0\.4" \(Prusa Research's presets of PrusaSlicer 2\.9\.6\)/);
    expect(printed).toContain("settings have no Snapmaker Orca counterpart");
  });

  it("keeps every filament of the scene, in order, with the colors PrusaSlicer shows", async () => {
    const input = join(dir, "scene.3mf");
    copyFileSync(prusa("prusaslicer-2.9.6-scene.3mf"), input);
    expect(await run("convert", input)).toBe(0);
    const settings = settingsOf(join(dir, "scene_U1.3mf"));
    expect(settings.filament_colour).toEqual(["#000000", "#0000FF", "#21FF06", "#FB0207"]);
    expect(text()).toContain("taken from the printer's extruder colors");
    expect(text()).toContain("become pauses at the same heights");
  });

  it("converts a PrusaSlicer project and a Bambu Studio project in one run, each written next to its input", async () => {
    copyFileSync(prusa("prusaslicer-2.9.6.3mf"), join(dir, "box.3mf"));
    copyFileSync(new URL("sources/bambu-studio-2.8.4.57-beta.3mf", FIXTURES), join(dir, "bambu.3mf"));
    expect(await run("convert", join(dir, "box.3mf"), join(dir, "bambu.3mf"), "--out-dir", join(dir, "out"))).toBe(0);
    expect(readdirSync(join(dir, "out")).sort()).toEqual(["bambu_U1.3mf", "box_U1.3mf"]);
    expect(stampOf(join(dir, "out", "box_U1.3mf")).source).toEqual({ format: "prusaslicer", slicerVersion: "2.9.6" });
    // A Bambu Studio family file's stamp names its source too, and the two formats don't mix up.
    expect((stampOf(join(dir, "out", "bambu_U1.3mf")).source as { format: string }).format).toBe("bambu-family");
  });

  it("converts the PrusaSlicer project inside a zip", async () => {
    writeFileSync(join(dir, "bundle.zip"), zipSync({ "box.3mf": new Uint8Array(readFileSync(prusa("prusaslicer-2.9.6.3mf"))) }));
    expect(await run("convert", join(dir, "bundle.zip"))).toBe(0);
    expect(existsSync(join(dir, "box_U1.3mf"))).toBe(true);
  });

  it("fails with a message and writes nothing for a PrusaSlicer project that is cut short", async () => {
    const bytes = new Uint8Array(readFileSync(prusa("prusaslicer-2.9.6.3mf")));
    writeFileSync(join(dir, "cut.3mf"), bytes.subarray(0, Math.floor(bytes.length / 2)));
    expect(await run("convert", join(dir, "cut.3mf"))).toBe(1);
    expect(text()).toContain("isn't a complete zip archive");
    expect(existsSync(join(dir, "cut_U1.3mf"))).toBe(false);
  });

  it("refuses a project from a slicer built on PrusaSlicer that isn't supported, naming it", async () => {
    const entries = unzipSync(new Uint8Array(readFileSync(prusa("prusaslicer-2.9.6.3mf"))));
    const config = strFromU8(entries["Metadata/Slic3r_PE.config"]!).replace(/^; generated by PrusaSlicer [^\n]*/m, "; generated by SuperSlicer 2.5.59.13 on 2026-01-01 at 00:00:00 UTC");
    entries["Metadata/Slic3r_PE.config"] = new TextEncoder().encode(config);
    writeFileSync(join(dir, "super.3mf"), zipSync(entries));
    expect(await run("convert", join(dir, "super.3mf"))).toBe(1);
    expect(text()).toContain("SuperSlicer");
    expect(existsSync(join(dir, "super_U1.3mf"))).toBe(false);
  });
});

describe("the other commands, with a PrusaSlicer project", () => {
  // diff exits 1 when the projects differ, 0 when they don't, as the command documents.
  it("diff lists what differs between two PrusaSlicer projects, and says so when they're the same", async () => {
    expect(await run("diff", fileName("prusaslicer-2.9.6.3mf"), fileName("prusaslicer-2.9.6-scene.3mf"))).toBe(1);
    expect(text()).toContain("Print settings");
    lines = [];
    expect(await run("diff", fileName("prusaslicer-2.9.6.3mf"), fileName("prusaslicer-2.9.6.3mf"))).toBe(0);
    expect(text()).toContain("No differences.");
  });

  it("diff compares a PrusaSlicer project with Snapmaker's stock profile", async () => {
    expect(await run("diff", fileName("prusaslicer-2.9.6.3mf"), "--against-stock")).toBe(1);
    expect(text()).toContain("Snapmaker's stock");
  });

  it("presets add refuses a PrusaSlicer project that isn't set up for the U1, and takes its converted file", async () => {
    const input = join(dir, "box.3mf");
    copyFileSync(prusa("prusaslicer-2.9.6.3mf"), input);
    expect(await run("presets", "add", "box", input)).toBe(1);
    expect(text()).toContain("isn't set up for the Snapmaker U1");
    lines = [];
    expect(await run("convert", input)).toBe(0);
    lines = [];
    expect(await run("presets", "add", "box", join(dir, "box_U1.3mf"))).toBe(0);
    expect(text()).toContain("box:");
  });
});

function fileName(name: string): string {
  return fileURLToPath(prusa(name));
}
