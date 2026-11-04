// SPDX-License-Identifier: MIT
/**
 * PrusaSlicer keeps an object's parts and modifiers as triangle ranges of one
 * mesh; the Bambu Studio family keeps each part as a mesh object of its own,
 * referenced by the object's components. A PrusaSlicer object with several
 * parts (the usual way a multi-color model is built there: one part per
 * filament) is split here into that layout, so each part keeps its filament,
 * its settings and its painting.
 *
 * Text in, text out: the vertex and triangle tags are copied as written
 * (painting attributes included), only the vertex indices are renumbered, and
 * each part gets the vertices it uses. PrusaSlicer writes the vertices already
 * in the object's coordinates, so every component sits at identity.
 */
import type { PrusaObject, PrusaVolume } from "./modelConfig.js";

/** Past this, the split is skipped and the object kept as one part: the tag arrays would be the memory problem. */
const MAX_TRIANGLES = 4_000_000;
const IDENTITY = "1 0 0 0 1 0 0 0 1 0 0 0";

export interface SplitPart {
  /** The new mesh object's id. */
  id: number;
  volume: PrusaVolume;
}

export interface SplitResult {
  text: string;
  /** For each object that was split, its parts in volume order. */
  parts: Map<number, SplitPart[]>;
}

/** The `<object id="N" ...>...</object>` block's bounds in `text`, or null. */
function objectBounds(text: string, id: number): [number, number] | null {
  let from = 0;
  for (;;) {
    const start = text.indexOf(`<object id="${id}"`, from);
    if (start === -1) return null;
    const next = text[start + `<object id="${id}"`.length];
    if (next === " " || next === ">" || next === "\t" || next === "\n") {
      const end = text.indexOf("</object>", start);
      return end === -1 ? null : [start, end + "</object>".length];
    }
    from = start + 1;
  }
}

function renumber(tag: string, map: Int32Array): string {
  return tag.replace(/\b(v[123])="(\d+)"/g, (_, name: string, index: string) => `${name}="${map[Number(index)]}"`);
}

export function splitMultiPartObjects(text: string, objects: readonly PrusaObject[], warnings: string[]): SplitResult {
  const parts = new Map<number, SplitPart[]>();
  let nextId = 0;
  for (const m of text.matchAll(/<object id="(\d{1,9})"/g)) nextId = Math.max(nextId, Number(m[1]));
  nextId++;

  for (const object of objects) {
    if (object.volumes.length < 2) continue;
    const bounds = objectBounds(text, object.id);
    if (!bounds) continue;
    const block = text.slice(bounds[0], bounds[1]);
    if (block.includes("<component")) continue;

    const vertices = [...block.matchAll(/<vertex\b[^>]*\/>/g)].map((m) => m[0]);
    const triangles = [...block.matchAll(/<triangle\b[^>]*\/>/g)].map((m) => m[0]);
    const corners = triangles.map((tag) => {
      const v1 = /\bv1="(\d+)"/.exec(tag);
      const v2 = /\bv2="(\d+)"/.exec(tag);
      const v3 = /\bv3="(\d+)"/.exec(tag);
      return v1 && v2 && v3 ? [Number(v1[1]), Number(v2[1]), Number(v3[1])] : null;
    });
    const ranges = object.volumes.map((v) => [v.firstTriangle, v.lastTriangle] as const);
    const contiguous =
      ranges.every(([a, b], i) => a <= b && (i === 0 ? a === 0 : a === ranges[i - 1][1] + 1)) && ranges[ranges.length - 1][1] === triangles.length - 1;
    const wellFormed = corners.every((c) => c !== null && c.every((i) => i < vertices.length));
    if (!contiguous || !wellFormed || triangles.length > MAX_TRIANGLES) {
      warnings.push(`  WARN: "${object.name || `Object ${object.id}`}" has ${object.volumes.length} parts whose mesh couldn't be split, so it's converted as one part on its own filament.`);
      continue;
    }

    const map = new Int32Array(vertices.length).fill(-1);
    const pieces: string[] = [];
    const split: SplitPart[] = [];
    for (const volume of object.volumes) {
      const id = nextId++;
      map.fill(-1);
      const ownVertices: string[] = [];
      const ownTriangles: string[] = [];
      for (let t = volume.firstTriangle; t <= volume.lastTriangle; t++) {
        for (const index of corners[t]!) {
          if (map[index] === -1) {
            map[index] = ownVertices.length;
            ownVertices.push(vertices[index]);
          }
        }
        ownTriangles.push(renumber(triangles[t], map));
      }
      pieces.push(
        [`  <object id="${id}" type="model">`, "   <mesh>", "    <vertices>", ...ownVertices.map((v) => `     ${v}`), "    </vertices>", "    <triangles>", ...ownTriangles.map((t) => `     ${t}`), "    </triangles>", "   </mesh>", "  </object>"].join("\n"),
      );
      split.push({ id, volume });
    }
    pieces.push([`  <object id="${object.id}" type="model">`, "   <components>", ...split.map((p) => `    <component objectid="${p.id}" transform="${IDENTITY}"/>`), "   </components>", "  </object>"].join("\n"));
    text = `${text.slice(0, bounds[0])}${pieces.join("\n").trimStart()}${text.slice(bounds[1])}`;
    parts.set(object.id, split);
  }
  return { text, parts };
}
