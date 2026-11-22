// SPDX-License-Identifier: MIT
/**
 * A triangle's `paint_color` attribute: which filaments are painted on it, and at what heights.
 *
 * The slicer lets a painted triangle be split, again and again, into smaller ones, each with its own filament. The
 * attribute is that tree, written as hex digits with the first digit read last. Each digit is one node: its low two
 * bits say how many sides are split (0 for a leaf). A leaf's high two bits are its filament (0 = not painted, 1, 2),
 * or 3 for "more digits follow": each further digit adds 15 while it is F, and the last one plus 3 is the filament.
 * A split node's high two bits say which side is special; its two, three or four children follow, last child first.
 *
 * The file is untrusted, so the walk is bounded: the digits end, the depth is capped, and a tree that doesn't decode
 * is reported as such rather than guessed at.
 */

/** Deeper than any tree the slicer makes: each level halves the edges, and it stops near 0.1 mm. */
const MAX_DEPTH = 48;
/** The most "F" digits a leaf may chain: filament numbers past 300 don't exist. */
const MAX_EXTENSIONS = 20;

/** Called for every leaf: its filament (0 = not painted) and the lowest and highest z of its triangle. */
export type PaintLeafVisitor = (filament: number, zMin: number, zMax: number) => void;

function hexDigit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
}

// One walk at a time (the walk is synchronous), kept here rather than in closures made for every triangle: a
// painted model has millions of them.
let digits = "";
let at = -1;
let visitLeaf: PaintLeafVisitor = () => {};

function nextDigit(): number {
  return at < 0 ? -1 : hexDigit(digits.charCodeAt(at--));
}

function walk(a: number, b: number, c: number, depth: number): boolean {
  const node = nextDigit();
  if (node < 0) return false;
  const splitSides = node & 0b11;
  if (splitSides === 0) {
    let filament = node >> 2;
    if (filament === 3) {
      let digit = nextDigit();
      let chained = 0;
      while (digit === 15) {
        if (++chained > MAX_EXTENSIONS) return false;
        digit = nextDigit();
      }
      if (digit < 0) return false;
      filament = digit + 15 * chained + 3;
    }
    visitLeaf(filament, Math.min(a, b, c), Math.max(a, b, c));
    return true;
  }
  if (depth >= MAX_DEPTH) return false;
  // The corners, starting at the special side.
  const special = (node >> 2) % 3;
  const v0 = special === 0 ? a : special === 1 ? b : c;
  const v1 = special === 0 ? b : special === 1 ? c : a;
  const v2 = special === 0 ? c : special === 1 ? a : b;
  // A midpoint's z is the mean of its edge's ends. Children are stored last first.
  if (splitSides === 1) {
    const m12 = (v1 + v2) / 2;
    return walk(m12, v2, v0, depth + 1) && walk(v0, v1, m12, depth + 1);
  }
  const m01 = (v0 + v1) / 2;
  const m02 = (v0 + v2) / 2;
  if (splitSides === 2) {
    return walk(v1, v2, m02, depth + 1) && walk(m01, v1, m02, depth + 1) && walk(v0, m01, m02, depth + 1);
  }
  const m12 = (v1 + v2) / 2;
  return walk(m01, m12, m02, depth + 1) && walk(m12, v2, m02, depth + 1) && walk(m01, v1, m12, depth + 1) && walk(v0, m01, m02, depth + 1);
}

/**
 * Walks one triangle's paint tree, given the z of its three corners in the order the triangle lists them.
 * Returns false when the attribute doesn't decode (a digit that isn't hex, too few digits, too deep); leaves
 * visited before that point were real, and the caller decides what to do with the rest of the triangle.
 * `visit` must not start another walk.
 */
export function visitPaintLeaves(code: string, z1: number, z2: number, z3: number, visit: PaintLeafVisitor): boolean {
  digits = code;
  at = code.length - 1;
  visitLeaf = visit;
  return walk(z1, z2, z3, 0);
}
