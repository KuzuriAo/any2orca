// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { visitPaintLeaves } from "./paintColor.js";

/** Every leaf of a paint tree on a triangle whose corners are at z 0, 10 and 20. */
function leaves(code: string): { ok: boolean; seen: Array<[filament: number, zMin: number, zMax: number]> } {
  const seen: Array<[number, number, number]> = [];
  const ok = visitPaintLeaves(code, 0, 10, 20, (filament, zMin, zMax) => seen.push([filament, zMin, zMax]));
  return { ok, seen };
}

describe("a triangle's paint", () => {
  // The values Bambu Studio and Snapmaker Orca write for a whole triangle in one filament.
  it.each([
    ["0", 0],
    ["4", 1],
    ["8", 2],
    ["0C", 3],
    ["1C", 4],
    ["2C", 5],
    ["DC", 16],
    ["EC", 17],
    // Past 17 the number continues in further digits: each F adds 15.
    ["0FC", 18],
    ["1FC", 19],
    ["0FFC", 33],
  ])("reads %s as filament %i over the whole triangle", (code, filament) => {
    expect(leaves(code)).toEqual({ ok: true, seen: [[filament, 0, 20]] });
  });

  it("reads lowercase digits too", () => {
    expect(leaves("ec").seen).toEqual([[17, 0, 20]]);
  });

  it("reads a triangle split on two sides, last child first, each child with its own height", () => {
    // Filament 1 at the first corner, filament 2 on the rest (what the slicer writes for two colors on one face).
    expect(leaves("4882")).toEqual({
      ok: true,
      seen: [
        [2, 10, 20],
        [2, 5, 10],
        [1, 0, 10],
      ],
    });
  });

  it("reads a triangle split on one side from the special side's corner", () => {
    // Node 5: one side split, special side 1, so the corners are taken from the second: 10, 20, 0; the split edge's middle is at 10.
    expect(leaves("485")).toEqual({
      ok: true,
      seen: [
        [2, 0, 10],
        [1, 10, 20],
      ],
    });
  });

  it("reads the slicer's own three-color example, a split inside a split", () => {
    const { ok, seen } = leaves("1C0C2C0C1C13");
    expect(ok).toBe(true);
    expect(seen.map(([filament]) => filament)).toEqual([4, 3, 5, 3, 4]);
    // The middle triangle of a three-side split lies between the three midpoints: z 5, 15 and 10.
    expect(seen.slice(0, 2).every(([, zMin, zMax]) => zMin >= 5 && zMax <= 15)).toBe(true);
  });

  it("keeps a height that isn't known unknown", () => {
    const seen: number[][] = [];
    expect(visitPaintLeaves("4", NaN, 1, 2, (...leaf) => seen.push(leaf))).toBe(true);
    expect(seen).toEqual([[1, NaN, NaN]]);
  });

  it.each([
    ["an empty value", ""],
    ["a digit that isn't hex", "G"],
    ["a split with no children", "3"],
    ["a split with too few children", "42"],
    ["a leaf that says more digits follow and has none", "C"],
    ["a number that never ends", `${"F".repeat(60)}C`],
    ["a tree deeper than any the slicer makes", "1".repeat(200)],
  ])("says %s doesn't decode", (_, code) => {
    expect(leaves(code).ok).toBe(false);
  });

  it("stops at a crafted tree's cap without running out of stack", () => {
    const start = performance.now();
    expect(leaves("1".repeat(2_000_000)).ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
