// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitHighlightSegments, formatCompareLayoutNotes } from "./compareHelpers";

describe("splitHighlightSegments", () => {
  it("returns the full text unmatched when query is empty or whitespace", () => {
    assert.deepEqual(splitHighlightSegments("Prime tower", ""), [
      { text: "Prime tower", match: false },
    ]);
    assert.deepEqual(splitHighlightSegments("Prime tower", "   "), [
      { text: "Prime tower", match: false },
    ]);
  });

  it("returns empty array for empty text", () => {
    assert.deepEqual(splitHighlightSegments("", "tower"), []);
  });

  it("matches case-insensitively and preserves original casing", () => {
    assert.deepEqual(splitHighlightSegments("Prime Tower Width", "tower"), [
      { text: "Prime ", match: false },
      { text: "Tower", match: true },
      { text: " Width", match: false },
    ]);
  });

  it("highlights every occurrence in keys and labels", () => {
    assert.deepEqual(splitHighlightSegments("tower_prime_tower", "TOWER"), [
      { text: "tower", match: true },
      { text: "_prime_", match: false },
      { text: "tower", match: true },
    ]);
  });

  it("treats regex metacharacters and HTML markup as literal text", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    assert.deepEqual(splitHighlightSegments(hostile, "<img"), [
      { text: "<img", match: true },
      { text: " src=x onerror=alert(1)>", match: false },
    ]);
    assert.deepEqual(splitHighlightSegments("speed (mm/s)", "(mm/s)"), [
      { text: "speed ", match: false },
      { text: "(mm/s)", match: true },
    ]);
  });
});

describe("formatCompareLayoutNotes", () => {
  it("returns an empty array when no rows have a value layout", () => {
    assert.deepEqual(formatCompareLayoutNotes([{ layout: undefined }, {}], "A.3mf", "B.3mf"), []);
  });

  it("returns a single unlabeled caption when both sides share the same layout", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "u1-hotends", b: "u1-hotends" } }],
      "model-a.3mf",
      "model-b.3mf",
    );
    assert.deepEqual(notes, ["Two values: standard hotend, then Liber High Flow Hotend."]);
  });

  it("labels each caption with its column when A and B use different layouts", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "flow-variants", b: "u1-hotends" } }],
      "Bambu.3mf",
      "0.12mm Standard @Snapmaker U1 (0.4 nozzle)",
    );
    assert.deepEqual(notes, [
      "A (Bambu.3mf): Two values: the original printer's standard nozzle, then its high-flow nozzle.",
      "B (0.12mm Standard @Snapmaker U1 (0.4 nozzle)): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });

  it("labels only the side that has a layout when the other side has none", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { b: "u1-hotends" } }],
      "single.3mf",
      "u1.3mf",
    );
    assert.deepEqual(notes, [
      "B (u1.3mf): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });
});
