// SPDX-License-Identifier: AGPL-3.0-or-later
import { valueLayoutNotes, type ValueLayout } from "any2orca";

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split `text` into plain-text and matched segments for case-insensitive
 * search highlighting. Returns plain strings only so callers can render
 * `<mark>` elements safely without HTML injection.
 */
export function splitHighlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = query.trim();
  if (!needle || !text) {
    return text ? [{ text, match: false }] : [];
  }

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerNeedle, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), match: false });
    }
    segments.push({ text: text.slice(idx, idx + needle.length), match: true });
    cursor = idx + needle.length;
  }

  return segments;
}

export interface LayoutRowLike {
  layout?: Partial<Record<"a" | "b" | string, ValueLayout>>;
}

export type CompareTargetKind = "stock" | "preset" | "file";

/**
 * Format "Two values: ..." layout captions for a Compare group table.
 * When both columns share a layout, return one unlabeled caption.
 * When a layout appears on only one column, label it with a short column name:
 * - B is stock profile: "A (your file)" / "B (stock profile)"
 * - B is saved preset:  "A (your file)" / "B (your preset)"
 * - B is second file:   "A (first file)" / "B (second file)"
 */
export function formatCompareLayoutNotes(
  rows: Iterable<LayoutRowLike>,
  bKind: CompareTargetKind,
): string[] {
  const rowList = Array.from(rows);
  const aNotes = valueLayoutNotes(
    rowList.map((r) => ({ layout: r.layout?.a ? { a: r.layout.a } : undefined })),
  );
  const bNotes = valueLayoutNotes(
    rowList.map((r) => ({ layout: r.layout?.b ? { b: r.layout.b } : undefined })),
  );

  const aPrefix = bKind === "file" ? "A (first file)" : "A (your file)";
  const bPrefix =
    bKind === "file"
      ? "B (second file)"
      : bKind === "preset"
        ? "B (your preset)"
        : "B (stock profile)";

  const aSet = new Set(aNotes);
  const bSet = new Set(bNotes);
  const result: string[] = [];

  for (const note of aNotes) {
    if (bSet.has(note)) {
      result.push(note);
    } else {
      result.push(`${aPrefix}: ${note}`);
    }
  }

  for (const note of bNotes) {
    if (!aSet.has(note)) {
      result.push(`${bPrefix}: ${note}`);
    }
  }

  return result;
}
