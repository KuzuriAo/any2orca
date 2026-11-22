// SPDX-License-Identifier: MIT
import type { FilamentSlot } from "./extractFilamentSlots.js";
import type { PrinterFilamentPresets } from "../profiles.js";
import { presetChanges, presetSettingsFor, type AppliedFilamentPreset } from "./applyFilamentPresets.js";
import { resolveFilamentName, type FilamentComplianceMode, type FilamentNameTable } from "./filamentComplianceNames.js";

export interface RenamedFilament {
  /** 0-based slot index. */
  slot: number;
  before: string;
  after: string;
}

export interface ApplyFilamentComplianceModeResult {
  slots: FilamentSlot[];
  filamentKeyArrays: Record<string, unknown[]> | null;
  /** Product lines that use Generic because Snapmaker has no preset for them at this nozzle size, deduped, in first-seen order. */
  fellBackToGenericMaterials: string[];
  /** Filaments left as the creator named them because no Snapmaker or Generic preset fits (their line, or material when no line), deduped. */
  unchangedMaterials: string[];
  /** Each slot whose name changed. */
  renamed: RenamedFilament[];
  /** Each slot that takes its preset's settings (every slot a preset fits, renamed or already so named), with what that replaces. */
  presets: AppliedFilamentPreset[];
  /** Presets named whose settings the catalog's presets file doesn't have (with a file at all): those slots changed names only. */
  missingPresets: string[];
}

/** The keys a saved project records a filament preset's identity in, one entry per slot. */
const IDENTITY_KEYS = ["filament_settings_id", "filament_ids", "filament_vendor"] as const;

/**
 * Overrides each filament slot's identity with a real Generic/Snapmaker
 * preset's, for marketplace-compliance purposes -- e.g. Snapmaker Space
 * (space.snapmaker.com), Snapmaker's own model platform, requiring uploads
 * to declare Generic or Snapmaker filament rather than a third-party brand
 * like Bambu's own. The identity is what Snapmaker Orca itself records when
 * someone picks that preset: `filament_settings_id` (the name),
 * `filament_ids` and `filament_vendor`, all three together, so the file
 * never says "Snapmaker PLA..." next to Bambu's vendor or id. Written to
 * the slot and to the matching entries in `filamentKeyArrays`, which is
 * what reaches the merged `project_settings.config`.
 *
 * Identity-only: never touches the slot's actual physical properties
 * (temps, retraction, flow, etc.) -- those came from the real filament the
 * creator used and stay exactly as tuned. A slot no preset fits (unknown
 * material, or none at this nozzle size) is left completely untouched
 * rather than guessed at, and reported.
 *
 * @param table the profile catalog's `filamentNames`; without it every slot is left as it is and reported.
 * @param printerId the target printer: names exist per nozzle size, so they follow the printer converted to, not the source.
 */
export function applyFilamentComplianceMode(
  slots: FilamentSlot[],
  filamentKeyArrays: Record<string, unknown[]> | null,
  mode: FilamentComplianceMode,
  table: FilamentNameTable | undefined,
  printerId: string,
  /** The printer's presets' settings; without them only the names change. */
  presets?: PrinterFilamentPresets,
  /** Only these slots (0-based); the rest are returned as they are and not reported. Default: every slot. */
  only?: ReadonlySet<number>,
): ApplyFilamentComplianceModeResult {
  const fellBackToGeneric = new Set<string>();
  const unchanged = new Set<string>();
  const renamed: RenamedFilament[] = [];
  const applied: AppliedFilamentPreset[] = [];
  const missing = new Set<string>();
  const arrays: Partial<Record<(typeof IDENTITY_KEYS)[number], unknown[]>> = {};
  for (const key of IDENTITY_KEYS) if (filamentKeyArrays?.[key]) arrays[key] = [...filamentKeyArrays[key]];

  const newSlots = slots.map((slot, i) => {
    if (only && !only.has(i)) return slot;
    const filamentType = typeof slot.filament_type === "string" ? slot.filament_type : "";
    const filamentSettingsId = typeof slot.filament_settings_id === "string" ? slot.filament_settings_id : "";
    if (!table) {
      unchanged.add(filamentType || "unknown material");
      return slot;
    }
    const result = resolveFilamentName(table, printerId, filamentType, filamentSettingsId, mode);
    if (!result.preset) {
      unchanged.add(result.line?.label ?? (filamentType || "unknown material"));
      return slot;
    }
    if (result.outcome === "generic") fellBackToGeneric.add(result.line?.label ?? filamentType);
    if (result.preset.name !== filamentSettingsId) renamed.push({ slot: i, before: filamentSettingsId, after: result.preset.name });
    const values = presetSettingsFor(presets, result.preset.name);
    if (values) applied.push({ slot: i, preset: result.preset.name, changed: presetChanges(values, (key) => filamentKeyArrays?.[key]?.[i] ?? slot[key]) });
    else if (presets) missing.add(result.preset.name);
    const identity = { filament_settings_id: result.preset.name, filament_ids: result.preset.id, filament_vendor: result.preset.vendor };
    for (const key of IDENTITY_KEYS) {
      const list = arrays[key];
      if (list && i < list.length) list[i] = identity[key];
    }
    const next: FilamentSlot = { ...slot, filament_settings_id: identity.filament_settings_id, filament_vendor: identity.filament_vendor };
    if (Object.hasOwn(slot, "filament_ids")) next.filament_ids = identity.filament_ids;
    return next;
  });

  const newFilamentKeyArrays = filamentKeyArrays && Object.keys(arrays).length > 0 ? { ...filamentKeyArrays, ...arrays } : filamentKeyArrays;

  return {
    slots: newSlots,
    filamentKeyArrays: newFilamentKeyArrays,
    fellBackToGenericMaterials: [...fellBackToGeneric],
    unchangedMaterials: [...unchanged],
    renamed,
    presets: applied,
    missingPresets: [...missing],
  };
}
