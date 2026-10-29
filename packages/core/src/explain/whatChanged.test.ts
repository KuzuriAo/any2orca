// SPDX-License-Identifier: MIT
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../profiles.js";
import { convert, type ConvertOptions } from "../project.js";
import { readFixture, testProfileSource } from "../test-helpers.js";
import { formatWhatChanged, type ChangeReason, type WhatChanged } from "./whatChanged.js";

const SETTINGS_PATH = "Metadata/project_settings.config";
const catalogPromise = loadCatalog(testProfileSource());

function withSettings(bytes: Uint8Array, edit: (settings: Record<string, unknown>) => void): Uint8Array {
  const files = unzipSync(bytes);
  const settings = JSON.parse(strFromU8(files[SETTINGS_PATH]));
  edit(settings);
  files[SETTINGS_PATH] = strToU8(JSON.stringify(settings));
  return zipSync(files);
}

/** The demo with the creator's own changes added (and flagged as changed, as Bambu Studio does). */
function demo(changes: Record<string, unknown> = {}): Uint8Array {
  return withSettings(readFixture("synthetic-demo.3mf"), (s) => {
    Object.assign(s, changes);
    const flagged = String((s.different_settings_to_system as string[])[0]).split(";");
    (s.different_settings_to_system as string[])[0] = [...flagged, ...Object.keys(changes)].join(";");
  });
}

async function record(bytes: Uint8Array, options: Partial<ConvertOptions> = {}): Promise<WhatChanged> {
  const { report } = await convert(bytes, { profiles: await catalogPromise, ...options });
  return report.whatChanged;
}

const item = (w: WhatChanged, reason: ChangeReason, key: string) => w.groups.find((g) => g.reason === reason)?.items.find((i) => i.key === key);
const reasons = (w: WhatChanged) => w.groups.map((g) => g.reason);
const ORDER: ChangeReason[] = ["creator", "stock", "capped", "firmware", "layout", "yours"];

describe("what changed", () => {
  it("lists the creator's changes with Snapmaker's stock value as before", async () => {
    const w = await record(demo({ wall_loops: "5" }));
    expect(w).toMatchObject({ format: "any2orca-what-changed", version: 1, profile: { id: "snapmaker-u1-0.4-standard", chosenBy: "matched" } });
    expect(item(w, "creator", "wall_loops")).toMatchObject({ label: "Strength > Walls > Wall loops", before: "2", after: "5" });
    expect(w.groups.find((g) => g.reason === "creator")?.items.some((i) => /filaments?: colors, materials/.test(i.label))).toBe(true);
  });

  it("says why a setting the creator's file has wasn't used", async () => {
    const w = await record(withSettings(readFixture("synthetic-demo.3mf"), (s) => void (s.sparse_infill_speed = "430")));
    expect(item(w, "stock", "sparse_infill_speed")).toMatchObject({ before: "430", note: "the creator's file doesn't mark it as changed" });
    const printer = w.groups.find((g) => g.reason === "stock")?.items.find((i) => i.key === undefined);
    expect(printer?.label).toMatch(/^\d+ printer settings? \(G-code/);
  });

  describe("a two-nozzle source (Bambu H2D/H2C)", () => {
    // One value per nozzle and flow variant: [nozzle 1 standard, nozzle 1 high flow, nozzle 2 standard, nozzle 2 high flow].
    const twoNozzles = {
      nozzle_diameter: ["0.4", "0.4"],
      nozzle_volume_type: ["Standard", "Standard"],
      print_extruder_id: ["1", "1", "2", "2"],
      print_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow", "Direct Drive Standard", "Direct Drive High Flow"],
    };
    const twoNozzleDemo = (changes: Record<string, unknown>) =>
      withSettings(demo(changes), (s) => void Object.assign(s, twoNozzles));

    it("carries the creator's per-variant value", async () => {
      const { report } = await convert(twoNozzleDemo({ outer_wall_speed: ["50", "60", "50", "60"] }), { profiles: await catalogPromise });
      expect(item(report.whatChanged, "creator", "outer_wall_speed")).toMatchObject({ after: "50, 60" });
      expect(report.warnings.join("\n")).not.toMatch(/outer_wall_speed/);
    });

    it("uses the lower value, with a warning, when the two nozzles disagree", async () => {
      const { report } = await convert(twoNozzleDemo({ outer_wall_speed: ["70", "60", "50", "80"] }), { profiles: await catalogPromise });
      expect(item(report.whatChanged, "creator", "outer_wall_speed")).toMatchObject({ after: "50, 60" });
      expect(report.warnings.join("\n")).toMatch(/outer_wall_speed.*two nozzles.*lower/);
    });
  });

  it("carries the creator's overhang speeds", async () => {
    const w = await record(demo({ overhang_2_4_speed: "25" }));
    expect(item(w, "creator", "overhang_2_4_speed")).toMatchObject({ after: "25" });
  });

  it("says so, with a warning, when a setting the creator changed can't be carried over", async () => {
    const { report } = await convert(demo({ outer_wall_speed: ["50", "70", "90"] }), { profiles: await catalogPromise });
    expect(item(report.whatChanged, "stock", "outer_wall_speed")?.note).toMatch(/creator changed it/);
    expect(report.warnings.join("\n")).toMatch(/outer_wall_speed/);
  });

  it("puts values lowered to the U1's limits under capped", async () => {
    const w = await record(demo({ outer_wall_speed: "900" }));
    expect(item(w, "capped", "outer_wall_speed")).toMatchObject({ before: "900", after: "500", note: "the U1's machine limit" });
  });

  it("lists your options under your choices", async () => {
    const hardened = await record(demo(), { hardenedNozzles: true, highFlowHotends: true, filamentComplianceMode: "generic" });
    expect(item(hardened, "yours", "nozzle_type")).toMatchObject({ after: "hardened_steel" });
    expect(item(hardened, "yours", "nozzle_volume_type")?.after).toContain("high_flow");
    expect(hardened.groups.find((g) => g.reason === "yours")?.items.some((i) => i.label.startsWith("Filament names relabeled to Generic"))).toBe(true);

    const preset = await record(demo({ wall_loops: "5" }), {
      preset: { name: "x", base: "snapmaker-u1-0.4-standard", baseInferred: false, catalog: { version: "t", tracks: "t" }, changes: { wall_loops: "6" }, created: "2026-10-21" },
    });
    expect(preset.profile.chosenBy).toBe("preset");
    expect(item(preset, "yours", "wall_loops")).toMatchObject({ before: "5", after: "6", note: "from your preset" });
    expect(item(preset, "creator", "wall_loops")).toBeUndefined();
  });

  it("describes the layout: print sequence and objects moved onto the U1's bed", async () => {
    const w = await record(demo());
    const layout = w.groups.find((g) => g.reason === "layout");
    expect(layout?.items.some((i) => /^Plate \d+: .* moved to the center of the U1's bed$/.test(i.label))).toBe(true);
  });

  it("keeps the groups in one fixed order, without empty groups or bookkeeping", async () => {
    const w = await record(demo({ wall_loops: "5", outer_wall_speed: "900" }), { hardenedNozzles: true, profileId: "snapmaker-u1-0.4-standard" });
    expect(w.profile.chosenBy).toBe("you");
    expect(reasons(w)).toEqual(ORDER.filter((r) => reasons(w).includes(r)));
    expect(w.groups.every((g) => g.items.length > 0 && g.title && g.description)).toBe(true);
    const keys = w.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).not.toContain("different_settings_to_system");
    expect(new Set(keys.filter(Boolean)).size).toBe(keys.filter(Boolean).length);
  });

  it("adds every difference only when asked", async () => {
    expect((await record(demo())).diff).toBeUndefined();
    const w = await record(demo(), { explain: true });
    expect(w.diff).toMatchObject({ format: "any2orca-diff", aLabel: "Original file", bLabel: "Converted file", identical: false });
  });

  it("reads as plain text with the same groups and order", async () => {
    const w = await record(demo({ wall_loops: "5" }), { hardenedNozzles: true });
    const text = formatWhatChanged(w);
    expect(text.split("\n")[0]).toBe("Converted with 0.20mm Standard @Snapmaker U1 (0.4 nozzle) (matched to the file).");
    expect(text).toContain("  Strength > Walls > Wall loops [wall_loops]: 2 -> 5");
    const titles = w.groups.map((g) => g.title);
    expect(titles.map((t) => text.indexOf(`\n${t} (`))).toEqual([...titles.map((t) => text.indexOf(`\n${t} (`))].sort((a, b) => a - b));
  });

  it("doesn't change the converted file", async () => {
    const catalog = await catalogPromise;
    const a = await convert(demo({ wall_loops: "5" }), { profiles: catalog, stamp: false });
    const b = await convert(demo({ wall_loops: "5" }), { profiles: catalog, stamp: false, explain: true });
    expect(b.output).toEqual(a.output);
  });
});
