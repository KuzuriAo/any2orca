// SPDX-License-Identifier: MIT
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { ChangeReason, WhatChanged } from "../explain/whatChanged.js";
import { loadCatalog } from "../profiles.js";
import { convert, type ConvertOptions } from "../project.js";
import { withoutChanges } from "../presets/preset.js";
import { decodeStamp, STAMP_PATH } from "../stamp.js";
import { readFixture, testProfileSource } from "../test-helpers.js";
import { ABOVE_STOCK_DEFAULTS, resolveAboveStockChoice } from "./aboveStock.js";

const SETTINGS_PATH = "Metadata/project_settings.config";
const PROFILE = "snapmaker-u1-0.4-standard";
const catalogPromise = loadCatalog(testProfileSource());

/** The demo with the creator's own values (flagged as changed, as Bambu Studio does). */
function demo(changes: Record<string, unknown>): Uint8Array {
  const files = unzipSync(readFixture("synthetic-demo.3mf"));
  const s = JSON.parse(strFromU8(files[SETTINGS_PATH]));
  Object.assign(s, changes);
  const flagged = String(s.different_settings_to_system[0]).split(";");
  s.different_settings_to_system[0] = [...flagged, ...Object.keys(changes)].join(";");
  files[SETTINGS_PATH] = strToU8(JSON.stringify(s));
  return zipSync(files);
}

async function run(bytes: Uint8Array, options: Partial<ConvertOptions> = {}) {
  const { output, report } = await convert(bytes, { profiles: await catalogPromise, profileId: PROFILE, ...options });
  return { settings: JSON.parse(strFromU8(unzipSync(output)[SETTINGS_PATH])) as Record<string, unknown>, report, output };
}

async function stock(key: string): Promise<number> {
  const raw = (await (await catalogPromise).load(PROFILE)).convertProfile.profile.baselineProjectSettings[key];
  return Number(Array.isArray(raw) ? raw[0] : raw);
}

const first = (v: unknown) => Number(Array.isArray(v) ? v[0] : v);
const item = (w: WhatChanged, reason: ChangeReason, key: string) => w.groups.find((g) => g.reason === reason)?.items.find((i) => i.key === key);

describe("values above stock", () => {
  it("covers speeds, accelerations and max volumetric speed, with today's behavior as each default", () => {
    expect(ABOVE_STOCK_DEFAULTS.outer_wall_speed).toBe("keep");
    expect(ABOVE_STOCK_DEFAULTS.outer_wall_acceleration).toBe("stock");
    expect(ABOVE_STOCK_DEFAULTS.travel_speed).toBe("stock");
    expect(ABOVE_STOCK_DEFAULTS.filament_max_volumetric_speed).toBe("capped");
    expect(ABOVE_STOCK_DEFAULTS.overhang_1_4_speed).toBe("keep");
    expect(ABOVE_STOCK_DEFAULTS).not.toHaveProperty("nozzle_temperature");
  });

  it("keeps a creator's faster print speed by default, and offers Snapmaker's stock value instead", async () => {
    const fast = String((await stock("outer_wall_speed")) + 100);
    const byDefault = await run(demo({ outer_wall_speed: fast }));
    expect(first(byDefault.settings.outer_wall_speed)).toBe(Number(fast));
    expect(item(byDefault.report.whatChanged, "creator", "outer_wall_speed")).toMatchObject({ alternative: "stock" });

    const chosen = await run(demo({ outer_wall_speed: fast }), { aboveStock: { stock: ["outer_wall_speed"] } });
    expect(first(chosen.settings.outer_wall_speed)).toBe(await stock("outer_wall_speed"));
    expect(item(chosen.report.whatChanged, "yours", "outer_wall_speed")).toMatchObject({ note: "you chose Snapmaker's stock value", alternative: "keep" });
  });

  it("keeps Snapmaker's stock acceleration by default when the creator's is higher, and offers the creator's instead", async () => {
    const higher = String((await stock("outer_wall_acceleration")) + 1000);
    const byDefault = await run(demo({ outer_wall_acceleration: higher }));
    expect(first(byDefault.settings.outer_wall_acceleration)).toBe(await stock("outer_wall_acceleration"));
    expect(item(byDefault.report.whatChanged, "stock", "outer_wall_acceleration")).toMatchObject({ before: higher, alternative: "keep" });

    const chosen = await run(demo({ outer_wall_acceleration: higher }), { aboveStock: { keep: ["outer_wall_acceleration"] } });
    expect(first(chosen.settings.outer_wall_acceleration)).toBe(Number(higher));
    expect(item(chosen.report.whatChanged, "yours", "outer_wall_acceleration")).toMatchObject({ note: "you chose to keep the creator's value", alternative: "stock" });
  });

  it("explains a creator's 0 acceleration as \"same as normal printing\", with nothing to choose", async () => {
    const { report } = await run(demo({ inner_wall_acceleration: "0" }));
    const line = item(report.whatChanged, "stock", "inner_wall_acceleration");
    expect(line?.note).toContain("means the same as normal printing");
    expect(line?.alternative).toBeUndefined();
  });

  it("never lets a choice exceed the U1's machine limits", async () => {
    const { settings, report } = await run(demo({ outer_wall_acceleration: "50000" }), { aboveStock: { keep: ["outer_wall_acceleration"] } });
    expect(first(settings.outer_wall_acceleration)).toBe(20000);
    expect(item(report.whatChanged, "capped", "outer_wall_acceleration")).toMatchObject({ before: "50000", after: "20000", alternative: "stock" });
  });

  it("caps max volumetric speed by default, and keeps the creator's value when chosen", async () => {
    const files = unzipSync(readFixture("synthetic-demo.3mf"));
    const s = JSON.parse(strFromU8(files[SETTINGS_PATH]));
    s.filament_max_volumetric_speed = s.filament_colour.map(() => "30");
    files[SETTINGS_PATH] = strToU8(JSON.stringify(s));
    const bytes = zipSync(files);
    const byDefault = await run(bytes);
    // Standard values are capped at 22; high-flow values stay at the creator's 30, under the 40 limit.
    expect(byDefault.settings.filament_max_volumetric_speed).toEqual(["22", "30", "22", "30", "22", "30"]);
    expect(item(byDefault.report.whatChanged, "capped", "filament_max_volumetric_speed")).toMatchObject({ alternative: "keep" });
    const kept = await run(bytes, { aboveStock: { keep: ["filament_max_volumetric_speed"] } });
    expect((kept.settings.filament_max_volumetric_speed as string[]).filter((_, i) => i % 2 === 0).every((v) => v === "30")).toBe(true);
    expect(item(kept.report.whatChanged, "yours", "filament_max_volumetric_speed")).toMatchObject({ alternative: "stock" });
  });

  it("records the choice in the stamp, and changes nothing without one", async () => {
    const { output } = await run(demo({}), { aboveStock: { keep: ["travel_speed"], stock: ["outer_wall_speed"] } });
    expect(decodeStamp(unzipSync(output)[STAMP_PATH])?.options).toMatchObject({ aboveStock: { keep: ["travel_speed"], stock: ["outer_wall_speed"] } });
    const plain = await run(demo({}), { stamp: false });
    const empty = await run(demo({}), { stamp: false, aboveStock: {} });
    expect(empty.output).toEqual(plain.output);
  });

  it("rejects a choice that isn't one", () => {
    for (const bad of [
      { keep: ["nozzle_temperature"] },
      { keep: ["exclude_object"] },
      { keep: ["outer_wall_speed"], stock: ["outer_wall_speed"] },
      { stock: ["filament_max_volumetric_speed"] },
      { keep: "outer_wall_speed" },
      { keep: Array.from({ length: 101 }, () => "outer_wall_speed") },
      [],
    ]) {
      expect(() => resolveAboveStockChoice(bad as never), JSON.stringify(bad).slice(0, 60)).toThrow(TypeError);
    }
  });

  it("puts preset values back to stock by leaving them out", () => {
    const preset = { name: "x", changes: { wall_loops: "4", sparse_infill_speed: "480" } };
    expect(withoutChanges(preset, ["sparse_infill_speed"])).toEqual({ name: "x", changes: { wall_loops: "4" } });
    expect(preset.changes).toHaveProperty("sparse_infill_speed");
  });
});
