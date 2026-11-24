// SPDX-License-Identifier: MIT
/**
 * What Snapmaker Space's review rules say about a converted file, beyond its filament brands: said only when a
 * filament naming option is on, since that is how a file is made ready for Space. The rules (Snapmaker's wiki,
 * "content review") list, among the reasons a submission isn't approved, more than four colors on one build plate
 * without Full Spectrum or pausing at filament changes. That is what this note says, as the rules' reason, not as
 * what Space does: an upload with five colors on a plate was accepted at upload, and its later review is unknown.
 * The filament brands are covered by the naming option's own notes.
 */
import type { PlateFilaments } from "../archive/plateFilaments.js";
import type { SwapPlan } from "../swapPlan.js";

export interface SpaceNote {
  /** The filament slots the note is about, or none. */
  slots: number[];
  text: string;
}

/** "Plate 3", "Plates 3 and 4". */
function plateList(plates: readonly number[]): string {
  if (plates.length === 1) return `Plate ${plates[0]}`;
  return `Plates ${plates.slice(0, -1).join(", ")} and ${plates[plates.length - 1]}`;
}

/** Whether a plate already pauses at every filament change its plan has: the rules' own exception. */
function pausesAtEveryChange(plan: SwapPlan | undefined): boolean {
  if (!plan) return false;
  const swaps = plan.shared.flatMap((head) => head.swaps);
  return swaps.length > 0 && swaps.every((swap) => swap.pauses.length > 0);
}

/**
 * @param swapPlans each plate's plan for sharing toolheads, where it has one: a plate whose every change already has a
 *   pause meets the rules' exception, so it isn't listed
 */
export function spaceReviewNotes(plates: readonly PlateFilaments[], swapPlans: readonly SwapPlan[] = []): SpaceNote[] {
  const plans = new Map(swapPlans.map((plan) => [plan.plate, plan]));
  const crowded = plates.filter((p) => p.filaments.length > 4 && !pausesAtEveryChange(plans.get(p.plate)));
  if (crowded.length === 0) return [];
  const counts = crowded.length === 1 ? `${plateList([crowded[0]!.plate])} uses ${crowded[0]!.filaments.length}.` : `${plateList(crowded.map((p) => p.plate))} use more than four.`;
  return [
    {
      slots: [],
      text: `To publish on Snapmaker Space: its review rules list more than four colors on one plate as a reason to turn a file down, unless the print pauses at filament changes or uses Full Spectrum. ${counts}`,
    },
  ];
}
