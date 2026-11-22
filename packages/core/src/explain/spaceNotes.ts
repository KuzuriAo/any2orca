// SPDX-License-Identifier: MIT
/**
 * What Snapmaker Space's review rules say about a converted file, beyond its filament brands: said only when a
 * filament naming option is on, since that is how a file is made ready for Space. The rules (Snapmaker's wiki,
 * "content review") turn down a print profile that uses a filament brand other than Snapmaker, Generic or
 * Polymaker, one with more than four colors on a plate unless it pauses at filament changes or uses Full Spectrum,
 * and one whose preset name holds a competitor's brand or printer model. The brands are covered by the naming
 * option's own notes; the other two are here.
 */
import type { PlateFilaments } from "../archive/plateFilaments.js";

/** Makers whose name, or whose printers' names, a preset name may carry from the source file. */
const OTHER_MAKERS = /\b(bambu(?:\s*lab)?|bbl|creality|anycubic|elegoo|flashforge|qidi|prusa|x1c?|x1e|p1[ps]|a1(?:\s*mini)?|h2[cds]|h3c|x2d|ender|k1c?|k2(?:\s*plus)?|k3|kobra|centauri|adventurer)\b/i;

export interface SpaceNote {
  /** The filament slots the note is about, or none. */
  slots: number[];
  text: string;
}

/** "plate 3", "plates 3 and 4". */
function plateList(plates: readonly number[]): string {
  if (plates.length === 1) return `plate ${plates[0]}`;
  return `plates ${plates.slice(0, -1).join(", ")} and ${plates[plates.length - 1]}`;
}

/**
 * @param names the converted file's preset names: the print and printer presets, and each filament's with whether
 *   the naming option left it as the creator had it (those have their own note already)
 */
export function spaceReviewNotes(
  plates: readonly PlateFilaments[],
  names: { print?: unknown; printer?: unknown; filaments: ReadonlyArray<{ slot: number; name: string; unchanged: boolean }> },
): SpaceNote[] {
  const notes: SpaceNote[] = [];
  const crowded = plates.filter((p) => p.filaments.length > 4);
  if (crowded.length > 0) {
    const counts = crowded.length === 1 ? `${plateList([crowded[0]!.plate])} uses ${crowded[0]!.filaments.length}` : `${plateList(crowded.map((p) => p.plate))} use more`;
    notes.push({
      slots: [],
      text: `Snapmaker Space's review turns down more than four colors on one plate unless the print pauses at filament changes or uses Full Spectrum, and ${counts}.`,
    });
  }
  const named: string[] = [];
  const slots: number[] = [];
  for (const [what, value] of [["print preset", names.print], ["printer preset", names.printer]] as const) {
    if (typeof value === "string" && OTHER_MAKERS.test(value)) named.push(`the ${what} "${value.slice(0, 80)}"`);
  }
  for (const filament of names.filaments) {
    if (filament.unchanged || !OTHER_MAKERS.test(filament.name)) continue;
    named.push(`filament ${filament.slot}'s "${filament.name.slice(0, 80)}"`);
    slots.push(filament.slot);
  }
  if (named.length > 0) {
    notes.push({
      slots,
      text: `Snapmaker Space's review turns down a preset name that holds another maker's brand or printer model, and this file has ${named.slice(0, 6).join(", ")}${named.length > 6 ? ` and ${named.length - 6} more` : ""}.`,
    });
  }
  return notes;
}
