// SPDX-License-Identifier: MIT
/**
 * What a result says about the filaments each plate uses: a plate that needs more filaments at the same height than
 * the printer has toolheads, a plate that uses more than that but never at once, and, for a project with more
 * filaments than toolheads, which ones each plate uses (what to load for it).
 */
import type { PlateFilaments, PlatePause } from "../archive/plateFilaments.js";
import type { FilamentSwap, SwapPlan } from "../swapPlan.js";

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
 * @param plans each plate's {@link SwapPlan}, by plate: a plate with one says which filaments share a toolhead
 */
export function plateFilamentNotes(plates: readonly PlateFilaments[], filamentCount: number, toolheads: number, plans: ReadonlyMap<number, SwapPlan> = new Map()): PlateNote[] {
  const tooMany: PlateNote[] = [];
  const withChanges: PlateNote[] = [];
  const plain: PlateNote[] = [];
  for (const { plate, filaments, mostAtOnce, byObject } of plates) {
    if (filaments.length === 0) continue;
    const slots = filaments.map((f) => f.slot);
    if (mostAtOnce > toolheads) {
      tooMany.push({
        slots,
        warning: true,
        text: `Plate ${plate} needs ${mostAtOnce} filaments at the same height (it uses ${filamentList(slots)}), and the U1 prints with ${toolheads} at a time, so it can't print as it is. In Snapmaker Orca, move some of its objects to another plate or use fewer filaments on it.`,
      });
    } else if (slots.length > toolheads && plans.has(plate)) {
      withChanges.push({ slots, warning: true, text: swapPlanText(plans.get(plate)!, slots.length, mostAtOnce) });
    } else if (slots.length > toolheads && byObject) {
      // The slicer applies no pauses to a plate printed object by object, so the pauses it needs can't be set up there.
      withChanges.push({
        slots,
        warning: true,
        text: `Plate ${plate} uses ${slots.length} filaments (${filamentList(slots)}), no more than ${mostAtOnce} at the same height. The U1 prints with ${toolheads} at a time, so this plate needs filament changes at pauses. It prints object by object, and Snapmaker Orca sets no pauses then: to use them, set the print sequence to by layer in Snapmaker Orca.`,
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


/**
 * The note for a release that can leave a high-numbered filament out of some layers
 * (`ProfileCatalog.sharedLayerFilamentLimit`): null unless some plate uses a filament above the limit together
 * with the filament that many numbers below it (17 with 1, 18 with 2, for a limit of 16). That pair is what test
 * slices lost layers on; a filament above the limit with other filaments on its plate, or alone, printed whole.
 *
 * @param slicer the release, as shown to the user: "Snapmaker Orca 2.4.1"
 */
export function sharedLayerFilamentNote(plates: readonly PlateFilaments[], limit: number | null, slicer: string): PlateNote | null {
  if (limit === null) return null;
  const affectedPlates: number[] = [];
  const affectedSlots = new Set<number>();
  const partnerSlots = new Set<number>();
  for (const { plate, filaments } of plates) {
    // Each filament above the limit whose partner, the filament `limit` numbers below it, is on the plate too.
    const onPlate = new Set(filaments.map((f) => f.slot));
    const above = [...onPlate].filter((slot) => slot > limit && onPlate.has(slot - limit));
    if (above.length === 0) continue;
    affectedPlates.push(plate);
    for (const slot of above) {
      affectedSlots.add(slot);
      partnerSlots.add(slot - limit);
    }
  }
  if (affectedPlates.length === 0) return null;
  const slots = [...affectedSlots].sort((a, b) => a - b);
  const partners = [...partnerSlots].sort((a, b) => a - b);
  const one = slots.length === 1;
  // What to do first, then what can happen, then how to see it and how to avoid it. A filament from 1 to the limit
  // is never the one left out, so moving the higher-numbered filament there is safe whatever else the plate uses.
  return {
    // Every filament the sentence names: the ones that can go missing and the ones they must not share a plate with.
    slots: [...new Set([...partners, ...slots])].sort((a, b) => a - b),
    warning: true,
    text:
      `Check ${plateList(affectedPlates)} before printing. ${slicer} can skip ${filamentList(slots)} on some layers when ` +
      `${filamentList(partners)} ${partners.length === 1 ? "is" : "are"} on the same plate, and it gives no warning. ` +
      `Look through the sliced preview for missing color. To avoid the problem, print ${one ? "the two" : "each pair"} on separate plates, ` +
      `or give ${filamentList(slots)} ${one ? "a number" : "numbers"} from 1 to ${limit} in Snapmaker Orca.`,
  };
}

/** "1, 2, 4 and 5". */
function numberList(numbers: readonly number[]): string {
  if (numbers.length === 1) return `${numbers[0]}`;
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Height as the layer slider shows it, two decimals, trailing zeros dropped: "12.66 mm", "13 mm". */
function mm(height: number): string {
  return `${Number(height.toFixed(2))} mm`;
}

/** Where a pause is: "layer 138", or its height where the plate's layers aren't known. */
function pauseAt(p: PlatePause): string {
  return p.layer !== undefined ? `layer ${p.layer}` : mm(p.height);
}

/** "a pause at layer 138", "pauses at layers 40 and 138", "pauses at 5 mm and 13 mm". */
function pausesAt(pauses: readonly PlatePause[]): string {
  const shown = pauses.slice(0, 8);
  const more = pauses.length > shown.length ? ` and ${pauses.length - shown.length} more` : "";
  if (shown.length === 1) return `a pause at ${pauseAt(shown[0]!)}`;
  if (shown.every((p) => p.layer !== undefined)) return `pauses at layers ${numberList(shown.map((p) => p.layer!))}${more}`;
  return `pauses at ${shown.map(pauseAt).join(", ").replace(/, ([^,]*)$/, " and $1")}${more}`;
}

/** Where a change can be: "on a layer from 135 to 156", "on layer 156", or "on a layer between 12.66 mm and 14.65 mm". */
function changeRange(swap: FilamentSwap): string {
  const range = swap.pauseLayers;
  if (!range) return `on a layer between ${mm(swap.after)} and ${mm(swap.before)}`;
  return range.first === range.last ? `on layer ${range.first}` : `on a layer from ${range.first} to ${range.last}`;
}

/**
 * The note for a plate that prints with a shared toolhead (a {@link SwapPlan}): which filaments share one, where each
 * prints, the pauses already in place, where the missing ones go, a check of the slice, what to load, and what to set by hand when sending
 * the print, since the printer matches filaments to toolheads by the loaded spool's color and a filament that comes
 * in at a pause isn't loaded yet.
 */
function swapPlanText(plan: SwapPlan, filamentCount: number, mostAtOnce: number): string {
  const layers = plan.shared.every((h) => h.swaps.every((s) => s.pauseLayers !== undefined));
  const one = plan.shared.length === 1 && plan.shared[0]!.filaments.length === 2;
  const sharing = one ? "two of them share a toolhead, with a pause between" : "some of them share a toolhead, with a pause between each change";
  const parts: string[] = [`Plate ${plan.plate} uses ${filamentCount} filaments but no more than ${mostAtOnce} at the same height, so ${sharing}.`];

  // Where each shared toolhead's filaments print.
  const spans = new Map<number, { first?: number; last?: number; from: number; to: number }>();
  for (const head of plan.shared) {
    for (const swap of head.swaps) {
      const out = spans.get(swap.outgoing) ?? { from: NaN, to: swap.after };
      out.to = swap.after;
      if (swap.pauseLayers) out.last = swap.pauseLayers.first - 1;
      spans.set(swap.outgoing, out);
      const next = spans.get(swap.incoming) ?? { from: swap.before, to: NaN };
      next.from = swap.before;
      if (swap.pauseLayers) next.first = swap.pauseLayers.last;
      spans.set(swap.incoming, next);
    }
  }
  const where = (slot: number, position: "first" | "middle" | "last"): string => {
    const span = spans.get(slot)!;
    const up = layers ? `layer ${span.last}` : mm(span.to);
    const from = layers ? `layer ${span.first}` : mm(span.from);
    return position === "first" ? `filament ${slot} prints up to ${up}` : position === "last" ? `filament ${slot} from ${from}` : `filament ${slot} from ${from} to ${up}`;
  };
  const headText = (filaments: readonly number[]) =>
    filaments.map((slot, i) => where(slot, i === 0 ? "first" : i === filaments.length - 1 ? "last" : "middle")).join(filaments.length > 2 ? ", " : " and ").replace(/, (filament \d+ from [^,]*)$/, " and $1");
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  if (one) {
    parts.push(`${capital(headText(plan.shared[0]!.filaments))}`);
  } else {
    plan.shared.forEach((head, i) => {
      parts.push(`${filamentList(head.filaments).replace(/^f/, "F")} share ${i === 0 ? "one" : "another"}: ${headText(head.filaments)}.`);
    });
  }

  // The pauses: in place, or where to add one.
  // In the order they happen, lowest first.
  const swaps = plan.shared.flatMap((h) => h.swaps).sort((a, b) => (a.pauseLayers?.first ?? a.after) - (b.pauseLayers?.first ?? b.after));
  const missing = swaps.filter((s) => s.pauses.length === 0);
  const inPlace = swaps.filter((s) => s.pauses.length > 0);
  if (one) {
    const swap = swaps[0]!;
    if (swap.pauses.length > 0) parts[parts.length - 1] += `, and the project already has ${pausesAt(swap.pauses)}, between the two.`;
    else parts[parts.length - 1] += `. In Snapmaker Orca, add a pause ${changeRange(swap)}.`;
  } else {
    for (const swap of inPlace) parts.push(`The project already has ${pausesAt(swap.pauses)}, between filaments ${swap.outgoing} and ${swap.incoming}.`);
    if (missing.length > 0) {
      const ranges = missing.map((s, i) => `${i === 0 ? "a pause" : "one"} ${changeRange(s)}, between filaments ${s.outgoing} and ${s.incoming}`);
      parts.push(`In Snapmaker Orca, add ${ranges.join(", and ")}.`);
    }
  }
  if (plan.otherPauses.length > 0) parts.push(`The project also has ${pausesAt(plan.otherPauses)}.`);

  // A look at the slice before printing, and why: the numbers come from the file, not a slice, and a new layer height
  // moves the layers (not the heights in mm).
  const look =
    swaps.length === 1
      ? `filament ${swaps[0]!.outgoing} should end below the pause and filament ${swaps[0]!.incoming} start above it.`
      : "at each pause, the filament that is done should end below it and the next one start above it.";
  parts.push(
    layers
      ? `These layer numbers are worked out from the file, not from a slice, so check the sliced preview before you print: ${look} If you change the layer height, the numbers change too.`
      : `These heights are worked out from the file, not from a slice, so check the sliced preview before you print: ${look}`,
  );

  // What to load, and what to set by hand when sending.
  parts.push(`Load ${filamentList(plan.load)} to start.`);
  const later = plan.shared.flatMap((h) => h.filaments.slice(1));
  const onHead = plan.shared.map((h) => `${numberList(h.filaments.slice(1))} on the same toolhead as filament ${h.filaments[0]}`);
  if (later.length === 1) {
    parts.push(`When you send the print, filament ${later[0]} isn't loaded yet, so it can't be matched by its color: put it on the same toolhead as filament ${plan.shared[0]!.filaments[0]} yourself.`);
  } else {
    parts.push(`When you send the print, ${filamentList(later.slice().sort((a, b) => a - b))} aren't loaded yet, so they can't be matched by their color: put ${onHead.join(", and ")}, yourself.`);
  }
  if (swaps.length === 1) parts.push(`At the pause, unload filament ${swaps[0]!.outgoing}, load filament ${swaps[0]!.incoming} and resume.`);
  else parts.push("At each pause, unload the filament that is done, load the next one on that toolhead and resume.");
  return parts.join(" ");
}
