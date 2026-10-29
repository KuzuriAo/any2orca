// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/**
 * Gives every per-filament setting one value per filament slot.
 *
 * The creator's filament settings come from the source and already have
 * one value per slot. Settings the source doesn't carry (Orca-only or
 * Snapmaker-only ones such as ramming, cooling moves or stamping) keep the
 * U1 profile's stock value, but the stock profile describes a single
 * filament, sometimes with a standard and a high-flow value. Those are
 * repeated so each slot gets the stock standard value, matching the one
 * value per slot the rest of the filament settings use.
 *
 * @param filamentKeys the keys of a single filament's settings (the filament template's keys).
 * @param fromSource keys whose values came from the source file, already one per slot.
 */
export function fillFilamentSlots(settings: JsonRecord, filamentKeys: ReadonlySet<string>, fromSource: ReadonlySet<string>, slotCount: number): void {
  if (slotCount < 1) return;
  for (const key of filamentKeys) {
    if (fromSource.has(key)) continue;
    const value = settings[key];
    if (!Array.isArray(value) || value.length === 0 || value.length === slotCount) continue;
    settings[key] = Array.from({ length: slotCount }, () => value[0]);
  }
}
