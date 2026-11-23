// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the plate view says about the filaments a plate uses: a mark for a plate that needs more at the same height
 * than the U1 prints with, or more in all than it has toolheads, a compact swap plan when one exists, and a safe
 * color for each swatch.
 */
import type { FilamentSwap, PlateFilaments } from "any2orca";

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

function formatMm(mm: number): string {
  return Number(mm.toFixed(2)).toString();
}

function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Where a pause belongs for one shared-toolhead change, in layers when known or mm otherwise. */
export function formatSwapPauseRange(swap: Pick<FilamentSwap, "pauseLayers" | "after" | "before">): string {
  if (swap.pauseLayers) {
    const { first, last } = swap.pauseLayers;
    return first === last ? `pause on layer ${first}` : `pause on a layer from ${first} to ${last}`;
  }
  return `pause between ${formatMm(swap.after)} mm and ${formatMm(swap.before)} mm`;
}

/** Whether the file already has a pause in that range, or one needs to be added in Snapmaker Orca. */
export function formatSwapPauseStatus(swap: Pick<FilamentSwap, "pauses">): string {
  if (swap.pauses.length === 0) return "add a pause in Snapmaker Orca";
  const layers = swap.pauses
    .map((p) => p.layer)
    .filter((l): l is number => typeof l === "number");
  if (layers.length === swap.pauses.length) {
    const unique = [...new Set(layers)];
    return unique.length === 1
      ? `already at layer ${unique[0]}`
      : `already at layers ${formatList(unique.map(String))}`;
  }
  const heights = [...new Set(swap.pauses.map((p) => formatMm(p.height)))];
  return heights.length === 1
    ? `already at ${heights[0]} mm`
    : `already at ${formatList(heights)} mm`;
}
