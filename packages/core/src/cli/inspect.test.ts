// SPDX-License-Identifier: MIT
// any2orca inspect: what a project holds, as text and as JSON, and what it says about a file it can't read.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspect } from "../project.js";
import { readFixture } from "../test-helpers.js";
import { INSPECT_JSON_FORMAT } from "./commands/inspect.js";
import { runCli, type CliIo } from "./main.js";

const SEVEN_PLATES = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";

let dir: string;
let out: string[];
let err: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line: string) => out.push(line),
  err: (line: string) => err.push(line),
});

/** Writes bytes into the temporary folder and returns the path. */
function file(name: string, bytes: Uint8Array | string): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-inspect-"));
  out = [];
  err = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("any2orca inspect", () => {
  it("prints the printer, the filaments, and each plate's objects and filaments", async () => {
    expect(await runCli(["inspect", file("model.3mf", readFixture(SEVEN_PLATES))], io())).toBe(0);
    const text = out.join("\n");
    expect(out[0]).toBe("model.3mf");
    expect(text).toMatch(/^ {2}Printer {9}Bambu Lab X1 Carbon \(bambu\)$/m);
    expect(text).toMatch(/^ {2}Process preset {2}0\.20mm Standard @BBL X1C$/m);
    expect(text).toMatch(/^ {2}Nozzle {10}0\.4 mm$/m);
    expect(text).toMatch(/^ {2}Layer height {4}0\.2 mm$/m);
    expect(text).toMatch(/^ {2}Plates {10}7$/m);
    expect(text).toMatch(/^ {2}Objects {9}18$/m);
    expect(text).toContain("  Filaments (6)");
    expect(text).toMatch(/^ {4}3 {2}#0056B8 {2}PETG {2}PolyLite PETG @BBL X1C$/m);
    // A filament whose preset and color match a known product shows its color name too.
    expect(text).toMatch(/^ {4}4 {2}#C12E1F {2}PLA {3}Bambu PLA Basic @BBL X1C\(bambu-studio-2\.8\.4\.57-beta\.3mf\) {2}Basic Red$/m);
    // With the layers each filament prints on, as Snapmaker Orca's layer slider numbers them.
    expect(text).toContain("    Plate 3: 2 objects, filaments 1, 2, 3\n      1: objects, 0 to 25.6 mm (layers 1 to 128)\n      2: objects, 0 to 25.6 mm (layers 1 to 128)\n      3: paint, 0 to 25.6 mm (layers 1 to 128)");
    // Plate 1 prints object by object, so its layers aren't numbered.
    expect(text).toContain("    Plate 1: 3 objects, filaments 1, 2, 3\n      1: objects, 0 to 25.6 mm\n");
    expect(text).toContain("    Plate 2: 2 objects, filament 4\n");
    expect(text).toContain("    Plate 6: 5 objects, filaments 1, 2, 3, 5, 6\n");
    expect(err).toEqual([]);
  });

  it("says how many filaments a plate needs at the same height when that is fewer than it uses", async () => {
    // Plate 2 prints with filament 4; a tool change at 10 mm brings in filament 1.
    const entries = unzipSync(readFixture(SEVEN_PLATES));
    entries["Metadata/custom_gcode_per_layer.xml"] = strToU8(
      '<custom_gcodes_per_layer><plate><plate_info id="2"/><layer top_z="10" type="2" extruder="1" color="" extra="" gcode="tool_change"/><layer top_z="20" type="2" extruder="2" color="" extra="" gcode="tool_change"/><mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>',
    );
    expect(await runCli(["inspect", file("model.3mf", zipSync(entries))], io())).toBe(0);
    expect(out.join("\n")).toContain("    Plate 2: 2 objects, filaments 1, 2, 4, 2 at the same height\n      1: a tool change at a layer, 9.8 to 20 mm (layers 50 to 100)\n");
  });

  it("says how a plate with more filaments than the U1 has toolheads prints on them, with its pauses", async () => {
    // Plate 2 prints with filament 4; tool changes bring in 1, 2, 3 and 5, and a pause sits at 12 mm.
    const entries = unzipSync(readFixture(SEVEN_PLATES));
    const changes = [[5, 1], [10, 2], [15, 3], [20, 5]].map(([z, f]) => `<layer top_z="${z}" type="2" extruder="${f}" color="" extra="" gcode="tool_change"/>`).join("");
    entries["Metadata/custom_gcode_per_layer.xml"] = strToU8(
      `<custom_gcodes_per_layer><plate><plate_info id="2"/>${changes}<layer top_z="12" type="1" extruder="1" color="" extra="" gcode="M601"/><mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>`,
    );
    expect(await runCli(["inspect", file("model.3mf", zipSync(entries))], io())).toBe(0);
    expect(out.join("\n")).toContain(
      "      Layers: 0.2 mm\n      Pause: layer 60 (12 mm)\n      On the U1's 4 toolheads: load 1, 2, 3, 4 to start\n        filaments 4, then 5 share a toolhead: 4 to 5, a pause on a layer from 26 to 100: in place at layer 60 (12 mm)",
    );
    out.length = 0;
    expect(await runCli(["inspect", file("model.3mf", zipSync(entries)), "--json"], io())).toBe(0);
    const printed = JSON.parse(out.join("\n")) as { toolheads: number; swapPlans: Array<{ plate: number; load: number[] }> };
    expect(printed.toolheads).toBe(4);
    expect(printed.swapPlans.map((p) => [p.plate, p.load])).toEqual([[2, [1, 2, 3, 4]]]);
  });

  it("--json prints the whole reading, the same as the library gives", async () => {
    const bytes = readFixture(SEVEN_PLATES);
    expect(await runCli(["inspect", file("model.3mf", bytes), "--json"], io())).toBe(0);
    const printed = JSON.parse(out.join("\n")) as { format: string; version: number; file: string; inspection: unknown };
    expect(printed.format).toBe(INSPECT_JSON_FORMAT.format);
    expect(printed.version).toBe(1);
    expect(printed.file).toBe("model.3mf");
    expect(printed.inspection).toEqual(JSON.parse(JSON.stringify(inspect(bytes))));
  });

  it("reads a converted project too", async () => {
    const { convert } = await import("../project.js");
    const { testProfileSource } = await import("../test-helpers.js");
    const { output } = await convert(readFixture(SEVEN_PLATES), { profiles: testProfileSource() });
    expect(await runCli(["inspect", file("model_U1.3mf", output)], io())).toBe(0);
    expect(out.join("\n")).toMatch(/^ {2}Printer {9}Snapmaker U1 \(snapmaker\)$/m);
    expect(out.join("\n")).toContain("    Plate 6: 5 objects, filaments 1, 2, 3, 5, 6\n");
  });

  it("never prints a control code from the file: as text it is replaced, as JSON escaped", async () => {
    const entries = unzipSync(readFixture(SEVEN_PLATES));
    const settings = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]!)) as Record<string, unknown>;
    (settings.filament_settings_id as string[])[0] = "Evil\u001b[2J\u001b]0;title\u0007 PLA‮";
    settings.printer_model = "Printer\u001b[31m";
    entries["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    const path = file("model.3mf", zipSync(entries));

    expect(await runCli(["inspect", path], io())).toBe(0);
    expect(out.join("\n")).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f‮]/);
    expect(out.join("\n")).toContain("Evil");

    out = [];
    expect(await runCli(["inspect", path, "--json"], io())).toBe(0);
    expect(out.join("\n")).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f‮]/);
    expect(() => JSON.parse(out.join("\n"))).not.toThrow();
  });

  it.each([
    ["a file that doesn't exist", () => join(dir, "missing.3mf"), /doesn't exist/],
    ["a file that isn't a zip", () => file("broken.3mf", "not a zip"), /can't be read as a 3MF project/],
    ["a project over the size given", () => file("model.3mf", readFixture(SEVEN_PLATES)), /too large/],
  ])("exits 2 and says why for %s", async (what, path, message) => {
    const args = what.includes("size") ? ["inspect", path(), "--max-unpacked", "1MB"] : ["inspect", path()];
    expect(await runCli(args, io())).toBe(2);
    expect(err.join("\n")).toMatch(message);
    expect(out).toEqual([]);
  });

  it("takes exactly one file, and refuses an option it doesn't have", async () => {
    expect(await runCli(["inspect"], io())).toBe(2);
    expect(await runCli(["inspect", "a.3mf", "b.3mf"], io())).toBe(2);
    expect(err.every((line) => line.includes("Usage: any2orca inspect <file.3mf>"))).toBe(true);
    err = [];
    expect(await runCli(["inspect", "a.3mf", "--profile", "x"], io())).toBe(2);
    expect(err.join("\n")).toMatch(/--profile/);
  });

  it("has its own help, and a line in the top-level help", async () => {
    expect(await runCli(["inspect", "--help"], io())).toBe(0);
    expect(out.join("\n")).toContain("Usage: any2orca inspect <file.3mf> [options]");
    expect(out.join("\n")).toContain("format any2orca-inspect, version 1");
    out = [];
    expect(await runCli(["--help"], io())).toBe(0);
    expect(out.join("\n")).toMatch(/inspect <file\.3mf>\s+Show what a project holds/);
  });
});
