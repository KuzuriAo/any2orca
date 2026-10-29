// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  compareStrings,
  nextSortState,
  ariaSortValue,
  sortPresetChanges,
  parseNumericValue,
  isUncomparable,
  type SortState,
  type PresetSortColumn,
} from "./tableSort";
import type { PresetChange } from "./presetsEngine";

describe("tableSort", () => {
  describe("compareValues", () => {
    it("sorts plain text in both directions", () => {
      const items = ["linear", "Gyroid", "grid", "adaptive"];
      const asc = [...items].sort((a, b) => compareValues(a, b, "asc"));
      const desc = [...items].sort((a, b) => compareValues(a, b, "desc"));

      assert.deepEqual(asc, ["adaptive", "grid", "Gyroid", "linear"]);
      assert.deepEqual(desc, ["linear", "Gyroid", "grid", "adaptive"]);
    });

    it("sorts numbers with units numerically in both directions", () => {
      const items = ["200 mm/s", "50 mm/s", "15%", "100 mm/s", "0.2 mm"];
      const asc = [...items].sort((a, b) => compareValues(a, b, "asc"));
      const desc = [...items].sort((a, b) => compareValues(a, b, "desc"));

      assert.deepEqual(asc, ["0.2 mm", "15%", "50 mm/s", "100 mm/s", "200 mm/s"]);
      assert.deepEqual(desc, ["200 mm/s", "100 mm/s", "50 mm/s", "15%", "0.2 mm"]);
    });

    it("sends empty or uncomparable values to the end in both directions", () => {
      const items = ["", "100 mm/s", null, "50 mm/s", "   ", undefined];

      const asc = [...items].sort((a, b) => compareValues(a, b, "asc"));
      const desc = [...items].sort((a, b) => compareValues(a, b, "desc"));

      // The comparable numbers must be ordered first in both directions
      assert.equal(asc[0], "50 mm/s");
      assert.equal(asc[1], "100 mm/s");
      // Remaining 4 items must all be uncomparable
      assert.ok(isUncomparable(asc[2]));
      assert.ok(isUncomparable(asc[3]));
      assert.ok(isUncomparable(asc[4]));
      assert.ok(isUncomparable(asc[5]));

      assert.equal(desc[0], "100 mm/s");
      assert.equal(desc[1], "50 mm/s");
      assert.ok(isUncomparable(desc[2]));
      assert.ok(isUncomparable(desc[3]));
      assert.ok(isUncomparable(desc[4]));
      assert.ok(isUncomparable(desc[5]));
    });

    it("sorts mixed columns by falling back to natural text comparison", () => {
      const items = ["100 mm/s", "auto", "", "50 mm/s", "default"];
      const asc = [...items].sort((a, b) => compareValues(a, b, "asc"));
      const desc = [...items].sort((a, b) => compareValues(a, b, "desc"));

      // Empty string must be at the end in both directions
      assert.equal(asc[asc.length - 1], "");
      assert.equal(desc[desc.length - 1], "");

      // In asc, comparable items are sorted as text/numbers fallback
      assert.ok(asc.indexOf("auto") < asc.indexOf(""));
      assert.ok(desc.indexOf("auto") < desc.indexOf(""));
    });
  });

  describe("nextSortState and ariaSortValue", () => {
    it("cycles through asc -> desc -> default", () => {
      let state: SortState<PresetSortColumn> = { column: "default", direction: "asc" };

      state = nextSortState(state, "param");
      assert.deepEqual(state, { column: "param", direction: "asc" });
      assert.equal(ariaSortValue(state, "param"), "ascending");
      assert.equal(ariaSortValue(state, "stock"), "none");

      state = nextSortState(state, "param");
      assert.deepEqual(state, { column: "param", direction: "desc" });
      assert.equal(ariaSortValue(state, "param"), "descending");

      state = nextSortState(state, "param");
      assert.deepEqual(state, { column: "default", direction: "asc" });
      assert.equal(ariaSortValue(state, "param"), "none");
    });

    it("switches to asc when a different column is clicked", () => {
      let state: SortState<PresetSortColumn> = { column: "param", direction: "desc" };
      state = nextSortState(state, "stock");
      assert.deepEqual(state, { column: "stock", direction: "asc" });
    });
  });

  describe("sortPresetChanges", () => {
    const changes: PresetChange[] = [
      { key: "outer_wall_speed", label: "Outer wall", stock: "200 mm/s", yours: "300 mm/s", aboveStock: true },
      { key: "inner_wall_speed", label: "Inner wall", stock: "250 mm/s", yours: "250 mm/s", aboveStock: false },
      { key: "sparse_infill_density", label: "Sparse infill", stock: "15%", yours: "20%", aboveStock: false },
      { key: "sparse_infill_pattern", label: "Sparse infill", stock: "grid", yours: "gyroid", aboveStock: false },
    ];

    it("returns a copy in original engine order when column is default", () => {
      const sorted = sortPresetChanges(changes, "default");
      assert.deepEqual(sorted.map((c) => c.key), [
        "outer_wall_speed",
        "inner_wall_speed",
        "sparse_infill_density",
        "sparse_infill_pattern",
      ]);
    });

    it("sorts by Setting Parameter with label primary and key as tie-break", () => {
      const asc = sortPresetChanges(changes, "param", "asc");
      assert.deepEqual(asc.map((c) => c.key), [
        "inner_wall_speed",
        "outer_wall_speed",
        "sparse_infill_density", // tie broken by key: sparse_infill_density < sparse_infill_pattern
        "sparse_infill_pattern",
      ]);

      const desc = sortPresetChanges(changes, "param", "desc");
      assert.deepEqual(desc.map((c) => c.key), [
        "sparse_infill_pattern", // tie broken by key: sparse_infill_pattern > sparse_infill_density
        "sparse_infill_density",
        "outer_wall_speed",
        "inner_wall_speed",
      ]);
    });

    it("sorts by stock column numerically", () => {
      const asc = sortPresetChanges(changes, "stock", "asc");
      assert.equal(asc[0].key, "sparse_infill_density"); // 15%
      assert.equal(asc[1].key, "outer_wall_speed"); // 200 mm/s
      assert.equal(asc[2].key, "inner_wall_speed"); // 250 mm/s
      assert.equal(asc[3].key, "sparse_infill_pattern"); // text "grid"

      const desc = sortPresetChanges(changes, "stock", "desc");
      assert.equal(desc[0].key, "sparse_infill_pattern"); // "grid" (falls back to text compare, or numbers first)
      assert.equal(desc[1].key, "inner_wall_speed"); // 250 mm/s
      assert.equal(desc[2].key, "outer_wall_speed"); // 200 mm/s
      assert.equal(desc[3].key, "sparse_infill_density"); // 15%
    });

    it("sorts by yours column numerically", () => {
      const asc = sortPresetChanges(changes, "yours", "asc");
      assert.equal(asc[0].key, "sparse_infill_density"); // 20%
      assert.equal(asc[1].key, "inner_wall_speed"); // 250 mm/s
      assert.equal(asc[2].key, "outer_wall_speed"); // 300 mm/s
      assert.equal(asc[3].key, "sparse_infill_pattern"); // "gyroid"
    });

    it("preserves above-stock attributes and row count without mutating input", () => {
      const copy = [...changes];
      const sorted = sortPresetChanges(changes, "yours", "desc");
      assert.equal(sorted.length, changes.length);
      assert.deepEqual(changes, copy);

      const aboveStockRow = sorted.find((r) => r.key === "outer_wall_speed");
      assert.ok(aboveStockRow?.aboveStock);
    });
  });
});

