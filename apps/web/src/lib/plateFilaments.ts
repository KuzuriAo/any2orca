// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the plate view says about the filaments a plate uses: a mark for a plate that needs more at the same height
 * than the U1 prints with, or more in all than it has toolheads, and a safe color for each swatch.
 */
import type { PlateFilaments } from "any2orca";

/** The U1 prints with four filaments at a time, one per toolhead. */
export const U1_TOOLHEADS = 4;

/** Shown when a filament's color in the file isn't a plain hex color: the file is untrusted, and the value goes into a style. */
export const NEUTRAL_SWATCH = "#808080";

/** A filament's color as a value that is safe in a style: "#RGB", "#RRGGBB" or "#RRGGBBAA", or a neutral gray. */
export function swatchColor(color: string | undefined): string {
  return typeof color === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : NEUTRAL_SWATCH;
}

export interface PlateFilamentSummary {
  kind: "too-many-at-once" | "needs-changes";
  text: string;
}

/** The mark for a plate, or null when the U1 prints it with the filaments it has loaded. */
export function plateFilamentSummary(plate: Pick<PlateFilaments, "filaments" | "mostAtOnce">, toolheads: number): PlateFilamentSummary | null {
  if (plate.mostAtOnce > toolheads) {
    return { kind: "too-many-at-once", text: `Needs ${plate.mostAtOnce} filaments at the same height; the U1 prints with ${toolheads}` };
  }
  if (plate.filaments.length > toolheads) {
    return { kind: "needs-changes", text: `${plate.filaments.length} filaments, ${plate.mostAtOnce} at the same height: prints with filament changes at pauses` };
  }
  return null;
}
