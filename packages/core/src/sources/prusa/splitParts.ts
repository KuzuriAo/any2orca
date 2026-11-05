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
 *
 * Every step is linear in the model's size: the objects are found in one scan,
 * each is replaced in place, and the text is joined once at the end, so a
 * model with many multi-part objects doesn't make a slower machine wait.
 */
import { isSelfClosingTag, xmlTags } from "../../archive/xmlBlocks.js";
import type { PrusaObject, PrusaVolume } from "./modelConfig.js";

/** Past this, the split is skipped and the object kept as one part. */
const MAX_TRIANGLES = 4_000_000;
const IDENTITY = "1 0 0 0 1 0 0 0 1 0 0 0";
const CLOSE = "</object>";
/** An object's opening tag: its id, and the character after it (the tag must go on with a space, a tab, a newline or `>`). */
const OPENER = /<object id="(\d{1,9})"([ >\t\n]?)/g;
/** A triangle's three vertex indices. Not global, so each `exec` starts from the beginning of the tag. */
const CORNERS = [/\bv1="(\d+)"/, /\bv2="(\d+)"/, /\bv3="(\d+)"/] as const;

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

/** The vertex and triangle tags of one mesh, as written, with each triangle's three vertex indices. */
interface Mesh {
  vertices: string[];
  triangles: string[];
  /** Three entries per triangle, in triangle order. */
  corners: number[];
}

/**
 * The mesh of an object's block, or null when it can't be split: a triangle
 * without three vertex indices, an index past the last vertex, or more
 * triangles than {@link MAX_TRIANGLES} (stops reading there, so a huge mesh
 * isn't held twice).
 */
function readMesh(block: string): Mesh | null {
  const vertices: string[] = [];
  for (const { attrs, start, end } of xmlTags(block, "vertex")) {
    if (isSelfClosingTag(attrs)) vertices.push(block.slice(start, end));
  }
  const triangles: string[] = [];
  const corners: number[] = [];
  for (const { attrs, start, end } of xmlTags(block, "triangle")) {
    if (!isSelfClosingTag(attrs)) continue;
    if (triangles.length === MAX_TRIANGLES) return null;
    for (const pattern of CORNERS) {
      const index = pattern.exec(attrs)?.[1];
      const n = index === undefined ? -1 : Number(index);
      if (n < 0 || n >= vertices.length) return null;
      corners.push(n);
    }
    triangles.push(block.slice(start, end));
  }
  return { vertices, triangles, corners };
}

/** Whether the volumes' triangle ranges cover the mesh in order, each starting where the last one ended. */
function rangesCoverMesh(volumes: readonly PrusaVolume[], triangleCount: number): boolean {
  return (
    volumes.every((v, i) => v.firstTriangle <= v.lastTriangle && (i === 0 ? v.firstTriangle === 0 : v.firstTriangle === volumes[i - 1].lastTriangle + 1)) &&
    volumes[volumes.length - 1].lastTriangle === triangleCount - 1
  );
}

export function splitMultiPartObjects(text: string, objects: readonly PrusaObject[], warnings: string[]): SplitResult {
  const parts = new Map<number, SplitPart[]>();

  // One scan: the highest object id (new ids follow it) and where each object starts.
  let nextId = 0;
  const startOf = new Map<string, number>();
  for (const m of text.matchAll(OPENER)) {
    nextId = Math.max(nextId, Number(m[1]));
    if (m[2] !== "" && !startOf.has(m[1])) startOf.set(m[1], m.index);
  }
  nextId++;
  // An object that starts after the last closing tag has none, so no block: known without scanning to the end for it.
  const lastClose = text.lastIndexOf(CLOSE);

  /** Each split object's replacement, by the position of the closing tag that ends its block. */
  const edits = new Map<number, { start: number; end: number; text: string }>();
  for (const object of objects) {
    if (object.volumes.length < 2) continue;
    const start = startOf.get(String(object.id));
    if (start === undefined || start > lastClose) continue;
    const close = text.indexOf(CLOSE, start);
    // Two blocks that end at the same closing tag overlap (an object that never closed before the next one began),
    // and an object listed twice ends where it did the first time: the first one split keeps that stretch of text.
    if (edits.has(close)) continue;
    const end = close + CLOSE.length;
    const block = text.slice(start, end);
    if (block.includes("<component")) continue;

    const mesh = readMesh(block);
    if (!mesh || !rangesCoverMesh(object.volumes, mesh.triangles.length)) {
      warnings.push(`  WARN: "${object.name || `Object ${object.id}`}" has ${object.volumes.length} parts whose mesh couldn't be split, so it's converted as one part on its own filament.`);
      continue;
    }

    // A vertex's index in the part being written is valid while `partOf` holds that part's number, so the map
    // never needs clearing between parts.
    const partOf = new Int32Array(mesh.vertices.length);
    const newIndex = new Int32Array(mesh.vertices.length);
    const renumber = (tag: string, part: number): string =>
      tag.replace(/\b(v[123])="(\d+)"/g, (_, name: string, index: string) => {
        const i = Number(index);
        return `${name}="${partOf[i] === part ? newIndex[i] : -1}"`;
      });

    const pieces: string[] = [];
    const split: SplitPart[] = [];
    object.volumes.forEach((volume, v) => {
      const part = v + 1;
      const id = nextId++;
      const ownVertices: string[] = [];
      const ownTriangles: string[] = [];
      for (let t = volume.firstTriangle; t <= volume.lastTriangle; t++) {
        for (let c = 3 * t; c < 3 * t + 3; c++) {
          const index = mesh.corners[c];
          if (partOf[index] !== part) {
            partOf[index] = part;
            newIndex[index] = ownVertices.length;
            ownVertices.push(mesh.vertices[index]);
          }
        }
        ownTriangles.push(renumber(mesh.triangles[t], part));
      }
      pieces.push(
        [`  <object id="${id}" type="model">`, "   <mesh>", "    <vertices>", ...ownVertices.map((s) => `     ${s}`), "    </vertices>", "    <triangles>", ...ownTriangles.map((s) => `     ${s}`), "    </triangles>", "   </mesh>", "  </object>"].join("\n"),
      );
      split.push({ id, volume });
    });
    pieces.push([`  <object id="${object.id}" type="model">`, "   <components>", ...split.map((p) => `    <component objectid="${p.id}" transform="${IDENTITY}"/>`), "   </components>", "  </object>"].join("\n"));
    edits.set(close, { start, end, text: pieces.join("\n").trimStart() });
    parts.set(object.id, split);
  }

  if (edits.size === 0) return { text, parts };
  // Blocks that don't share a closing tag never overlap, so the replacements apply in order of position, in one join.
  const out: string[] = [];
  let at = 0;
  for (const edit of [...edits.values()].sort((a, b) => a.start - b.start)) {
    out.push(text.slice(at, edit.start), edit.text);
    at = edit.end;
  }
  out.push(text.slice(at));
  return { text: out.join(""), parts };
}
