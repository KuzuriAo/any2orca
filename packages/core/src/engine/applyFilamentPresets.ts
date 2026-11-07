// SPDX-License-Identifier: MIT
/**
 * The Snapmaker and Generic filament options: a slot renamed to a preset Snapmaker Orca ships takes that
 * preset's own settings, standard and high-flow values and its G-code included, so the file, Snapmaker Orca's
 * app (which resets a filament whose name matches a shipped preset) and its command line (which uses the file's
 * values) all agree. And every filament's entry in `different_settings_to_system` lists every filament setting,
 * so Snapmaker Orca keeps what the file says when it opens it, the creator's values under Original included.
 */
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import type { PrinterFilamentPresets } from "../profiles.js";
import { FILAMENT_FLOW_VARIANT_KEYS } from "./applyFilamentFlowVariants.js";
import type { JsonRecord } from "./types.js";

const VARIANT_KEYS: ReadonlySet<string> = new Set(FILAMENT_FLOW_VARIANT_KEYS);

/** A slot that takes a preset's settings: its 0-based index, the preset, and the creator's values it replaces. */
export interface AppliedFilamentPreset {
  slot: number;
  preset: string;
  changed: Array<{ key: string; before: string; after: string }>;
}

/** One preset's settings: the values the printer's presets share, with its own over them. Undefined when there are none. */
export function presetSettingsFor(presets: PrinterFilamentPresets | undefined, name: string): Record<string, string[]> | undefined {
  if (!presets || !Object.hasOwn(presets.presets, name)) return undefined;
  return { ...presets.shared, ...presets.presets[name] };
}

const first = (value: unknown): string | undefined => (Array.isArray(value) ? (value[0] === undefined ? undefined : String(value[0])) : value === undefined ? undefined : String(value));

/** What a slot's preset replaces: each setting whose standard value differs from the creator's. */
export function presetChanges(values: Record<string, string[]>, creator: (key: string) => unknown): AppliedFilamentPreset["changed"] {
  const out: AppliedFilamentPreset["changed"] = [];
  for (const key of Object.keys(values).sort()) {
    const before = first(creator(key));
    const after = values[key][0];
    if (before !== undefined && after !== undefined && before !== after) out.push({ key, before, after });
  }
  return out;
}

/**
 * Writes each applied preset's settings into its slot: the project's per-filament lists (both values of a
 * per-variant setting where the nozzle has a high-flow option) and the slot's embedded preset file. Runs after
 * every other filament step, so nothing later overwrites it.
 */
export function writeFilamentPresets(
  settings: JsonRecord,
  files: Record<string, JsonRecord>,
  applied: readonly AppliedFilamentPreset[],
  presets: PrinterFilamentPresets | undefined,
  slotCount: number,
): void {
  for (const { slot, preset } of applied) {
    const values = presetSettingsFor(presets, preset);
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      const list = settings[key];
      if (!Array.isArray(list)) continue;
      const next = [...list];
      if (VARIANT_KEYS.has(key) && next.length === slotCount * 2) {
        next[slot * 2] = value[0];
        next[slot * 2 + 1] = value[1] ?? value[0];
      } else if (next.length === slotCount) {
        next[slot] = value[0];
      } else continue;
      settings[key] = next;
    }
    for (const cfg of Object.values(files)) {
      if (cfg.name !== preset) continue;
      for (const [key, value] of Object.entries(values)) {
        const own = cfg[key];
        // The embedded preset keeps its layout: one value where it holds one, the preset's own list otherwise.
        cfg[key] = Array.isArray(own) && own.length === 1 ? [value[0]] : [...value];
      }
    }
  }
}

/**
 * Every filament's entry in `different_settings_to_system` lists every filament setting the project holds.
 * Snapmaker Orca resets a filament whose name matches one of its presets to that preset's values for every
 * setting its entry doesn't list (PresetBundle.cpp adds a few bookkeeping keys to each entry, so the reset
 * always runs); listing them all keeps the file's values, the creator's or the chosen preset's.
 */
export function listFilamentSettings(settings: JsonRecord, filamentCount: number): void {
  if (filamentCount < 1) return;
  const keys = Object.keys(settings)
    .filter((k) => Object.hasOwn(SETTINGS_CATALOG, k) && SETTINGS_CATALOG[k].group === "filament")
    .sort()
    .join(";");
  const current = Array.isArray(settings.different_settings_to_system) ? settings.different_settings_to_system : [];
  const print = typeof current[0] === "string" ? current[0] : "";
  const printer = current.length === filamentCount + 2 && typeof current[filamentCount + 1] === "string" ? current[filamentCount + 1] : "";
  settings.different_settings_to_system = [print, ...Array.from({ length: filamentCount }, () => keys), printer];
}
