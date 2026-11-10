// SPDX-License-Identifier: MIT
import { readdirSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../index.js";
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { readFixture, testProfileSource } from "../test-helpers.js";
import { NEW_FILAMENT_COLORS, padFilamentsToToolheads } from "./padFilamentsToToolheads.js";
import type { JsonRecord } from "./types.js";

/** A project's filament settings in the U1's layout: one value per filament, or two (standard, high flow) on the 0.4 nozzle. */
function project(names: string[], colors: string[]): JsonRecord {
  const n = names.length;
  return {
    filament_settings_id: names,
    filament_colour: colors,
    filament_ids: names.map((_, i) => `GF${i}`),
    filament_type: names.map(() => "PLA"),
    filament_volume_type: names.map(() => "standard"),
    nozzle_temperature: names.flatMap((_, i) => [`${220 + i}`, `${230 + i}`]),
    different_settings_to_system: ["print", ...names.map((_, i) => `entry ${i + 1}`), "printer"],
    inherits_group: ["", ...names.map((_, i) => `parent ${i + 1}`), ""],
    flush_volumes_vector: names.flatMap(() => ["140", "120"]),
    flush_volumes_matrix: Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? "0" : "300")),
    // One per toolhead, not per filament.
    extruder_colour: ["#FCE94F", "#FCE94F", "#FCE94F", "#FCE94F"],
    nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"],
  };
}

describe("padFilamentsToToolheads", () => {
  it("pads one filament to four with copies of it, in the app's first new-filament colors", () => {
    const s = project(["Bambu PLA Basic @BBL X1C"], ["#000000"]);
    expect(padFilamentsToToolheads(s, 1, 4)).toBe(3);
    expect(s.filament_settings_id).toEqual(Array(4).fill("Bambu PLA Basic @BBL X1C"));
    expect(s.filament_colour).toEqual(["#000000", "#00C1AE", "#F4E2C1", "#ED1C24"]);
    expect(s.filament_ids).toEqual(Array(4).fill("GF0"));
    expect(s.nozzle_temperature).toEqual(["220", "230", "220", "230", "220", "230", "220", "230"]);
    expect(s.different_settings_to_system).toEqual(["print", "entry 1", "entry 1", "entry 1", "entry 1", "printer"]);
    expect(s.inherits_group).toEqual(["", "parent 1", "parent 1", "parent 1", "parent 1", ""]);
    // Each added filament takes the first one's volumes; a new pair, the unloading plus the loading volume.
    expect(s.flush_volumes_vector).toEqual(["140", "120", "140", "120", "140", "120", "140", "120"]);
    expect(s.flush_volumes_matrix).toEqual(["0", "260", "260", "260", "260", "0", "260", "260", "260", "260", "0", "260", "260", "260", "260", "0"]);
    expect(s.extruder_colour).toHaveLength(4);
  });

  it("copies the last filament, keeps the others as they are, and leaves per-toolhead settings alone", () => {
    const two = project(["A", "B"], ["#111111", "#222222"]);
    padFilamentsToToolheads(two, 2, 4);
    expect(two.filament_settings_id).toEqual(["A", "B", "B", "B"]);
    expect(two.nozzle_temperature).toEqual(["220", "230", "221", "231", "221", "231", "221", "231"]);
    expect(two.different_settings_to_system).toEqual(["print", "entry 1", "entry 2", "entry 2", "entry 2", "printer"]);
    // Four values, like two filaments' standard and high-flow ones, but one per toolhead.
    expect(two.extruder_colour).toEqual(["#FCE94F", "#FCE94F", "#FCE94F", "#FCE94F"]);
    expect(two.nozzle_diameter).toEqual(["0.4", "0.4", "0.4", "0.4"]);
    expect((two.flush_volumes_matrix as string[]).slice(0, 2)).toEqual(["0", "300"]);

    const three = project(["A", "B", "C"], ["#111111", "#222222", "#333333"]);
    expect(padFilamentsToToolheads(three, 3, 4)).toBe(1);
    expect(three.filament_settings_id).toEqual(["A", "B", "C", "C"]);
    expect(three.filament_colour).toEqual(["#111111", "#222222", "#333333", "#00C1AE"]);
  });

  it("skips a color one of the project's filaments already has, whatever its case or alpha", () => {
    const s = project(["A", "B"], ["#00c1aeff", "#ED1C24"]);
    padFilamentsToToolheads(s, 2, 4);
    expect(s.filament_colour).toEqual(["#00c1aeff", "#ED1C24", "#F4E2C1", "#00FF7F"]);
  });

  it("changes nothing with a filament per toolhead or more, none at all, or more toolheads than the palette has colors", () => {
    for (const [names, toolheads] of [[["A", "B", "C", "D"], 4], [["A", "B", "C", "D", "E"], 4], [["A"], NEW_FILAMENT_COLORS.length + 1]] as const) {
      const s = project([...names], names.map(() => "#111111"));
      const before = structuredClone(s);
      expect(padFilamentsToToolheads(s, names.length, toolheads)).toBe(0);
      expect(s).toEqual(before);
    }
    const none: JsonRecord = { filament_settings_id: [] };
    expect(padFilamentsToToolheads(none, 0, 4)).toBe(0);
    expect(none).toEqual({ filament_settings_id: [] });
  });

  it("leaves a setting alone whose list fits neither layout", () => {
    const s = project(["A"], ["#111111"]);
    s.filament_type = ["PLA", "PLA", "PLA"];
    s.flush_volumes_matrix = ["0", "1"];
    padFilamentsToToolheads(s, 1, 4);
    expect(s.filament_type).toEqual(["PLA", "PLA", "PLA"]);
    expect(s.flush_volumes_matrix).toEqual(["0", "1"]);
    expect(s.flush_volumes_vector).toEqual(["140", "120"]);
  });
});

describe("converted files have a filament per toolhead", () => {
  const fixtures = [
    ...readdirSync(new URL("../test-fixtures", import.meta.url)).filter((f) => f.endsWith(".3mf")),
    ...["sources", "prusaslicer"].flatMap((dir) => readdirSync(new URL(`../test-fixtures/${dir}`, import.meta.url)).filter((f) => f.endsWith(".3mf")).map((f) => `${dir}/${f}`)),
  ];

  it.each(fixtures)("%s: the creator's filaments first, copies of the last up to four, and every filament list that long", async (file) => {
    const { output, report } = await convert(readFixture(file), { profiles: testProfileSource() });
    const s = JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as JsonRecord;
    const names = s.filament_settings_id as string[];
    const own = report.filamentSlots;
    expect(names.slice(0, own)).toEqual(report.filaments.map((f) => f.outputName));
    expect(names.length).toBe(Math.max(own, 4));
    expect(names.slice(own)).toEqual(Array(names.length - own).fill(names[own - 1]));
    const n = names.length;
    for (const [key, value] of Object.entries(s)) {
      if (!Array.isArray(value) || !Object.hasOwn(SETTINGS_CATALOG, key) || SETTINGS_CATALOG[key].group !== "filament") continue;
      expect([n, n * 2], key).toContain(value.length);
    }
    expect(s.different_settings_to_system).toHaveLength(n + 2);
    expect(s.flush_volumes_matrix).toHaveLength(n * n);
    expect(s.flush_volumes_vector).toHaveLength(n * 2);
    const labels = report.whatChanged.groups.flatMap((g) => g.items.map((item) => item.label));
    expect(labels.some((label) => /added as (a copy|copies) of filament/.test(label))).toBe(own < 4);
  });

  // A filament setting the source doesn't have is Snapmaker's stock value, one filament's, so every filament gets the
  // same: with two filaments, a stock standard and high-flow pair isn't one value for each.
  /** The source's settings, or undefined for a project without strict JSON ones (PrusaSlicer's, a hand-damaged file's). */
  const sourceSettings = (file: string): JsonRecord | undefined => {
    const entry = unzipSync(readFixture(file))["Metadata/project_settings.config"];
    try {
      return entry ? (JSON.parse(strFromU8(entry)) as JsonRecord) : undefined;
    } catch {
      return undefined;
    }
  };
  it.each(fixtures.filter((file) => sourceSettings(file)))(
    "%s: a filament setting the source doesn't have is the same stock value for every filament",
    async (file) => {
      const source = sourceSettings(file)!;
      const { output, report } = await convert(readFixture(file), { profiles: testProfileSource() });
      const s = JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as JsonRecord;
      const n = (s.filament_settings_id as string[]).length;
      // A filament set to a U1 preset (the creator's printer took it at another diameter) has that preset's values.
      const presetSlots = new Set((report.filamentPresets ?? []).map((p) => p.slot - 1));
      const ref = Array.from({ length: n }, (_, i) => i).find((i) => !presetSlots.has(i)) ?? 0;
      let checked = 0;
      for (const [key, value] of Object.entries(s)) {
        if (Object.hasOwn(source, key) || !Array.isArray(value) || !Object.hasOwn(SETTINGS_CATALOG, key) || SETTINGS_CATALOG[key].group !== "filament") continue;
        const per = value.length / n;
        for (let slot = 0; slot < n; slot++) {
          if (slot === ref || presetSlots.has(slot)) continue;
          expect(value.slice(slot * per, slot * per + per), `${key}, filament ${slot + 1}`).toEqual(value.slice(ref * per, ref * per + per));
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
  );
});
