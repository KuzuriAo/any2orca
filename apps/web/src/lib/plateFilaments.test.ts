// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NEUTRAL_SWATCH, plateFilamentSummary, swatchColor, U1_TOOLHEADS } from "./plateFilaments";

const uses = (count: number) => Array.from({ length: count }, (_, i) => ({ slot: i + 1, uses: ["object"], from: 0, to: 10 }));

describe("plateFilamentSummary", () => {
  it("says nothing for a plate the U1 prints with what it has loaded", () => {
    assert.equal(plateFilamentSummary({ filaments: uses(4), mostAtOnce: 4 }, U1_TOOLHEADS), null);
    assert.equal(plateFilamentSummary({ filaments: uses(1), mostAtOnce: 1 }, U1_TOOLHEADS), null);
    assert.equal(plateFilamentSummary({ filaments: [], mostAtOnce: 0 }, U1_TOOLHEADS), null);
  });

  it("marks a plate that needs more filaments at the same height than the U1 prints with", () => {
    assert.deepEqual(plateFilamentSummary({ filaments: uses(6), mostAtOnce: 5 }, U1_TOOLHEADS), {
      kind: "too-many-at-once",
      text: "Needs 5 filaments at the same height; the U1 prints with 4",
    });
  });

  it("marks a plate with more filaments than toolheads, never more than four at once, as printing with filament changes", () => {
    assert.deepEqual(plateFilamentSummary({ filaments: uses(6), mostAtOnce: 2 }, U1_TOOLHEADS), {
      kind: "needs-changes",
      text: "6 filaments, 2 at the same height: prints with filament changes at pauses",
    });
  });
});

describe("swatchColor", () => {
  it("keeps a plain hex color", () => {
    assert.equal(swatchColor("#0056B8"), "#0056B8");
    assert.equal(swatchColor("#abc"), "#abc");
    assert.equal(swatchColor("#0056B8FF"), "#0056B8FF");
  });

  const unsafe: Array<[string, string | undefined]> = [
    ["a missing color", undefined],
    ["an empty one", ""],
    ["a named color", "red"],
    ["a value that carries more style", "#000; position: fixed; inset: 0"],
    ["a value that names a URL", "#000 url(https://example.com/x.png)"],
    ["a hex color of another length", "#12345"],
  ];
  for (const [what, value] of unsafe) {
    it(`gives a neutral gray for ${what}`, () => {
      assert.equal(swatchColor(value), NEUTRAL_SWATCH);
    });
  }
});
