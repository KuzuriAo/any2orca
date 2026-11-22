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

/** "plate 3", "plates 3 and 4", "plates 1, 3 and 4". */
function plateList(plates: readonly number[]): string {
  if (plates.length === 1) return `plate ${plates[0]}`;
  return `plates ${plates.slice(0, -1).join(", ")} and ${plates[plates.length - 1]}`;
}

/** Where Snapmaker's proposed fix for the tool order of high-numbered filaments is. */
export const SHARED_LAYER_FIX_URL = "https://github.com/Snapmaker/OrcaSlicer/pull/1208";

/**
 * The note for a release that can leave a high-numbered filament out of layers it shares with a lower-numbered one
 * (`ProfileCatalog.sharedLayerFilamentLimit`): null unless some plate uses a filament above the limit together
 * with a lower-numbered filament. A filament above the limit that is alone on its plate prints as it should.
 *
 * @param slicer the release, as shown to the user: "Snapmaker Orca 2.4.1"
 */
export function sharedLayerFilamentNote(plates: readonly PlateFilaments[], limit: number | null, slicer: string): PlateNote | null {
  if (limit === null) return null;
  const affectedPlates: number[] = [];
  const affectedSlots = new Set<number>();
  for (const { plate, filaments } of plates) {
    // Each filament above the limit that has a lower-numbered one on the plate: on a plate that uses only 17 and 18, that is 18.
    const lowest = Math.min(...filaments.map((f) => f.slot));
    const above = filaments.map((f) => f.slot).filter((slot) => slot > limit && slot > lowest);
    if (above.length === 0) continue;
    affectedPlates.push(plate);
    for (const slot of above) affectedSlots.add(slot);
  }
  if (affectedPlates.length === 0) return null;
  const slots = [...affectedSlots].sort((a, b) => a - b);
  const subject = slots.length === 1 ? `Filament ${slots[0]} is used` : `${filamentList(slots).replace(/^f/, "F")} are used`;
  return {
    slots,
    warning: true,
    text: `${subject} on ${plateList(affectedPlates)} together with ${slots.length === 1 && affectedPlates.length === 1 ? "a lower-numbered filament" : "lower-numbered filaments"}. ${slicer} can leave a filament numbered above ${limit} out of the layers it shares with a lower-numbered one, with no message, so check the sliced preview for ${slots.length === 1 ? "it" : "them"} before printing. A fix is proposed at ${SHARED_LAYER_FIX_URL}.`,
  };
}
