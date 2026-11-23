// SPDX-License-Identifier: MIT
// The per-plate filament reading on crafted files: every list it reads is capped, every number range-checked, and
// none of it takes more than a moment, whatever the file claims.
import { strFromU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspect } from "./index.js";
import { readFixture } from "./test-helpers.js";

const FIXTURE = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";
const enc = new TextEncoder();

function withEntries(edits: Record<string, (text: string) => string>): Uint8Array {
  const entries = unzipSync(readFixture(FIXTURE));
  for (const [name, edit] of Object.entries(edits)) entries[name] = enc.encode(edit(entries[name] ? strFromU8(entries[name]) : ""));
  // Stored, not deflated: a flood of repeated tags compresses so well that the reader's zip-bomb check refuses it first.
  return zipSync(entries, { level: 0 });
}

/** inspect(), with how long it took. */
function timed(bytes: Uint8Array) {
  const start = performance.now();
  const info = inspect(bytes);
  return { info, ms: performance.now() - start };
}

const slots = (bytes: Uint8Array, plate: number) => inspect(bytes).plateFilaments!.find((p) => p.plate === plate)!.filaments.map((f) => f.slot);

describe("the per-plate filament reading on a crafted file", () => {
  it("reads a settings file with 200,000 object blocks in a moment", () => {
    const flood = Array.from({ length: 200_000 }, (_, i) => `<object id="${100_000 + i}"><metadata key="extruder" value="3"/></object>`).join("");
    const { info, ms } = timed(withEntries({ "Metadata/model_settings.config": (t) => t.replace("<config>", `<config>${flood}`) }));
    expect(info.plateFilaments).toHaveLength(7);
    expect(ms).toBeLessThan(5000);
  });

  it("reads an object with 100,000 parts in a moment", () => {
    const parts = Array.from({ length: 100_000 }, (_, i) => `<part id="${500_000 + i}" subtype="normal_part"><metadata key="extruder" value="2"/></part>`).join("");
    const { info, ms } = timed(withEntries({ "Metadata/model_settings.config": (t) => t.replace('<object id="6">', `<object id="6">${parts}`) }));
    expect(info.plateFilaments).toHaveLength(7);
    expect(ms).toBeLessThan(5000);
  });

  it.each([
    ["a number far past any filament", "99999999999999999999"],
    ["a negative number", "-3"],
    ["a fraction", "2.5"],
    ["not a number", "two"],
    ["an empty value", ""],
  ])("treats %s as no filament set, so the object prints with its default", (_, value) => {
    // Plate 2's cone and prism are on filament 4; with no usable value they print with filament 1.
    const bytes = withEntries({ "Metadata/model_settings.config": (t) => t.replaceAll('<metadata key="extruder" value="4"/>', `<metadata key="extruder" value="${value}"/>`) });
    expect(slots(bytes, 2)).toEqual([1]);
  });

  it("ignores tool changes at heights that aren't heights, and reads at most a capped number of them", () => {
    const layers = ["1e999", "-5", "NaN", "0x10", "12345678901234567890"].map((z) => `<layer top_z="${z}" type="2" extruder="1" color="" extra="" gcode="tool_change"/>`).join("");
    // 100,000 of them, about 8 MB: under the size above which the file isn't read at all, far over the count it reads.
    const flood = Array.from({ length: 100_000 }, () => '<layer top_z="5" type="2" extruder="2" color="" extra="" gcode="tool_change"/>').join("");
    const xml = (body: string) => () => `<custom_gcodes_per_layer><plate><plate_info id="2"/>${body}<mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>`;
    expect(slots(withEntries({ "Metadata/custom_gcode_per_layer.xml": xml(layers) }), 2)).toEqual([4]);
    const { info, ms } = timed(withEntries({ "Metadata/custom_gcode_per_layer.xml": xml(flood) }));
    expect(info.plateFilaments!.find((p) => p.plate === 2)!.filaments.map((f) => f.slot)).toEqual([2, 4]);
    expect(ms).toBeLessThan(5000);
    // A settings file past the size any real one has isn't read.
    const huge = Array.from({ length: 300_000 }, () => '<layer top_z="5" type="2" extruder="2" color="" extra="" gcode="tool_change"/>').join("");
    expect(slots(withEntries({ "Metadata/custom_gcode_per_layer.xml": xml(huge) }), 2)).toEqual([4]);
  });

  it("reads at most a capped number of pauses, ignores heights that aren't heights, and a huge custom G-code", () => {
    const flood = Array.from({ length: 50_000 }, (_, i) => `<layer top_z="${(i % 200) / 10 + 0.3}" type="1" extruder="1" color="" extra="" gcode=""/>`).join("");
    const junk = ['<layer top_z="1e309" type="1"/>', '<layer top_z="-4" type="1"/>', '<layer top_z="x" type="1"/>', `<layer top_z="3" type="4" extra="${"M117 x&#10;".repeat(5000)}M600"/>`].join("");
    const xml = `<?xml version="1.0"?><custom_gcodes_per_layer><plate><plate_info id="4"/>${junk}${flood}<mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>`;
    const { info, ms } = timed(withEntries({ "Metadata/custom_gcode_per_layer.xml": () => xml }));
    const pauses = info.plateFilaments!.find((p) => p.plate === 4)!.pauses!;
    expect(pauses.length).toBeLessThanOrEqual(1_000);
    expect(pauses.every((p) => p.height >= 0 && p.height <= 100_000)).toBe(true);
    expect(ms).toBeLessThan(5000);
  });

  it("reads a variable layer height file with a million values, or nonsense, in a moment", () => {
    const huge = `object_id=1|${Array.from({ length: 500_000 }, (_, i) => `${(i * 0.0001).toFixed(4)};0.1`).join(";")}`;
    const nonsense = ["layer_heights_profile_format_version=2", "object_id=2|0;0;0;0;0;0", "object_id=3|nan;0.2;1e999;0.2;5;0.2", "object_id=99999999999|0;0.2;1;0.2;2;0.2"].join("\n");
    for (const text of [huge, nonsense]) {
      const { info, ms } = timed(withEntries({ "Metadata/layer_heights_profile.txt": () => text }));
      expect(info.plateFilaments).toHaveLength(7);
      expect(ms).toBeLessThan(5000);
    }
  });

  it("ignores a plate number that isn't one of the project's", () => {
    const xml = () => '<custom_gcodes_per_layer><plate><plate_info id="4000000000"/><layer top_z="5" type="2" extruder="2" color="" extra="" gcode="tool_change"/><mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>';
    expect(inspect(withEntries({ "Metadata/custom_gcode_per_layer.xml": xml })).plateFilaments).toHaveLength(7);
  });

  it("ignores height ranges that run backward or past any printer, and reads at most a capped number", () => {
    const range = (min: string, max: string) => `<range min_z="${min}" max_z="${max}"><option opt_key="extruder">2</option></range>`;
    const bad = `<objects><object id="3">${range("10", "5")}${range("0", "1e300")}${range("a", "b")}</object></objects>`;
    expect(slots(withEntries({ "Metadata/layer_config_ranges.xml": () => bad }), 2)).toEqual([4]);
    // The same object with a range that is one: the filament counts.
    expect(slots(withEntries({ "Metadata/layer_config_ranges.xml": () => `<objects><object id="3">${range("5", "10")}</object></objects>` }), 2)).toEqual([2, 4]);
    const flood = `<objects><object id="3">${Array.from({ length: 200_000 }, () => range("1", "2")).join("")}</object></objects>`;
    const { ms } = timed(withEntries({ "Metadata/layer_config_ranges.xml": () => flood }));
    expect(ms).toBeLessThan(5000);
  });

  it("reads a painted triangle whose value is two million digits without running out of stack or time", () => {
    const bomb = "1".repeat(2_000_000);
    const { info, ms } = timed(withEntries({ "3D/Objects/object_6.model": (t) => t.replace('paint_color="0C"', `paint_color="${bomb}"`) }));
    // The value doesn't decode, so that triangle counts as unpainted; the other painted one still shows filament 3.
    expect(info.plateFilaments!.find((p) => p.plate === 3)!.filaments.map((f) => f.slot)).toEqual([1, 2, 3]);
    expect(ms).toBeLessThan(5000);
  });

  it("reads a mesh whose triangles name vertices that don't exist", () => {
    const bytes = withEntries({ "3D/Objects/object_6.model": (t) => t.replace(/<triangle v1="\d+" v2="\d+" v3="\d+" paint_color="0C"\/>/, '<triangle v1="4000000000" v2="7" v3="6" paint_color="0C"/>') });
    const third = inspect(bytes).plateFilaments!.find((p) => p.plate === 3)!;
    // The paint is still found; its height falls back to the part's.
    expect(third.filaments.find((f) => f.slot === 3)).toEqual({ slot: 3, uses: ["paint"], from: 0, to: 25.6, firstLayer: 1, lastLayer: 128 });
  });
});
