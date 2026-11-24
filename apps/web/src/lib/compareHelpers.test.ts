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
    assert.deepEqual(formatCompareLayoutNotes([{ layout: undefined }, {}], "stock"), []);
  });

  it("returns a single unlabeled caption when both sides share the same layout", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "u1-hotends", b: "u1-hotends" } }],
      "file",
    );
    assert.deepEqual(notes, ["Two values: standard hotend, then Liber High Flow Hotend."]);
  });

  it("uses A (your file) and B (stock profile) when comparing against a stock profile", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "flow-variants", b: "u1-hotends" } }],
      "stock",
    );
    assert.deepEqual(notes, [
      "A (your file): Two values: the original printer's standard nozzle, then its high-flow nozzle.",
      "B (stock profile): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });

  it("uses A (your file) and B (your preset) when comparing against a saved preset", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "flow-variants", b: "u1-hotends" } }],
      "preset",
    );
    assert.deepEqual(notes, [
      "A (your file): Two values: the original printer's standard nozzle, then its high-flow nozzle.",
      "B (your preset): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });

  it("uses A (first file) and B (second file) when comparing two files", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { a: "flow-variants", b: "u1-hotends" } }],
      "file",
    );
    assert.deepEqual(notes, [
      "A (first file): Two values: the original printer's standard nozzle, then its high-flow nozzle.",
      "B (second file): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });

  it("labels only the side that has a layout when the other side has none", () => {
    const notes = formatCompareLayoutNotes(
      [{ layout: { b: "u1-hotends" } }],
      "file",
    );
    assert.deepEqual(notes, [
      "B (second file): Two values: standard hotend, then Liber High Flow Hotend.",
    ]);
  });
});
