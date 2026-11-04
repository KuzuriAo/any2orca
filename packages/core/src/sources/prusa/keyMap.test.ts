// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { SETTINGS_CATALOG } from "../../diff/settingsCatalog.js";
import { parsePrusaIni } from "./ini.js";
import { PRUSA_KEY_MAP, type PrusaKeyRule } from "./keyMap.js";

/**
 * Project state Snapmaker Orca keeps in a project but not in a preset, so the settings catalog (built from the
 * presets' definitions) doesn't list it: the preset names, the wipe tower's place, the purge matrix, the load times.
 */
const PROJECT_STATE_KEYS = new Set([
  "print_settings_id",
  "printer_settings_id",
  "filament_settings_id",
  "wipe_tower_x",
  "wipe_tower_y",
  "flush_volumes_matrix",
  "filament_load_time",
  "filament_unload_time",
]);

const fixtureKeys = () => {
  const bytes = new Uint8Array(readFileSync(new URL("../../test-fixtures/prusaslicer/prusaslicer-2.9.6.3mf", import.meta.url)));
  return [...parsePrusaIni(new TextDecoder().decode(unzipSync(bytes)["Metadata/Slic3r_PE.config"])).settings.keys()];
};

function targets(key: string, rule: PrusaKeyRule): string[] {
  switch (rule.kind) {
    case "same":
      return [key];
    case "rename":
    case "transform":
      return typeof rule.to === "string" ? [rule.to] : [...rule.to];
    case "choices":
      return [rule.to];
    default:
      return [];
  }
}

describe("the PrusaSlicer key map", () => {
  it("writes only keys Snapmaker Orca has, so a rename upstream fails here rather than in the output", () => {
    const missing: string[] = [];
    for (const [key, rule] of Object.entries(PRUSA_KEY_MAP)) {
      for (const target of targets(key, rule)) {
        if (!Object.hasOwn(SETTINGS_CATALOG, target) && !PROJECT_STATE_KEYS.has(target)) missing.push(`${key} -> ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("maps each fixed choice onto one Snapmaker Orca offers", () => {
    const bad: string[] = [];
    for (const [key, rule] of Object.entries(PRUSA_KEY_MAP)) {
      if (rule.kind !== "choices") continue;
      const info = SETTINGS_CATALOG[rule.to];
      // A catalog entry without choices (brim_type, bottom_surface_pattern) can't be checked here; the
      // settings diff's own tests cover what Snapmaker Orca accepts for those.
      if (!info?.choices) continue;
      for (const [from, to] of Object.entries(rule.values)) {
        if (!info.choices.includes(to)) bad.push(`${key}: ${from} -> ${rule.to}=${to}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has a rule for every key the 2.9.6 fixture carries, so a new PrusaSlicer key is a decision, not a passthrough", () => {
    const unmapped = fixtureKeys().filter((key) => !Object.hasOwn(PRUSA_KEY_MAP, key));
    expect(unmapped).toEqual([]);
  });

  it("names every rule kind at least once and keeps the keys sorted within no group (a decision record, not an index)", () => {
    const kinds = new Set(Object.values(PRUSA_KEY_MAP).map((rule) => rule.kind));
    expect([...kinds].sort()).toEqual(["choices", "drop", "handled", "machine", "rename", "same", "transform"]);
    expect(Object.keys(PRUSA_KEY_MAP).length).toBeGreaterThan(380);
  });
});
