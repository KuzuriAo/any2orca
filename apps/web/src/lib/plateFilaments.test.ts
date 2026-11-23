// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NEUTRAL_SWATCH,
  U1_TOOLHEADS,
  formatSwapPauseRange,
  formatSwapPauseStatus,
  plateFilamentSummary,
  swatchColor,
} from "./plateFilaments";

const uses = (n: number) => Array.from({ length: n }, (_, i) => ({ slot: i + 1, uses: ["object" as const], from: 0, to: 10 }));

describe("plateFilamentSummary", () => {
  it("returns null while the plate fits on the U1's toolheads", () => {
    assert.equal(plateFilamentSummary({ filaments: uses(1), mostAtOnce: 1 }, U1_TOOLHEADS), null);
    assert.equal(plateFilamentSummary({ filaments: uses(4), mostAtOnce: 4 }, U1_TOOLHEADS), null);
  });

  it("marks a plate with more than four filaments that never overlap more than four at once", () => {
    assert.deepEqual(plateFilamentSummary({ filaments: uses(5), mostAtOnce: 3 }, U1_TOOLHEADS), {
      kind: "needs-changes",
      text: "5 filaments, 3 at the same height: prints with filament changes at pauses",
    });
  });

  it("marks a plate that needs more than four filaments at the same height", () => {
    assert.deepEqual(plateFilamentSummary({ filaments: uses(5), mostAtOnce: 5 }, U1_TOOLHEADS), {
      kind: "too-many-at-once",
      text: "Needs 5 filaments at the same height; the U1 prints with 4",
    });
  });
});

describe("swap plan formatting", () => {
  it("formats pause layer ranges and single-layer windows", () => {
    assert.equal(
      formatSwapPauseRange({ after: 5, before: 20, pauseLayers: { first: 26, last: 100 } }),
      "pause on a layer from 26 to 100",
    );
    assert.equal(
      formatSwapPauseRange({ after: 5, before: 5.2, pauseLayers: { first: 26, last: 26 } }),
      "pause on layer 26",
    );
  });

  it("falls back to mm heights when layer numbers are unavailable", () => {
    assert.equal(
      formatSwapPauseRange({ after: 5, before: 20 }),
      "pause between 5 mm and 20 mm",
    );
    assert.equal(
      formatSwapPauseRange({ after: 5.25, before: 12.5 }),
      "pause between 5.25 mm and 12.5 mm",
    );
  });

  it("formats existing pauses and missing-pause status", () => {
    assert.equal(formatSwapPauseStatus({ pauses: [] }), "add a pause in Snapmaker Orca");
    assert.equal(
      formatSwapPauseStatus({ pauses: [{ height: 12, layer: 60, stopsBefore: 60, kind: "pause" }] }),
      "already at layer 60",
    );
    assert.equal(
      formatSwapPauseStatus({
        pauses: [
          { height: 10, layer: 50, stopsBefore: 50, kind: "pause" },
          { height: 12, layer: 60, stopsBefore: 60, kind: "pause" },
        ],
      }),
      "already at layers 50 and 60",
    );
    assert.equal(
      formatSwapPauseStatus({ pauses: [{ height: 12, kind: "pause" }] }),
      "already at 12 mm",
    );
  });
});

describe("swatchColor", () => {
  it("accepts plain 3-, 6- and 8-digit hex colors", () => {
    assert.equal(swatchColor("#abc"), "#abc");
    assert.equal(swatchColor("#0056B8"), "#0056B8");
    assert.equal(swatchColor("#0056B8FF"), "#0056B8FF");
  });

  it("falls back to neutral gray for anything else, including style injection attempts", () => {
    assert.equal(swatchColor(undefined), NEUTRAL_SWATCH);
    assert.equal(swatchColor(""), NEUTRAL_SWATCH);
    assert.equal(swatchColor("red"), NEUTRAL_SWATCH);
    assert.equal(swatchColor("#000000; background-image: url(https://evil.example)"), NEUTRAL_SWATCH);
    assert.equal(swatchColor("#12345"), NEUTRAL_SWATCH);
  });
});
