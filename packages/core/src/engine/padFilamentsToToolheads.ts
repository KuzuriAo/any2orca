// SPDX-License-Identifier: MIT
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import type { JsonRecord } from "./types.js";

/**
 * The colors Snapmaker Orca gives the filaments it adds, in order (Plater.cpp, get_next_color_for_filament). The app
 * keeps one counter for the whole session, so these are the colors a freshly started app gives its first ones.
 */
export const NEW_FILAMENT_COLORS: readonly string[] = [
  "#00C1AE", "#F4E2C1", "#ED1C24", "#00FF7F", "#F26722", "#FFEB31", "#7841CE", "#115877",
  "#ED1E79", "#2EBDEF", "#345B2F", "#800080", "#FA8173", "#800000", "#F7B763", "#A4C41E",
];

/** Per-filament settings the settings catalog doesn't list as filament settings. */
const PROJECT_FILAMENT_KEYS: ReadonlySet<string> = new Set(["filament_settings_id", "filament_ids", "filament_flow_step_size", "filament_volume_type"]);

/** Lists with the print's entry first, one entry per filament, and the printer's last. */
const FRAMED_KEYS = ["different_settings_to_system", "inherits_group"];


/** A color as "RRGGBB", so "#00c1ae" and "#00C1AEFF" compare equal. */
const colorKey = (value: unknown) => {
  const hex = typeof value === "string" ? value.trim().replace(/^#/, "").toUpperCase() : "";
  return hex.length === 8 ? hex.slice(0, 6) : hex;
};

const number = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pads a project with fewer filaments than the printer has toolheads to one filament per toolhead, as Snapmaker Orca
 * does when a project is switched to a printer with several (Tab.cpp, "sync filament num if it's a multi tool
 * printer"): each added filament is a copy of the last one, its preset, parent and settings included, in the next of
 * the app's new-filament colors the project doesn't use. No object uses the copies, and the project's own filaments
 * stay as they are. A file with fewer is set up for every toolhead anyway when the app opens it, and then checked
 * against its own shorter lists: the app lists a nameless preset as customized and marks a one-filament project's
 * filament modified. Printers with more toolheads than the palette has colors are left alone.
 *
 * @param filamentKeys the profile's filament settings (its filament template), which the converter reads per filament
 *   when it converts a file again, besides those the settings catalog lists as filament settings.
 * @returns how many filaments were added.
 */
export function padFilamentsToToolheads(settings: JsonRecord, slotCount: number, toolheads: number, filamentKeys: ReadonlySet<string> = new Set()): number {
  const added = toolheads - slotCount;
  if (slotCount < 1 || added < 1 || toolheads > NEW_FILAMENT_COLORS.length) return 0;

  const isPerFilament = (key: string) =>
    filamentKeys.has(key) || PROJECT_FILAMENT_KEYS.has(key) || (Object.hasOwn(SETTINGS_CATALOG, key) && SETTINGS_CATALOG[key].group === "filament");
  for (const [key, value] of Object.entries(settings)) {
    if (!Array.isArray(value) || !isPerFilament(key)) continue;
    // One value per filament, or two (standard, high flow).
    const per = value.length === slotCount ? 1 : value.length === slotCount * 2 ? 2 : 0;
    if (per === 0) continue;
    const last = value.slice(-per);
    settings[key] = [...value, ...Array.from({ length: added }, () => last).flat()];
  }

  for (const key of FRAMED_KEYS) {
    const value = settings[key];
    if (!Array.isArray(value) || value.length !== slotCount + 2) continue;
    settings[key] = [...value.slice(0, -1), ...Array.from({ length: added }, () => value[slotCount]), value[value.length - 1]];
  }

  const own = settings.filament_colour;
  if (Array.isArray(own) && own.length === toolheads) {
    const used = new Set(own.slice(0, slotCount).map(colorKey));
    settings.filament_colour = [...own.slice(0, slotCount), ...NEW_FILAMENT_COLORS.filter((color) => !used.has(colorKey(color))).slice(0, added)];
  }

  // The app sizes the flush volumes the same way: each added filament takes the first one's two values, and each new
  // pair of filaments the sum of the unloading and loading volumes (PresetBundle.cpp, update_multi_material_filament_presets).
  const vector = settings.flush_volumes_vector;
  const matrix = settings.flush_volumes_matrix;
  if (Array.isArray(vector) && vector.length === slotCount * 2 && Array.isArray(matrix) && matrix.length === slotCount * slotCount) {
    const volumes = [...vector, ...Array.from({ length: added }, () => [vector[0], vector[1]]).flat()].map(String);
    const flush: string[] = [];
    for (let row = 0; row < toolheads; row++) {
      for (let col = 0; col < toolheads; col++) {
        if (row < slotCount && col < slotCount) flush.push(String(matrix[row * slotCount + col]));
        else flush.push(row === col ? "0" : String(Math.round((number(volumes[row * 2]) + number(volumes[col * 2 + 1])) * 1e6) / 1e6));
      }
    }
    settings.flush_volumes_vector = volumes;
    settings.flush_volumes_matrix = flush;
  }
  return added;
}
