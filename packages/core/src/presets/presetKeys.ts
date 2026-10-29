// SPDX-License-Identifier: MIT
/**
 * Which settings a preset can carry: Snapmaker Orca's print (process)
 * settings, from the settings catalog generated at the pinned release, minus
 * the ones below. Nothing outside this list is ever read from a master file
 * or applied from a presets file.
 */
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";

/** Print settings a preset never carries, with the reason, so a note can say why one was left out. */
export const PRESET_EXCLUDED_KEYS: Readonly<Record<string, string>> = Object.freeze({
  // Tied to the model's layout and filament slots, not a printing preference.
  // A different print sequence can make the toolhead hit printed objects.
  print_sequence: "belongs to the model's layout",
  print_order: "belongs to the model's layout",
  wall_filament: "is a filament slot of the model",
  sparse_infill_filament: "is a filament slot of the model",
  solid_infill_filament: "is a filament slot of the model",
  support_filament: "is a filament slot of the model",
  support_interface_filament: "is a filament slot of the model",
  wipe_tower_filament: "is a filament slot of the model",
  wiping_volumes_extruders: "depends on the model's filaments",
  // Which hotend types the profile has values for: the layout of the per-hotend-type settings, set by the profile.
  process_flow_support: "is set by the profile",
  // Preset bookkeeping, not a setting.
  inherits: "is preset bookkeeping",
  compatible_printers: "is preset bookkeeping",
  compatible_printers_condition: "is preset bookkeeping",
  // Scripts and free text.
  post_process: "runs a script",
  filename_format: "is a file name template",
  notes: "is free text",
  // The U1's Klipper firmware doesn't use arc moves.
  enable_arc_fitting: "doesn't suit the U1's firmware",
});

/** Every key a preset may set, sorted. */
export const PRESET_KEYS: readonly string[] = Object.freeze(
  Object.keys(SETTINGS_CATALOG)
    .filter((key) => SETTINGS_CATALOG[key].group === "print" && !Object.hasOwn(PRESET_EXCLUDED_KEYS, key))
    .sort(),
);

const PRESET_KEY_SET: ReadonlySet<string> = new Set(PRESET_KEYS);

export function isPresetKey(key: string): boolean {
  return PRESET_KEY_SET.has(key);
}
