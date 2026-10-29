// SPDX-License-Identifier: MIT
import { FILAMENT_FLOW_VARIANT_KEYS } from "./applyFilamentFlowVariants.js";
import { detectVariantIndex } from "./detectVariantIndex.js";
import { filamentVariantLayout } from "./filamentVariantLayout.js";
import { reshapeToCount } from "./reshapeToCount.js";
import type { JsonRecord } from "./types.js";

export type FilamentSlot = Record<string, unknown>;

const VARIANT_KEYS: ReadonlySet<string> = new Set(FILAMENT_FLOW_VARIANT_KEYS);

export interface ExtractFilamentSlotsResult {
  /** key -> reshaped array of length filamentCount, for overlaying onto project_settings. `null` if extraction failed. */
  filamentKeyArrays: Record<string, unknown[]> | null;
  /** One dict per filament slot used in the project. Always an array (empty on failure). */
  slots: FilamentSlot[];
}

/** Up to six setting names, then how many more. */
function keyList(keys: readonly string[]): string {
  return keys.length <= 6 ? keys.join(", ") : `${keys.slice(0, 6).join(", ")} and ${keys.length - 6} more`;
}

/**
 * Build a list of per-filament dicts (one per filament slot used in the
 * Bambu project) by reshaping every relevant array key down to the
 * project's actual filament count.
 *
 * @param filamentTemplateKeys keys present in the filament shape template (`filament_settings_1.config`'s keys).
 * @param extraProjectLevelFilamentKeys project-level-only filament array keys not in the shape template.
 * @param filamentKeyBlocklist keys never pulled from Bambu.
 */
export function extractFilamentSlots(
  bambuSettings: JsonRecord,
  filamentTemplateKeys: ReadonlySet<string>,
  extraProjectLevelFilamentKeys: ReadonlySet<string>,
  filamentKeyBlocklist: ReadonlySet<string>,
  warnings: string[],
): ExtractFilamentSlotsResult {
  // Settings object keys are the slicer's own config field names (snake_case,
  // e.g. "filament_colour", "printable_area") -- passed through JSON.parse
  // verbatim, never renamed to camelCase.
  const colors = bambuSettings.filament_colour;
  if (!Array.isArray(colors) || colors.length === 0) {
    warnings.push("  WARN: the source file has no filament_colour list, so its filament settings aren't carried over.");
    return { filamentKeyArrays: null, slots: [] };
  }

  const filamentCount = colors.length;
  const keysToPull = [...new Set([...filamentTemplateKeys, ...extraProjectLevelFilamentKeys])]
    .filter((k) => !filamentKeyBlocklist.has(k))
    .sort();

  const variantIndex = detectVariantIndex(bambuSettings) ?? 0;
  // A source saved by an Orca-family slicer says where each filament's standard value sits, even when filaments carry different numbers of values.
  const layout = filamentVariantLayout(bambuSettings, filamentCount);

  const perProjectKeyArrays: Record<string, unknown[]> = {};
  // Stale lists usually affect dozens of settings at once; they're reported as one line per kind, not one per setting.
  const stockUsed = new Map<number, string[]>();
  const firstUsed = new Map<number, string[]>();
  const note = (groups: Map<number, string[]>, length: number, key: string) => groups.set(length, [...(groups.get(length) ?? []), key]);
  for (const key of keysToPull) {
    const bval = bambuSettings[key];
    if (!Array.isArray(bval)) continue;
    // The layout's own bookkeeping; applyFilamentFlowVariants writes it for the target nozzle.
    if (layout && (key === "filament_flow_support" || key === "filament_flow_step_size")) continue;
    if (layout && VARIANT_KEYS.has(key) && bval.length === layout.length) {
      perProjectKeyArrays[key] = layout.slots.map((slot) => bval[slot.standard]);
      continue;
    }
    // Several values per filament are read as one per nozzle variant only when the file names the variants;
    // otherwise the extra values are stale entries, and the first one per filament is used, as the slicer does.
    const variantNames = bambuSettings.filament_extruder_variant;
    const reshaped =
      bval.length === filamentCount || (Array.isArray(variantNames) && variantNames.length === bval.length)
        ? reshapeToCount(bval, filamentCount, variantIndex)
        : bval.length > filamentCount
          ? bval.slice(0, filamentCount)
          : null;
    if (reshaped === null) {
      note(stockUsed, bval.length, key);
      continue;
    }
    if (bval.length > filamentCount && !(Array.isArray(variantNames) && variantNames.length === bval.length)) {
      note(firstUsed, bval.length, key);
    }
    perProjectKeyArrays[key] = reshaped;
  }
  for (const [length, keys] of stockUsed) {
    warnings.push(
      keys.length === 1
        ? `  WARN: ${keys[0]} has ${length} values for ${filamentCount} filaments in the source file, so Snapmaker's stock value is used for it.`
        : `  WARN: ${keys.length} filament settings have ${length} values for ${filamentCount} filaments in the source file, so Snapmaker's stock values are used for them: ${keyList(keys)}.`,
    );
  }
  for (const [length, keys] of firstUsed) {
    warnings.push(
      keys.length === 1
        ? `  WARN: ${keys[0]} has ${length} values for ${filamentCount} filaments in the source file; the first ${filamentCount} are used.`
        : `  WARN: ${keys.length} filament settings have ${length} values for ${filamentCount} filaments in the source file; the first ${filamentCount} of each are used: ${keyList(keys)}.`,
    );
  }

  const slots: FilamentSlot[] = [];
  for (let i = 0; i < filamentCount; i++) {
    const slot: FilamentSlot = {};
    for (const [key, arr] of Object.entries(perProjectKeyArrays)) {
      slot[key] = arr[i];
    }
    slots.push(slot);
  }

  return { filamentKeyArrays: perProjectKeyArrays, slots };
}
