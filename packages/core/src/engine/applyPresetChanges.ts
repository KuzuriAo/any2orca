// SPDX-License-Identifier: MIT
import { VARIANT_PROCESS_KEYS } from "./applyHighFlowHotends.js";
import type { JsonRecord } from "./types.js";

const VARIANT_KEYS: ReadonlySet<string> = new Set(VARIANT_PROCESS_KEYS);

/**
 * Writes a preset's values over the merged settings, so the user's own
 * values win over the creator's. The caller has already checked every key
 * and value (resolvePreset); only keys the profile has are written, so each
 * one is already flagged in different_settings_to_system.
 *
 * A setting stored per hotend type (`[standard, high_flow]`) gets the
 * preset's value as its standard entry; the high-flow entry is left to the
 * profile and the high-flow option, which run after this.
 */
export function applyPresetChanges(settings: JsonRecord, changes: Readonly<Record<string, string | string[]>>, warnings: string[]): void {
  for (const key of Object.keys(changes).sort()) {
    if (!Object.hasOwn(settings, key)) continue;
    const value = changes[key];
    const current = settings[key];
    settings[key] = VARIANT_KEYS.has(key) && Array.isArray(current) && typeof value === "string" ? [value, ...current.slice(1)] : value;
    warnings.push(`  preset: ${key} set to ${Array.isArray(value) ? value.join(", ") : value}`);
  }
}
