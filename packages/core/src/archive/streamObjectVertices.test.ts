// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { objectWorldBboxXY } from "./objectWorldBboxXY.js";
import { parseVertices } from "./parseVertices.js";
import { forEachObjectVertex, LARGE_PART_BYTES } from "./streamObjectVertices.js";
import type { Vec3 } from "./transform.js";

const encode = (s: string) => new TextEncoder().encode(s);

function object(id: string, verts: Vec3[], name = "part"): string {
  const vs = verts.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("\n");
  return `<object id="${id}" name="${name}" type="model"><mesh><vertices>\n${vs}\n</vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>`;
}

function verts(n: number, seed: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => [((i * 37 + seed) % 211) - 100.5, ((i * 53 + seed) % 197) - 90.25, (i % 13) * 0.2] as Vec3);
}

// Object 10 comes first so a search for id "1" must not stop at id "10"; the names hold multi-byte characters.
const PART = `<?xml version="1.0" encoding="UTF-8"?>\n<model><resources>${object("10", verts(40, 7), "Pokéball ✨")}${object("1", verts(300, 3), "Frieren 魔法")}${object("2", verts(25, 11))}</resources></model>`;

function viaWholeText(text: string, id: string): Vec3[] {
  const block = new RegExp(`<object id="${id}"[^>]*>[\\s\\S]*?</object>`).exec(text)?.[0] ?? "";
  return parseVertices(block);
}

describe("forEachObjectVertex", () => {
  it("finds the same vertices as decoding the whole file, at any chunk size", () => {
    const bytes = encode(PART);
    for (const id of ["1", "10", "2", "missing"]) {
      const expected = viaWholeText(PART, id);
      for (const chunk of [1, 2, 3, 7, 13, 64, 509, 4096, bytes.length]) {
        const seen: Vec3[] = [];
        const closed = forEachObjectVertex(bytes, id, (v) => seen.push(v), chunk);
        expect(closed ? seen : [], `object ${id}, ${chunk}-byte chunks`).toEqual(expected);
      }
    }
  });

  it("matches the whole-file path on malformed objects: unclosed, and a vertex inside the opening tag", () => {
    const cases = [
      '<object id="10"><vertex x="3" y="4" z="5"/> no closing tag',
      '<object id="1"<vertex x="1.5" y="-2" z="0"/>><vertex x="2" y="2" z="2"/></object>',
      '</object><object id="1"\n<vertex x="9" y="9" z="9"/></vertices>',
    ];
    for (const text of cases) {
      const bytes = encode(text);
      for (const id of ["1", "10"]) {
        for (const chunk of [1, 5, 17, bytes.length]) {
          const seen: Vec3[] = [];
          const closed = forEachObjectVertex(bytes, id, (v) => seen.push(v), chunk);
          expect(closed ? seen : [], `${text} / ${id} / ${chunk}`).toEqual(viaWholeText(text, id));
        }
      }
    }
  });
});

describe("objectWorldBboxXY with a part file too large to decode in one piece", () => {
  it("scans it in chunks and gives the true bounding box", () => {
    // One object whose vertices fill more than LARGE_PART_BYTES, with known extremes placed in the middle.
    const filler = `<vertex x="1" y="1" z="0"/>\n`.repeat(Math.ceil(LARGE_PART_BYTES / 28) + 1000);
    const extremes = `<vertex x="-42.5" y="7" z="0"/>\n<vertex x="99.25" y="-3" z="0"/>\n<vertex x="0" y="120" z="0"/>\n`;
    const half = filler.length / 2;
    const part = encode(`<model><resources><object id="1" type="model"><mesh><vertices>\n${filler.slice(0, half)}${extremes}${filler.slice(half)}</vertices></mesh></object></resources></model>`);
    expect(part.length).toBeGreaterThan(LARGE_PART_BYTES);
    const top = `<model><resources><object id="5" type="model"><components><component p:path="/3D/Objects/big.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 10 20 0"/></components></object></resources><build><item objectid="5" transform="1 0 0 0 1 0 0 0 1 100 100 0"/></build></model>`;
    const bbox = objectWorldBboxXY("5", top, new Map(), { "3D/Objects/big.model": part });
    expect(bbox).toEqual([-42.5 + 110, 99.25 + 110, -3 + 120, 120 + 120]);
  });
});
