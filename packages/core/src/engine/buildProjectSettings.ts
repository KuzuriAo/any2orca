// SPDX-License-Identifier: MIT
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { coerceValue } from "./coerceValue.js";
import { collapseNozzleVariants } from "./collapseNozzleVariants.js";
import { detectVariantIndex } from "./detectVariantIndex.js";
import { jsonEqual } from "./internal/jsonEqual.js";
import { resolveMinIfLower } from "./resolveMinIfLower.js";
import { stripBambuOnlyNozzleVariantKeys } from "./stripBambuOnlyNozzleVariantKeys.js";
import type { JsonRecord } from "./types.js";

export type ChangedTriple = [key: string, oldValue: unknown, newValue: unknown];

/** Bambu/Orca both store this as an array whose first element is a `;`-joined key list (remaining elements are unused padding). */
function parseDifferentSettingsToSystem(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length === 0) return new Set();
  return new Set(
    String(value[0])
      .split(";")
      .filter((k) => k.length > 0),
  );
}

// Older option names Snapmaker Orca still reads and translates itself (Bambu Studio's infill and ironing "zig-zag").
const LEGACY_CHOICES: ReadonlySet<string> = new Set(["zig-zag"]);

/** For a setting with a fixed set of choices, the first value that isn't one Snapmaker Orca offers, if any. */
function unknownChoice(key: string, value: unknown): string | null {
  const info = Object.hasOwn(SETTINGS_CATALOG, key) ? SETTINGS_CATALOG[key] : undefined;
  if (!info || info.type !== "coEnum" || !info.choices) return null;
  for (const entry of Array.isArray(value) ? value : [value]) {
    const text = String(entry);
    if (!info.choices.includes(text) && !LEGACY_CHOICES.has(text)) return text;
  }
  return null;
}

export interface BuildProjectSettingsResult {
  newSettings: JsonRecord;
  changedKeys: ChangedTriple[];
  filamentChanged: ChangedTriple[];
  transferableCount: number;
  /** Keys the creator changed whose values couldn't be fitted to the U1's layout, so the U1's stock value was kept (each with a warning). */
  notCarried: string[];
}

/**
 * The core project_settings.config merge: transfer whatever's eligible
 * from the Bambu source onto the Orca baseline template, overlay the
 * per-project filament arrays, and rebuild `different_settings_to_system`
 * so Orca doesn't silently fall back to the system preset for anything we
 * changed. Settings that must keep the U1 profile's value are simply never
 * transferred (they're in `blocklist`), so the baseline's stock value stays.
 *
 * @param filamentKeyArrays from `extractFilamentSlots`'s result (`null` when extraction failed -- treated as no overlay).
 * @param blocklist keys that must never transfer from Bambu: physical-hardware/machine-identity keys (`BLOCKLIST`) and keys that keep the U1 profile's own value (`U1_VALUE_KEYS`).
 * @param minComparisonKeys travel_speed/`*_acceleration`-style motion-safety keys: honored only when Bambu's value is LOWER than the U1 profile's own default, unconditionally (not gated on customization) -- see that constant's own doc comment.
 * @param alwaysTransferKeys keys that always track Bambu's real value, unconditionally (not gated on customization, no min-comparison either) -- e.g. print_sequence (layout-coupled) and the infill-density family (Bambu's customization flag doesn't reliably cover them) -- see that constant's own doc comment.
 */
export function buildProjectSettings(
  baselineSettings: JsonRecord,
  bambuSettings: JsonRecord,
  filamentKeyArrays: Record<string, unknown[]> | null,
  blocklist: ReadonlySet<string>,
  minComparisonKeys: ReadonlySet<string>,
  alwaysTransferKeys: ReadonlySet<string>,
  warnings: string[],
): BuildProjectSettingsResult {
  // Bambu's OWN customized-keys signal (from the source file, before any
  // of our merging) -- the creator explicitly touched these in Bambu
  // Studio, as opposed to Bambu's file just incidentally reporting its
  // printer/preset's own unmodified default for a key.
  const bambuCustomizedKeys = parseDifferentSettingsToSystem(bambuSettings.different_settings_to_system);

  // A two-nozzle source's per-nozzle values, reduced to the one-value-per-variant layout every step below expects.
  const { settings: source, conflicts, variantIndex: sharedNozzleVariant } = collapseNozzleVariants(bambuSettings);
  const variantIndex = detectVariantIndex(bambuSettings) ?? sharedNozzleVariant;
  const sharedKeys = Object.keys(bambuSettings).filter((k) => Object.hasOwn(baselineSettings, k));

  // Ordinary transfer: only keys the creator explicitly customized in
  // Bambu Studio. Everything else keeps the selected U1 tier's own tuned
  // value (see the customization gate's comment in policy.ts).
  const transferable = sharedKeys
    .filter((k) => !blocklist.has(k) && !minComparisonKeys.has(k) && !alwaysTransferKeys.has(k))
    // Filament arrays and flush volumes are overlaid as a whole below, sized to the project's filaments.
    .filter((k) => !(filamentKeyArrays && Object.hasOwn(filamentKeyArrays, k)) && !k.startsWith("flush_volumes_"))
    .filter((k) => bambuCustomizedKeys.has(k))
    .sort();

  const newSettings: JsonRecord = { ...baselineSettings };
  const changedKeys: ChangedTriple[] = [];
  const notCarried: string[] = [];
  for (const key of transferable) {
    const [newVal, changed, didNotFit] = coerceValue(baselineSettings[key], source[key], key, warnings, variantIndex);
    const unknown = didNotFit ? null : unknownChoice(key, newVal);
    if (unknown !== null) {
      notCarried.push(key);
      warnings.push(`  WARN: the creator's ${key} ("${unknown.slice(0, 40)}") isn't one of Snapmaker Orca's choices, so Snapmaker's stock value is used.`);
      continue;
    }
    if (didNotFit) {
      notCarried.push(key);
      const shown = String(source[key]);
      warnings.push(`  WARN: the creator changed ${key}, but its values${shown ? ` (${shown})` : ""} don't fit the U1's layout, so Snapmaker's stock value is used.`);
    }
    if (changed) {
      changedKeys.push([key, baselineSettings[key], newVal]);
      newSettings[key] = newVal;
    }
  }

  // Motion-safety keys: unconditional (not gated on the customization
  // flag above) -- Bambu's value is honored only when it's lower/more
  // conservative than the U1 tier's own default. See minComparisonKeys.
  const minCompareApplicable = sharedKeys.filter((k) => minComparisonKeys.has(k) && !blocklist.has(k)).sort();
  for (const key of minCompareApplicable) {
    const [newVal, changed] = resolveMinIfLower(baselineSettings[key], source[key], variantIndex);
    if (changed) {
      changedKeys.push([key, baselineSettings[key], newVal]);
      newSettings[key] = newVal;
    }
  }

  // Layout-coupled keys: unconditional (not gated on the customization
  // flag) -- always track Bambu's real value. See alwaysTransferKeys.
  const alwaysTransferApplicable = sharedKeys.filter((k) => alwaysTransferKeys.has(k) && !blocklist.has(k)).sort();
  for (const key of alwaysTransferApplicable) {
    const [newVal, changed] = coerceValue(baselineSettings[key], source[key], key, warnings, variantIndex);
    const unknown = unknownChoice(key, newVal);
    if (unknown !== null) {
      notCarried.push(key);
      warnings.push(`  WARN: the source file's ${key} ("${unknown.slice(0, 40)}") isn't one of Snapmaker Orca's choices, so Snapmaker's stock value is used.`);
      continue;
    }
    if (changed) {
      changedKeys.push([key, baselineSettings[key], newVal]);
      newSettings[key] = newVal;
    }
  }

  // No setting marked as changed, and nothing carried over anyway: an Anycubic Slicer Next export after a
  // printer profile switch looks like this, because the switch resets every setting without marking it,
  // so the creator's tuning is gone before the file is saved. Nothing can recover it; the note says so.
  if (bambuCustomizedKeys.size === 0 && changedKeys.length === 0) {
    warnings.push(
      "  WARN: No changed print settings were marked in this file. If the printer profile was switched in the slicer without re-applying the settings afterward, they may not have carried over.",
    );
  }

  // Only for keys that were actually carried over: a disagreement in a setting the U1 doesn't take from the source isn't news.
  const carried = new Set([...transferable, ...minCompareApplicable, ...alwaysTransferApplicable]);
  for (const [key, values] of conflicts) {
    if (!carried.has(key) || notCarried.includes(key)) continue;
    warnings.push(`  WARN: ${key} differs between the source printer's two nozzles (${values.join(", ")}); the lower value is used for every toolhead.`);
  }

  // Overlay filament identity/color/property arrays (full replacement).
  const filamentChanged: ChangedTriple[] = [];
  for (const [key, arr] of Object.entries(filamentKeyArrays ?? {})) {
    const old = newSettings[key];
    if (!jsonEqual(old, arr)) {
      filamentChanged.push([key, old, arr]);
    }
    newSettings[key] = arr;
  }

  // Unconditional safety net, not gated on anything above -- see this
  // function's own doc comment for why a Bambu-only nozzle-variant field
  // must never survive into U1 output regardless of how it got here.
  stripBambuOnlyNozzleVariantKeys(newSettings, baselineSettings);

  // Flag EVERY key we actually write in different_settings_to_system,
  // unconditionally -- not just the ones that changed this merge. Orca
  // doesn't just read project_settings.config at face value -- for any
  // key not listed here, it falls back to whatever LOCAL system preset
  // matches print_settings_id, silently ignoring the value we wrote even
  // though it's correct on disk. Every key is listed: a value equal to the
  // system preset's is harmless to list, while a differing one left
  // unlisted would be silently reverted when the file is opened.
  //
  // A stock baseline has no list of its own (Snapmaker Orca writes none
  // for an unmodified project), so one is created with Orca's layout: the
  // print entry, one entry per filament, then the printer entry.
  const allKeys = Object.keys(newSettings)
    .filter((k) => k !== "different_settings_to_system")
    .sort();
  const diffs = newSettings.different_settings_to_system;
  const filamentCount = Array.isArray(newSettings.filament_colour) ? newSettings.filament_colour.length : 1;
  newSettings.different_settings_to_system = Array.isArray(diffs)
    ? [allKeys.join(";"), ...diffs.slice(1)]
    : [allKeys.join(";"), ...Array.from({ length: filamentCount }, () => ""), ""];

  return {
    newSettings,
    changedKeys,
    filamentChanged,
    transferableCount: transferable.length + minCompareApplicable.length + alwaysTransferApplicable.length,
    notCarried,
  };
}
