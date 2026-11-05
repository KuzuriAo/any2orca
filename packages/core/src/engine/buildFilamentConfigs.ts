// SPDX-License-Identifier: MIT
import type { FilamentSlot } from "./extractFilamentSlots.js";
import type { JsonRecord } from "./types.js";

export interface BuildFilamentConfigsResult {
  /** arcname (e.g. "Metadata/filament_settings_1.config") -> parsed config JSON object. */
  files: Record<string, JsonRecord>;
  uniqueNames: unknown[] | null;
}

/**
 * Given per-filament-slot dicts (from `extractFilamentSlots`) and the Orca
 * filament shape template, produce deduplicated filament config objects
 * (one per unique `filament_settings_id`) plus the list of unique names in
 * slot order.
 *
 * Returns parsed JSON objects rather than encoded file bytes: the pipeline's response is JSON end-to-end (see
 * `ConfigFilesSchema` in schema.ts), and `applyConvertResponse`
 * (archive/zip.ts) serializes these into the final zip.
 */
export function buildFilamentConfigs(
  slots: FilamentSlot[],
  filamentShape: JsonRecord,
  filamentKeyBlocklist: ReadonlySet<string>,
): BuildFilamentConfigsResult {
  if (slots.length === 0) {
    return { files: {}, uniqueNames: null };
  }

  // Each name's first slot, in one pass, in the order names first appear. Every slot is kept in the project; this
  // only picks which one each embedded preset is written from. (Scanning the list for every slot was quadratic.)
  // The settings came through JSON, so no name is NaN, the one value a Map compares differently from `===`.
  const firstSlotByName = new Map<unknown, FilamentSlot>();
  for (const slot of slots) {
    const name = slot.filament_settings_id ?? "Unnamed Filament";
    if (!firstSlotByName.has(name)) firstSlotByName.set(name, slot);
  }
  const uniqueNames = [...firstSlotByName.keys()];

  const files: Record<string, JsonRecord> = {};
  uniqueNames.forEach((name, i) => {
    const idx = i + 1;
    const rep = firstSlotByName.get(name)!;
    const cfg: JsonRecord = { ...filamentShape };
    for (const [key, val] of Object.entries(rep)) {
      if (filamentKeyBlocklist.has(key)) continue;
      if (key === "filament_colour") {
        cfg.default_filament_colour = [val];
        continue;
      }
      if (!(key in filamentShape)) continue;
      cfg[key] = [val];
    }
    // The template's id belongs to one of Snapmaker's own presets; an embedded preset carries its filament's id, or none.
    const ownId = rep.filament_ids;
    if (typeof ownId === "string" && ownId.length > 0) cfg.filament_id = ownId;
    else delete cfg.filament_id;
    cfg.name = name;
    cfg.filament_settings_id = [name];
    files[`Metadata/filament_settings_${idx}.config`] = cfg;
  });

  return { files, uniqueNames };
}
