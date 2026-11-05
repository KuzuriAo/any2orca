// SPDX-License-Identifier: MIT
/**
 * Policy B for a PrusaSlicer project: carry only the print settings the
 * creator changed from the vendor's preset, as a Bambu Studio family project's
 * own list of changed settings does. The project's print preset is resolved
 * from the vendor bundle, every key the project has is compared with the
 * preset's value (in PrusaSlicer's own value forms), and the keys that differ,
 * mapped to Snapmaker Orca's, become the changed list the pipeline's gate
 * reads. Keys the preset doesn't have count as changed: transfer is the safe
 * side. Filament values are carried whole, as for every source.
 */
import { SETTINGS_CATALOG } from "../../diff/settingsCatalog.js";
import type { ProfileCatalog } from "../../profiles.js";
import type { ProjectSettings } from "../../schema.js";
import type { PrusaProjectInfo } from "../reader.js";
import type { PrusaBundle } from "./bundle.js";
import { lookupPrintPresetName, resolvePrintPreset } from "./bundle.js";

/** PrusaSlicer keys that identify or describe a preset, never a print setting a creator "changes". */
const NOT_COMPARED = new Set(["print_settings_id", "inherits", "compatible_printers", "compatible_printers_condition", "renamed_from", "alias", "notes"]);

const NUMBER = /^-?\d+(\.\d+)?%?$/;

/** One value in PrusaSlicer's INI, normalized for a comparison: numbers by value, lists entry by entry. */
function normalize(value: string): string {
  const trimmed = value.trim();
  if (NUMBER.test(trimmed)) {
    const percent = trimmed.endsWith("%");
    return `${Number.parseFloat(trimmed)}${percent ? "%" : ""}`;
  }
  if (trimmed.includes(",") || trimmed.includes(";")) {
    return trimmed
      .split(/[,;]/)
      .map((entry) => normalize(entry))
      .join(",");
  }
  return trimmed.replace(/^"(.*)"$/s, "$1").replace(/\r\n/g, "\n");
}

export interface PolicyBResult {
  /** The bundle's name for the project's print preset, once resolved. */
  presetName: string;
  /** PrusaSlicer keys whose project value differs from the preset's (or that the preset lacks). */
  changedKeys: string[];
  /** Keys compared: the project's print keys that had a rule and a preset value. */
  compared: number;
}

/**
 * The project's changed print keys against the vendor preset, or null when the
 * bundle doesn't have the preset.
 *
 * @param settings the project's settings, PrusaSlicer keys and values as the INI has them
 * @param printKeys the project keys that are print settings (the key map's print-group targets), to compare
 */
export function changedPrintKeys(bundle: PrusaBundle, recordedPresetName: string, settings: ReadonlyMap<string, string>, printKeys: ReadonlySet<string>): PolicyBResult | null {
  const presetName = lookupPrintPresetName(bundle, recordedPresetName);
  if (!presetName) return null;
  const preset = resolvePrintPreset(bundle, presetName);
  if (!preset) return null;
  const changedKeys: string[] = [];
  let compared = 0;
  for (const [key, value] of settings) {
    if (!printKeys.has(key) || NOT_COMPARED.has(key)) continue;
    // A key no preset in the chain sets has PrusaSlicer's built-in default in a project; that's not a change either.
    const presetValue = preset[key] ?? bundle.defaults[key];
    if (presetValue === undefined) {
      changedKeys.push(key);
      continue;
    }
    compared++;
    if (normalize(value) !== normalize(presetValue)) changedKeys.push(key);
  }
  return { presetName, changedKeys: changedKeys.sort(), compared };
}

/**
 * PrusaSlicer keys carried as the project has them, whatever its preset says (owner decision 2026-11-05): the Supports
 * menu on PrusaSlicer's sidebar and the filaments supports print from. Left to the comparison, a project that turns
 * supports on got Snapmaker's stock kind of support (tree) instead of the one PrusaSlicer showed (snug, say); an
 * Input Shaper preset's default, "for support enforcers only", became Snapmaker's stock "off", leaving painted
 * enforcers unused; and a soluble-support preset's support filament and zero contact distance became any filament with
 * a gap. The menu's choices (everywhere, build plate only, enforcers only) and the kind of support count only when
 * supports are on; the contact distances only with a support filament of its own.
 */
export function statedPrintKeys(settings: ReadonlyMap<string, string>): string[] {
  const keys = ["support_material", "support_material_extruder", "support_material_interface_extruder"];
  if (settings.get("support_material") === "1") keys.push("support_material_auto", "support_material_buildplate_only", "support_material_style");
  const ownFilament = ["support_material_extruder", "support_material_interface_extruder"].some((key) => Number.parseInt(settings.get(key) ?? "0", 10) > 0);
  if (ownFilament) keys.push("support_material_contact_distance", "support_material_bottom_contact_distance");
  return keys.filter((key) => settings.has(key));
}

type BundleEntry = ReturnType<ProfileCatalog["prusaBundles"]>[number];

const versionParts = (v: string): number[] => v.split(".").map(Number);
const compareVersions = (a: string, b: string): number => {
  const [x, y] = [versionParts(a), versionParts(b)];
  return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
};

/**
 * The bundles to try for a project, best first: per vendor, the newest whose
 * PrusaSlicer release is at or below the one that saved the project (the
 * presets as that release shipped them), then the newest of all as a fallback
 * for a project from a release older than any pinned. A project of unknown
 * version gets the newest.
 */
export function bundlesForVersion(bundles: readonly BundleEntry[], version: string | null): BundleEntry[] {
  const byVendor = new Map<string, BundleEntry[]>();
  for (const b of bundles) byVendor.set(b.vendor, [...(byVendor.get(b.vendor) ?? []), b]);
  const ordered: BundleEntry[] = [];
  for (const list of byVendor.values()) {
    const newestFirst = [...list].sort((a, b) => compareVersions(b.slicerVersion, a.slicerVersion));
    const matching = version ? newestFirst.find((b) => compareVersions(b.slicerVersion, version) <= 0) : undefined;
    if (matching) ordered.push(matching);
    if (newestFirst[0] && newestFirst[0] !== matching) ordered.push(newestFirst[0]);
  }
  return ordered;
}

export interface PolicyBApplied {
  /** The project settings with the changed list rewritten to the keys the creator changed. */
  projectSettings: ProjectSettings;
  notes: string[];
}

/**
 * Applies policy B to a PrusaSlicer project's converted settings: finds the
 * project's print preset in the catalog's vendor bundles, and rewrites the
 * changed list (`different_settings_to_system`, print entry) to the Snapmaker
 * Orca keys the creator's changed settings map to. Returns null, with the
 * reason as a note, when no bundle has the preset: the list then stays as
 * the reader wrote it (every mapped print setting), which is policy A.
 */
export async function applyPolicyB(prusa: PrusaProjectInfo, catalog: ProfileCatalog, projectSettings: ProjectSettings): Promise<PolicyBApplied | null> {
  const bundles = catalog.prusaBundles();
  if (bundles.length === 0) return null;
  // The PrusaSlicer keys that are print settings: those whose Snapmaker Orca keys are in the print group.
  const printKeys = new Set([...prusa.targets].filter(([, targets]) => targets.some((t) => SETTINGS_CATALOG[t]?.group === "print")).map(([key]) => key));
  for (const entry of bundlesForVersion(bundles, prusa.version)) {
    // A bundle that can't be read (a site that copied an older data folder, say) is no reason to fail the conversion:
    // the next bundle is tried, and the fallback carries every mapped print setting, with the note saying so.
    let bundle: PrusaBundle | null;
    try {
      bundle = await catalog.prusaBundle(entry.vendor, entry.slicerVersion);
    } catch {
      bundle = null;
    }
    if (!bundle) continue;
    const result = changedPrintKeys(bundle, prusa.presets.print, prusa.settings, printKeys);
    if (!result) continue;
    const changedTargets = new Set<string>();
    for (const key of [...result.changedKeys, ...statedPrintKeys(prusa.settings)]) {
      for (const target of prusa.targets.get(key) ?? []) if (SETTINGS_CATALOG[target]?.group === "print") changedTargets.add(target);
    }
    const list = projectSettings.different_settings_to_system;
    const rest = Array.isArray(list) ? list.slice(1) : [];
    return {
      projectSettings: { ...projectSettings, different_settings_to_system: [[...changedTargets].sort().join(";"), ...rest] },
      notes: [
        `  note: print settings compared with PrusaSlicer's "${result.presetName}" (${entry.name}'s presets of PrusaSlicer ${entry.slicerVersion}): ${result.changedKeys.length} of ${result.compared + result.changedKeys.length} differ from the preset, and only those are carried, with the Supports menu and the support filaments as the project has them; Snapmaker's stock stands for the rest.`,
      ],
    };
  }
  return null;
}

/** The note for a project whose print preset no bundle has, so every mapped print setting is carried. */
export function policyBFallbackNote(prusa: PrusaProjectInfo, catalog: ProfileCatalog): string {
  const bundles = catalog.prusaBundles();
  if (bundles.length === 0) return "  note: this profile catalog has no PrusaSlicer vendor presets, so every mapped print setting is carried as the creator's.";
  const vendors = [...new Set(bundles.map((b) => b.name))].join(" or ");
  return `  note: print preset "${prusa.presets.print.slice(0, 80)}" isn't in ${vendors}'s presets (a user preset, or one this catalog doesn't know), so every mapped print setting is carried as the creator's.`;
}
