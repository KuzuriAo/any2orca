// SPDX-License-Identifier: MIT
import { applyPresetChanges } from "../engine/applyPresetChanges.js";
import { catalogEngine, type ProfileCatalog } from "../profiles.js";
import { resolvePreset, type Preset } from "../presets/preset.js";
import type { DiffOptions, SettingsSide } from "./diffSettings.js";

/** A profile as a diff's reference: its stock project settings and its printer's machine settings (see DiffOptions.reference). */
export async function diffReference(catalog: ProfileCatalog, profileId: string): Promise<NonNullable<DiffOptions["reference"]>> {
  const loaded = await catalogEngine(catalog).load(profileId);
  return { stock: loaded.convertProfile.profile.baselineProjectSettings, machine: loaded.convertProfile.printer.machineSettingsConfig };
}

/**
 * Snapmaker's stock profile as a diff side: its project settings, labeled with its name. Shared by the CLI's
 * `diff --against-stock` and the worker's stock side, so both compare the same thing.
 */
export async function stockDiffSide(profileId: string, catalog: ProfileCatalog): Promise<SettingsSide & { profileId: string }> {
  const loaded = await catalogEngine(catalog).load(profileId);
  return { label: `Snapmaker's stock ${loaded.summary.displayName} profile`, settings: loaded.convertProfile.profile.baselineProjectSettings, profileId: loaded.summary.id };
}

/**
 * A preset as a diff side, the way it converts: its base profile's stock
 * settings with its changes written over them. Shared by the CLI's
 * `diff --against-preset` and the worker's preset side, so both compare
 * the same thing.
 */
export async function presetDiffSide(preset: Preset, catalog: ProfileCatalog): Promise<SettingsSide & { profileId: string }> {
  const resolved = await resolvePreset(preset, catalog);
  const loaded = await catalogEngine(catalog).load(resolved.profileId);
  const settings = structuredClone(loaded.convertProfile.profile.baselineProjectSettings);
  applyPresetChanges(settings, resolved.changes, []);
  const name = typeof preset.name === "string" ? preset.name.slice(0, 40) : "";
  return { label: `Your preset ${name} on ${loaded.summary.displayName}`, settings, profileId: resolved.profileId };
}
