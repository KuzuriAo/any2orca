// SPDX-License-Identifier: MIT
/**
 * How a plate with more filaments than the printer has toolheads can print on them: which filaments share a
 * toolhead, one after the other, and where the pause for each change belongs.
 *
 * A plate fits when no more than `toolheads` filaments are needed at the same height. Taking the filaments by the
 * layer they start on, each takes a toolhead no filament has used yet, or else the one whose filament finished
 * first (the widest gap for the pause); taken in that order, one is always free when the plate fits. A toolhead that
 * prints two filaments needs the print to stop between them: the user unloads the first and loads the next. On the
 * U1 the pause is written as `M600` and the U1 purges and primes the new filament on the prime tower by itself.
 *
 * The plan says which of the plate's pauses fall where a change belongs, and lists the others; it doesn't judge them.
 * It never changes the file: every filament keeps its number, color and order.
 */
import type { PlateFilaments, PlatePause } from "./archive/plateFilaments.js";

/** One change on a shared toolhead: the filament that is done, the one that comes next, and where the pause goes. */
export interface FilamentSwap {
  /** The filament the toolhead prints first; unload it at the pause. */
  outgoing: number;
  /** The filament it prints next; load it at the pause. */
  incoming: number;
  /** The outgoing filament's highest point, in mm above the plate. */
  after: number;
  /** The incoming filament's lowest point, in mm above the plate. */
  before: number;
  /**
   * The layers a pause can be set on for this change, counting from 1 as Snapmaker Orca's layer slider does: from the
   * one after the outgoing filament's last layer to the incoming filament's first (a pause on a layer stops the print
   * before it). Absent when the plate's layers can't be worked out from the file; `after` and `before` then say where.
   */
  pauseLayers?: { first: number; last: number };
  /** The plate's pauses that fall between the two, lowest first: the change can happen at any of them. */
  pauses: PlatePause[];
}

/** A toolhead that prints more than one filament. */
export interface SharedToolhead {
  /** Its filaments, in the order it prints them. */
  filaments: number[];
  /** Each change, in order: one fewer than `filaments`. */
  swaps: FilamentSwap[];
}

/** How a plate prints with more filaments than toolheads. */
export interface SwapPlan {
  /** The plate's number, from 1. */
  plate: number;
  /** The filaments to load before printing, one per toolhead used, in filament order. */
  load: number[];
  /** Each toolhead that prints more than one filament, in the order of the first filament each loads. */
  shared: SharedToolhead[];
  /** The plate's pauses that fall between no shared toolhead's two filaments, lowest first. */
  otherPauses: PlatePause[];
}

/** A filament's span on the plate, in layers when the plate's layers are known, in steps of the layer height otherwise. */
interface Span {
  slot: number;
  start: number;
  end: number;
  from: number;
  to: number;
}

/**
 * The plan for one plate, or null when it needs none (no more filaments than toolheads) or has none (more than
 * `toolheads` needed at the same height, which no plan can print).
 *
 * @param plate one entry of `inspection.plateFilaments` or `report.plateFilaments`; one that prints object by object
 *   has no plan, since the slicer applies no pauses then
 * @param toolheads how many filaments the printer prints with at a time
 * @param layerHeight the layer height, used to compare heights when the plate's layers aren't known (they are known
 *   whenever the filaments have `firstLayer`)
 */
export function planFilamentSwaps(plate: PlateFilaments, toolheads: number, layerHeight = 0.2): SwapPlan | null {
  const { filaments } = plate;
  if (plate.byObject || !Number.isInteger(toolheads) || toolheads < 1 || filaments.length <= toolheads || plate.mostAtOnce > toolheads) return null;
  const layers = filaments.every((f) => f.firstLayer !== undefined && f.lastLayer !== undefined);
  const step = layerHeight > 0 ? layerHeight : 0.2;
  // The same spans the plate's "most at once" counts: a filament reaches every layer its range reaches into.
  const spans: Span[] = filaments.map((f) => {
    if (layers) return { slot: f.slot, start: f.firstLayer!, end: f.lastLayer!, from: f.from, to: f.to };
    const start = Math.floor(f.from / step + 1e-6);
    return { slot: f.slot, start, end: Math.max(start, Math.ceil(f.to / step - 1e-6) - 1), from: f.from, to: f.to };
  });
  spans.sort((a, b) => a.start - b.start || a.slot - b.slot);

  const heads: Span[][] = [];
  for (const span of spans) {
    let best: Span[] | undefined;
    if (heads.length < toolheads) {
      best = [];
      heads.push(best);
    } else {
      for (const head of heads) {
        const last = head[head.length - 1]!;
        if (last.end < span.start && (!best || last.end < best[best.length - 1]!.end)) best = head;
      }
    }
    // Not even with the plate's own count: its layers and its "most at once" disagree, so there is no plan to give.
    if (!best) return null;
    best.push(span);
  }

  const pauses = plate.pauses ?? [];
  const used = new Set<PlatePause>();
  const shared: SharedToolhead[] = heads
    .filter((head) => head.length > 1)
    .map((head) => ({
      filaments: head.map((s) => s.slot),
      swaps: head.slice(1).map((next, i): FilamentSwap => {
        const prev = head[i]!;
        const between = pauses.filter((p) =>
          layers && p.stopsBefore !== undefined
            ? p.stopsBefore > prev.end && p.stopsBefore <= next.start
            : // Without layers: a pause stops before the layer it is at, so it must sit a layer above the outgoing filament's top.
              p.height >= prev.to + step - 1e-6 && p.height <= next.from + step + 1e-6,
        );
        for (const p of between) used.add(p);
        return {
          outgoing: prev.slot,
          incoming: next.slot,
          after: prev.to,
          before: next.from,
          ...(layers ? { pauseLayers: { first: prev.end + 1, last: next.start } } : {}),
          pauses: between,
        };
      }),
    }));
  return {
    plate: plate.plate,
    load: heads.map((head) => head[0]!.slot).sort((a, b) => a - b),
    shared,
    otherPauses: pauses.filter((p) => !used.has(p)),
  };
}
