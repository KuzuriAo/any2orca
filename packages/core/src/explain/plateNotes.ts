// SPDX-License-Identifier: MIT
/**
 * What a result says about the filaments each plate uses: a plate that needs more filaments at the same height than
 * the printer has toolheads, a plate that uses more than that but never at once, and, for a project with more
 * filaments than toolheads, which ones each plate uses (what to load for it).
 */
import type { PlateFilaments } from "../archive/plateFilaments.js";

/** "filament 4", "filaments 1 and 3", "filaments 1, 3, 5 and 6". */
export function filamentList(slots: readonly number[]): string {
  if (slots.length === 1) return `filament ${slots[0]}`;
  return `filaments ${slots.slice(0, -1).join(", ")} and ${slots[slots.length - 1]}`;
}

export interface PlateNote {
  /** The plate's filament slots. */
  slots: number[];
  text: string;
  /** Worth a warning (the plate can't print as it is, or needs filament changes); false for a plain "what it uses" line. */
  warning: boolean;
}

/**
 * The notes for a project's plates, the ones that can't print as they are first, then the ones that need filament
 * changes, then the plain lines, each group in plate order.
 *
 * @param filamentCount how many filaments the source project has
 * @param toolheads how many the printer prints with at a time
 */
export function plateFilamentNotes(plates: readonly PlateFilaments[], filamentCount: number, toolheads: number): PlateNote[] {
  const tooMany: PlateNote[] = [];
  const withChanges: PlateNote[] = [];
  const plain: PlateNote[] = [];
  for (const { plate, filaments, mostAtOnce } of plates) {
    if (filaments.length === 0) continue;
    const slots = filaments.map((f) => f.slot);
    if (mostAtOnce > toolheads) {
      tooMany.push({
        slots,
        warning: true,
        text: `Plate ${plate} needs ${mostAtOnce} filaments at the same height (it uses ${filamentList(slots)}), and the U1 prints with ${toolheads} at a time, so it can't print as it is. In Snapmaker Orca, move some of its objects to another plate or use fewer filaments on it.`,
      });
    } else if (slots.length > toolheads) {
      withChanges.push({
        slots,
        warning: true,
        text: `Plate ${plate} uses ${slots.length} filaments (${filamentList(slots)}), no more than ${mostAtOnce} at the same height. The U1 prints with ${toolheads} at a time, so this plate needs filament changes at pauses, which you set up in Snapmaker Orca.`,
      });
    } else if (filamentCount > toolheads) {
      plain.push({ slots, warning: false, text: `Plate ${plate} uses ${filamentList(slots)}.` });
    }
  }
  return [...tooMany, ...withChanges, ...plain];
}
