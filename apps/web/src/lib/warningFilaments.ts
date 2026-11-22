// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pairs conversion banner warnings with the color chips of any filament slots
 * named by their matching ConvertNote in `report.notes`.
 */
import type { ConvertNote } from "any2orca";
import { swatchColor } from "./plateFilaments";

export interface WarningFilamentChip {
  slot: number;
  color: string;
}

export interface WarningEntry {
  text: string;
  chips: WarningFilamentChip[];
}

function normalizeWarningKey(text: string): string {
  return text.trim().replace(/\.$/, "").toLowerCase();
}

export function resolveWarningEntries(
  warnings: readonly string[],
  notes: readonly ConvertNote[] | null | undefined,
  filaments: readonly { color?: string }[] | null | undefined,
): WarningEntry[] {
  const slotsByText = new Map<string, number[]>();
  if (notes) {
    for (const note of notes) {
      if (!note.slots || note.slots.length === 0) continue;
      const key = normalizeWarningKey(note.text);
      if (!slotsByText.has(key)) {
        slotsByText.set(key, note.slots);
      }
    }
  }

  return warnings.map((text) => {
    const rawSlots = slotsByText.get(normalizeWarningKey(text));
    if (!rawSlots || rawSlots.length === 0) {
      return { text, chips: [] };
    }
    const seen = new Set<number>();
    const chips: WarningFilamentChip[] = [];
    for (const slot of rawSlots) {
      if (!Number.isInteger(slot) || slot < 1 || seen.has(slot)) continue;
      seen.add(slot);
      const rawColor = filaments && slot <= filaments.length ? filaments[slot - 1]?.color : undefined;
      chips.push({ slot, color: swatchColor(rawColor) });
    }
    return { text, chips };
  });
}
