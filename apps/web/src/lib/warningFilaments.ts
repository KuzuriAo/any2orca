// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pairs conversion banner warnings with the color chips of any filament slots
 * named by their matching ConvertNote in `report.notes` and/or explicitly named
 * as "filament N" / "filaments N, M and K" in the warning text.
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

/**
 * Extracts 1-based filament slot numbers explicitly named as "filament N" or
 * "filaments N, M and K" in a warning sentence. Does not match counts before
 * the word ("5 filaments") or ranges ("from 1 to 16").
 */
export function extractMentionedSlots(text: string): number[] {
  const found = new Set<number>();

  // Plural lists: "filaments 1 and 3", "filaments 1, 2, 3, 5 and 6"
  const pluralRe = /\bfilaments\s+(\d+(?:(?:\s*,\s*|\s+and\s+)\d+)+)\b/gi;
  for (const match of text.matchAll(pluralRe)) {
    const nums = match[1].match(/\d+/g) ?? [];
    for (const n of nums) {
      const slot = Number.parseInt(n, 10);
      if (Number.isInteger(slot) && slot >= 1) found.add(slot);
    }
  }

  // Singular mentions: "filament 17", "Filament 2", "filament 1"
  const singularRe = /\bfilament\s+(\d+)\b/gi;
  for (const match of text.matchAll(singularRe)) {
    const slot = Number.parseInt(match[1], 10);
    if (Number.isInteger(slot) && slot >= 1) found.add(slot);
  }

  return [...found].sort((a, b) => a - b);
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
    const combined = new Set<number>();
    const fromNote = slotsByText.get(normalizeWarningKey(text));
    if (fromNote) {
      for (const slot of fromNote) {
        if (Number.isInteger(slot) && slot >= 1) combined.add(slot);
      }
    }
    for (const slot of extractMentionedSlots(text)) {
      combined.add(slot);
    }

    const sortedSlots = [...combined].sort((a, b) => a - b);
    const chips: WarningFilamentChip[] = sortedSlots.map((slot) => {
      const rawColor = filaments && slot <= filaments.length ? filaments[slot - 1]?.color : undefined;
      return { slot, color: swatchColor(rawColor) };
    });

    return { text, chips };
  });
}
