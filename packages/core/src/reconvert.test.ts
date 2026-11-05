// SPDX-License-Identifier: MIT
// Converting a file that's already set up for the U1 (a converted file, converted again) says nothing about "the
// creator" that the first conversion didn't: the converter's own layout read back isn't a creator's change.
import { readFileSync, readdirSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, inspect } from "./index.js";
import { testProfileSource } from "./test-helpers.js";

const FIXTURES = new URL("./test-fixtures/", import.meta.url);
const read = (path: string) => new Uint8Array(readFileSync(new URL(path, FIXTURES)));
const settingsOf = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)["Metadata/project_settings.config"]!)) as Record<string, unknown>;
const SOURCES = [
  ...readdirSync(new URL("sources/", FIXTURES)).filter((f) => f.endsWith(".3mf")).map((f) => `sources/${f}`),
  ...readdirSync(new URL("prusaslicer/", FIXTURES)).filter((f) => f.endsWith(".3mf")).map((f) => `prusaslicer/${f}`),
  "synthetic-demo.3mf",
];

describe("converting a converted file again", () => {
  for (const file of SOURCES) {
    it(`${file}: no note the first conversion didn't give, and the file is recognized as set up for the U1`, async () => {
      const first = await convert(read(file), { profiles: testProfileSource() });
      expect(inspect(first.output)).toMatchObject({ sourceVendor: "snapmaker", printerModel: "Snapmaker U1" });
      const again = await convert(first.output, { profiles: testProfileSource() });
      expect(again.report.warnings.filter((w) => !first.report.warnings.includes(w))).toEqual([]);
    });
  }
});

describe("filament ids", () => {
  it("are empty, one per filament, for a source that has none (PrusaSlicer), as Snapmaker Orca writes them", async () => {
    const { output } = await convert(read("prusaslicer/prusaslicer-2.9.6-scene.3mf"), { profiles: testProfileSource() });
    const settings = settingsOf(output);
    expect(settings.filament_ids).toEqual(["", "", "", ""]);
    expect((settings.filament_colour as string[]).length).toBe(4);
  });

  it("are the source's own when it has them (Bambu Studio)", async () => {
    const source = read("sources/bambu-studio-2.8.4.57-beta.3mf");
    const own = JSON.parse(strFromU8(unzipSync(source)["Metadata/project_settings.config"]!)).filament_ids;
    expect(Array.isArray(own) && own.length === 4).toBe(true);
    expect(settingsOf((await convert(source, { profiles: testProfileSource() })).output).filament_ids).toEqual(own);
  });

  it("are the Snapmaker presets' own when the filament names are relabeled, also for a source that had none", async () => {
    const { output } = await convert(read("prusaslicer/prusaslicer-2.9.6-scene.3mf"), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" });
    const ids = settingsOf(output).filament_ids as string[];
    expect(ids).toHaveLength(4);
    expect(ids.every((id) => /^\d+$/.test(id)), ids.join(",")).toBe(true);
  });
});
