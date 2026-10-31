// SPDX-License-Identifier: MIT
// Property and fuzz tests for presets (design: "How it will be proven right").
// Randomness comes from a seeded generator, so every run is the same and a
// failure names the seed that reproduces it. PRESET_PROPERTY_RUNS raises the
// number of cases for a longer local run.
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { Any2orcaError } from "../errors.js";
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { bundledProfileSource } from "../node.js";
import { loadCatalog, type ProfileCatalog } from "../profiles.js";
import { convert } from "../project.js";
import { STAMP_PATH } from "../stamp.js";
import { extractPreset } from "./extractPreset.js";
import { parsePresetFile, resolvePreset, serializePresets, type Preset, type PresetValue } from "./preset.js";
import { PRESET_KEYS } from "./presetKeys.js";

const RUNS = Number(process.env.PRESET_PROPERTY_RUNS ?? 12);
const BASE = "snapmaker-u1-0.4-standard";
const CREATED = "2026-10-26";
const SETTINGS_PATH = "Metadata/project_settings.config";
const SOURCES = ["synthetic-demo.3mf", "synthetic-creality.3mf", "synthetic-anycubic.3mf", "synthetic-2plate.3mf"].map(
  (name) => [name, new Uint8Array(readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url)))] as const,
);

/** mulberry32: a small, well-known seeded generator. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rnd: () => number, items: readonly T[]): T => items[Math.floor(rnd() * items.length)];

let catalog: ProfileCatalog;
let stock: Record<string, unknown>;
let catalogInfo: Preset["catalog"];

beforeAll(async () => {
  catalog = await loadCatalog(bundledProfileSource());
  stock = (await catalog.load(BASE)).convertProfile.profile.baselineProjectSettings as Record<string, unknown>;
  catalogInfo = { version: catalog.index.dataVersion, tracks: `${catalog.index.slicer.name} ${catalog.index.slicer.version}` };
});

const SCALAR_TYPES = new Set(["coBool", "coInt", "coFloat", "coPercent", "coEnum", "coFloatOrPercent"]);
const firstOf = (value: unknown): string | undefined => (Array.isArray(value) ? (typeof value[0] === "string" ? value[0] : undefined) : typeof value === "string" ? value : undefined);

/** A plausible value for one setting: a choice, a flipped switch, or a number near stock within the setting's limits. */
function valueFor(key: string, rnd: () => number): string | undefined {
  const info = SETTINGS_CATALOG[key];
  const current = firstOf(stock[key]);
  if (!info || !SCALAR_TYPES.has(info.type ?? "") || current === undefined) return undefined;
  if (info.type === "coBool") return current === "1" ? "0" : "1";
  if (info.type === "coEnum") return info.choices ? pick(rnd, info.choices) : undefined;
  const percent = current.endsWith("%");
  const base = Number.parseFloat(current);
  if (!Number.isFinite(base)) return undefined;
  let next = base === 0 ? Math.round(rnd() * 10) : base * (0.5 + rnd());
  if (info.min !== null) next = Math.max(info.min, next);
  if (info.max !== null) next = Math.min(info.max, next);
  const text = info.type === "coInt" ? String(Math.round(next)) : String(Math.round(next * 100) / 100);
  return percent || info.type === "coPercent" ? `${text}%` : text;
}

/** A random preset on BASE that the library accepts: keys it refuses are dropped. */
async function randomPreset(seed: number): Promise<Preset> {
  const rnd = random(seed);
  const changes: Record<string, PresetValue> = {};
  const want = 1 + Math.floor(rnd() * 12);
  for (let tries = 0; Object.keys(changes).length < want && tries < 200; tries++) {
    const key = pick(rnd, PRESET_KEYS);
    const value = valueFor(key, rnd);
    if (value === undefined || value === firstOf(stock[key])) continue;
    const candidate = { ...changes, [key]: value };
    try {
      await resolvePreset({ name: `p${seed}`, base: BASE, baseInferred: false, catalog: catalogInfo, created: CREATED, changes: candidate }, catalog);
      changes[key] = value;
    } catch (err) {
      if (!(err instanceof Any2orcaError)) throw err;
    }
  }
  return { name: `p${seed}`, base: BASE, baseInferred: false, catalog: catalogInfo, created: CREATED, changes };
}

const settingsOf = (bytes: Uint8Array): Record<string, unknown> => JSON.parse(strFromU8(unzipSync(bytes)[SETTINGS_PATH]));
/** Every zip entry except the settings and the version note (which records the options on purpose). */
function otherEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  const entries = unzipSync(bytes);
  delete entries[SETTINGS_PATH];
  delete entries[STAMP_PATH];
  return entries;
}
const seeds = Array.from({ length: RUNS }, (_, i) => 1000 + i);
/** Each case converts a file or two, so the time allowed grows with the number of cases. */
const TIMEOUT = 10_000 + RUNS * 500;

describe("preset properties", { timeout: TIMEOUT }, () => {
  it("the generator makes real presets: several settings each, of every scalar type", async () => {
    const presets = await Promise.all(seeds.map(randomPreset));
    const keys = presets.flatMap((p) => Object.keys(p.changes));
    expect(keys.length / presets.length).toBeGreaterThanOrEqual(3);
    const types = new Set(keys.map((key) => SETTINGS_CATALOG[key].type));
    for (const type of ["coBool", "coInt", "coFloat", "coEnum"]) expect(types.has(type), type).toBe(true);
  });

  it("conversion is deterministic: the same input and options give the same bytes", async () => {
    for (const [name, source] of SOURCES) {
      const a = await convert(source, { profiles: catalog });
      const b = await convert(source, { profiles: catalog });
      expect(Buffer.compare(a.output, b.output), name).toBe(0);
    }
  });

  it("an empty preset converts exactly like choosing its base profile", async () => {
    const empty: Preset = { name: "empty", base: BASE, baseInferred: false, catalog: catalogInfo, created: CREATED, changes: {} };
    for (const [name, source] of SOURCES) {
      const withPreset = await convert(source, { profiles: catalog, preset: empty });
      const withProfile = await convert(source, { profiles: catalog, profileId: BASE });
      expect(settingsOf(withPreset.output), name).toEqual(settingsOf(withProfile.output));
      expect(otherEntries(withPreset.output), name).toEqual(otherEntries(withProfile.output));
    }
  });

  it("a preset only changes its own settings, and never the model, layout or anything else in the file", async () => {
    for (const seed of seeds) {
      const preset = await randomPreset(seed);
      const [name, source] = SOURCES[seed % SOURCES.length];
      const withPreset = await convert(source, { profiles: catalog, preset });
      const withProfile = await convert(source, { profiles: catalog, profileId: BASE });
      const a = settingsOf(withPreset.output);
      const b = settingsOf(withProfile.output);
      // A color penetration deeper than its shell is lowered to fit, as Snapmaker Orca does, so a preset's shell layers can change it.
      const fitted = (["top", "bottom"] as const).filter((side) => `${side}_shell_layers` in preset.changes).map((side) => `${side}_color_penetration_layers`);
      const allowed = new Set([...Object.keys(preset.changes), ...fitted, "different_settings_to_system"]);
      const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
      expect(changed.filter((key) => !allowed.has(key)), `seed ${seed} on ${name}`).toEqual([]);
      expect(otherEntries(withPreset.output), `seed ${seed} on ${name}`).toEqual(otherEntries(withProfile.output));
    }
  });

  it("the order of a preset's settings doesn't matter", async () => {
    for (const seed of seeds) {
      const preset = await randomPreset(seed);
      const reversed: Preset = { ...preset, changes: Object.fromEntries(Object.entries(preset.changes).reverse()) };
      const [name, source] = SOURCES[seed % SOURCES.length];
      const a = await convert(source, { profiles: catalog, preset });
      const b = await convert(source, { profiles: catalog, preset: reversed });
      expect(Buffer.compare(a.output, b.output), `seed ${seed} on ${name}`).toBe(0);
    }
  });

  it("converting again with the same preset changes none of its settings", async () => {
    for (const seed of seeds) {
      const preset = await randomPreset(seed);
      const [name, source] = SOURCES[seed % SOURCES.length];
      const once = await convert(source, { profiles: catalog, preset });
      const twice = await convert(once.output, { profiles: catalog, preset });
      const a = settingsOf(once.output);
      const b = settingsOf(twice.output);
      for (const key of Object.keys(preset.changes)) expect(b[key], `seed ${seed} on ${name}: ${key}`).toEqual(a[key]);
    }
  });

  it("a preset made from a converted file gives back what the preset put there", async () => {
    for (const seed of seeds) {
      const preset = await randomPreset(seed);
      const [name, source] = SOURCES[seed % SOURCES.length];
      const { output } = await convert(source, { profiles: catalog, preset });
      const written = settingsOf(output);
      const extracted = await extractPreset(output, { profiles: catalog });
      expect(extracted.preset.base, `seed ${seed} on ${name}`).toBe(BASE);
      for (const key of Object.keys(preset.changes)) {
        if (firstOf(written[key]) === firstOf(stock[key])) continue;
        expect(firstOf(extracted.preset.changes[key]), `seed ${seed} on ${name}: ${key}`).toBe(firstOf(written[key]));
      }
    }
  });
});

describe("preset fuzzing", { timeout: TIMEOUT }, () => {
  /** Only an Any2orcaError is an acceptable failure: anything else is a crash on bad input. */
  const expectCleanFailure = (fn: () => unknown, label: string) => {
    try {
      fn();
    } catch (err) {
      expect(err instanceof Any2orcaError, `${label}: ${String(err)}`).toBe(true);
    }
  };

  it("parsePresetFile accepts a valid file and rejects mangled ones cleanly", async () => {
    const good = serializePresets([await randomPreset(7)]);
    expect(parsePresetFile(good).presets).toHaveLength(1);
    const rnd = random(99);
    const hostile = [
      "",
      "null",
      "[]",
      "{}",
      good.slice(0, Math.floor(good.length / 2)),
      good.replace('"changes": {', '"changes": {"__proto__": {"x": "1"}, '),
      good.replace('"changes": {', '"changes": {"constructor": "1", '),
      good.replace('"version": 1', '"version": 2'),
      good.replace('"version": 1', '"version": "1"'),
      `${"[".repeat(5000)}${"]".repeat(5000)}`,
      JSON.stringify({ format: "any2orca-presets", version: 1, presets: Array.from({ length: 10_000 }, () => ({})) }),
      good.replace(/"name": "[^"]*"/, `"name": "${"x".repeat(100_000)}"`),
      good.replace(/"name": "[^"]*"/, '"name": "\\u0000\\u001b[2J"'),
    ];
    for (let i = 0; i < RUNS * 10; i++) {
      const chars = good.split("");
      for (let n = 0; n < 1 + Math.floor(rnd() * 5); n++) chars[Math.floor(rnd() * chars.length)] = pick(rnd, ['"', "{", "}", "[", "]", ",", ":", "0", "-", "e", " ", "\\", "x"]);
      hostile.push(chars.join(""));
    }
    for (const [i, text] of hostile.entries()) expectCleanFailure(() => parsePresetFile(text), `case ${i}`);
  });

  it("parsePresetFile refuses control characters in any text it would show", async () => {
    const good = serializePresets([await randomPreset(8)]);
    for (const [field, pattern] of [["version", /"version": "[^"]*"/], ["tracks", /"tracks": "[^"]*"/]] as const) {
      const text = good.replace(pattern, `"${field}": "x\\u001b]52;c;ZXZpbA==\\u0007"`);
      expect(() => parsePresetFile(text), field).toThrow(Any2orcaError);
    }
  });

  it("parsePresetFile never lets a parsed preset carry a prototype key", () => {
    const text = '{"format":"any2orca-presets","version":1,"presets":[{"name":"x","base":"b","baseInferred":false,"catalog":{"version":"0","tracks":"t"},"changes":{"__proto__":{"polluted":"yes"}}}]}';
    expectCleanFailure(() => parsePresetFile(text), "prototype key");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("extractPreset and resolvePreset fail cleanly on damaged files and nonsense presets", async () => {
    const { output } = await convert(SOURCES[0][1], { profiles: catalog });
    const rnd = random(1234);
    for (let i = 0; i < RUNS * 3; i++) {
      const damaged = new Uint8Array(output);
      for (let n = 0; n < 1 + Math.floor(rnd() * 20); n++) damaged[Math.floor(rnd() * damaged.length)] = Math.floor(rnd() * 256);
      try {
        await extractPreset(damaged, { profiles: catalog });
      } catch (err) {
        expect(err instanceof Any2orcaError, `damaged file ${i}: ${String(err)}`).toBe(true);
      }
    }
    const nonsense: unknown[] = [null, 42, "preset", [], {}, { changes: null }, { name: "x", base: "no-such-profile", baseInferred: false, catalog: catalogInfo, changes: {} }, { name: "x", base: BASE, baseInferred: false, catalog: catalogInfo, changes: { wall_loops: { nested: true } } }, { name: "x", base: BASE, baseInferred: false, catalog: catalogInfo, changes: { not_a_setting: "1" } }];
    for (const [i, value] of nonsense.entries()) {
      expectCleanFailure(() => serializePresets([value as Preset]), `serialize nonsense ${i}`);
      try {
        await resolvePreset(value as Preset, catalog);
      } catch (err) {
        expect(err instanceof Any2orcaError, `nonsense ${i}: ${String(err)}`).toBe(true);
      }
    }
  });
});
