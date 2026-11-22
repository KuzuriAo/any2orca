// SPDX-License-Identifier: MIT
/**
 * Which filaments are painted on a mesh, and between which heights: one pass over a model file's bytes, in chunks,
 * so a mesh larger than the engine's longest string is read like any other (see streamObjectVertices.ts).
 */
import { visitPaintLeaves } from "./paintColor.js";

const CHUNK_BYTES = 8 * 1024 * 1024;
/** A tag longer than this many chunks isn't a mesh's: the scan gives up on the file rather than grow its buffer without end. */
const MAX_CARRY_CHUNKS = 4;
/** Vertices kept per mesh for the heights of its paint (4 bytes each); a larger mesh reports its paint without heights. */
export const MAX_PAINT_VERTICES = 32 * 1024 * 1024;

const PAINT_ATTRIBUTE = 'paint_color="';

/** Whether `bytes` hold the paint attribute at all: most part files don't, and skip the scan. */
export function hasPaintAttribute(bytes: Uint8Array): boolean {
  const first = PAINT_ATTRIBUTE.charCodeAt(0);
  const length = PAINT_ATTRIBUTE.length;
  const end = bytes.length - length;
  outer: for (let i = bytes.indexOf(first); i !== -1 && i <= end; i = bytes.indexOf(first, i + 1)) {
    for (let j = 1; j < length; j++) if (bytes[i + j] !== PAINT_ATTRIBUTE.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** What one mesh's paint says. */
export interface MeshPaint {
  /** Each painted filament (1-based) with the lowest and highest z it is painted at; NaN when the heights aren't known. */
  painted: Map<number, [zMin: number, zMax: number]>;
  /** Some triangle, or part of one, has no paint: the part's own filament shows there. */
  unpainted: boolean;
  /** How many of the mesh's triangles the scan read; 0 means the mesh wasn't found, so nothing is known about it. */
  triangles: number;
}

/** One mesh to read: the z a vertex of it has on the plate, and where what is read goes. */
export interface PaintRequest {
  zOf: (x: number, y: number, z: number) => number;
  result: MeshPaint;
}

const TOKEN = /<object id="([^"]{1,64})"|<\/object>|<vertex x="([^"]{1,40})" y="([^"]{1,40})" z="([^"]{1,40})"|<triangle v1="(\d{1,10})" v2="(\d{1,10})" v3="(\d{1,10})"([^>]*)>/g;
const PAINT_VALUE = /(?:^|\s)paint_color="([^"]*)"/;

/**
 * Reads the paint of the meshes named in `wanted` (by the mesh's object id; several requests for one mesh are the
 * same mesh placed more than once) from one model file. A filament number above `filamentCount` counts as no paint,
 * as the slicer treats it. Returns false when the file couldn't be scanned to its end; the requests then hold what
 * was read up to there, and their meshes count as partly unpainted.
 */
export function scanMeshPaint(bytes: Uint8Array, wanted: ReadonlyMap<string, readonly PaintRequest[]>, filamentCount: number, chunkBytes = CHUNK_BYTES): boolean {
  const decoder = new TextDecoder("utf-8");
  let carry = "";
  /** The mesh being read: its requests, each with its own array of vertex heights. Null between wanted meshes. */
  interface Open {
    requests: readonly PaintRequest[];
    heights: Float32Array[];
    vertexCount: number;
    tooManyVertices: boolean;
  }
  const state: { open: Open | null } = { open: null };
  // The request a triangle's leaves go to; one visitor for the whole scan, not one per triangle.
  let result: MeshPaint = { painted: new Map(), unpainted: false, triangles: 0 };
  const visit = (filament: number, zMin: number, zMax: number) => {
    if (filament === 0 || filament > filamentCount) {
      result.unpainted = true;
      return;
    }
    const known = result.painted.get(filament);
    if (!known) {
      result.painted.set(filament, [zMin, zMax]);
      return;
    }
    // NaN (a height that isn't known) stays NaN, so one unknown corner marks the filament.
    if (!(zMin >= known[0])) known[0] = Math.min(known[0], zMin);
    if (!(zMax <= known[1])) known[1] = Math.max(known[1], zMax);
  };

  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const last = offset + chunkBytes >= bytes.length;
    const text = carry + decoder.decode(bytes.subarray(offset, offset + chunkBytes), { stream: !last });
    // Up to the last tag that may be cut off by the chunk boundary.
    const upTo = last ? text.length : Math.max(0, text.lastIndexOf("<"));
    TOKEN.lastIndex = 0;
    for (;;) {
      if (!state.open) {
        // Outside a wanted mesh only the next object matters: skip its neighbors' vertices unparsed.
        const at = text.indexOf('<object id="', TOKEN.lastIndex);
        if (at === -1 || at >= upTo) break;
        TOKEN.lastIndex = at;
      }
      const m = TOKEN.exec(text);
      if (!m || m.index >= upTo) break;
      const open = state.open;
      if (m[1] !== undefined) {
        const requests = wanted.get(m[1]);
        state.open = requests ? { requests, heights: requests.map(() => new Float32Array(1024)), vertexCount: 0, tooManyVertices: false } : null;
      } else if (m[2] !== undefined) {
        if (!open) continue;
        if (open.vertexCount >= MAX_PAINT_VERTICES) {
          open.tooManyVertices = true;
          continue;
        }
        const x = Number(m[2]);
        const y = Number(m[3]);
        const z = Number(m[4]);
        for (let r = 0; r < open.requests.length; r++) {
          let array = open.heights[r]!;
          if (open.vertexCount >= array.length) {
            const grown = new Float32Array(Math.min(MAX_PAINT_VERTICES, array.length * 2));
            grown.set(array);
            open.heights[r] = array = grown;
          }
          array[open.vertexCount] = open.requests[r]!.zOf(x, y, z);
        }
        open.vertexCount++;
      } else if (m[5] !== undefined) {
        if (!open) continue;
        const attrs = m[8]!;
        // Most triangles of most meshes have no paint: look for the attribute before running a pattern over it.
        const code = attrs.length > PAINT_ATTRIBUTE.length && attrs.includes(PAINT_ATTRIBUTE) ? PAINT_VALUE.exec(attrs)?.[1] : undefined;
        const known = !open.tooManyVertices;
        const i1 = Number(m[5]);
        const i2 = Number(m[6]);
        const i3 = Number(m[7]);
        const inRange = known && i1 < open.vertexCount && i2 < open.vertexCount && i3 < open.vertexCount;
        for (let r = 0; r < open.requests.length; r++) {
          result = open.requests[r]!.result;
          result.triangles++;
          if (!code) {
            result.unpainted = true;
            continue;
          }
          const array = open.heights[r]!;
          const decoded = inRange ? visitPaintLeaves(code, array[i1]!, array[i2]!, array[i3]!, visit) : visitPaintLeaves(code, NaN, NaN, NaN, visit);
          if (!decoded) result.unpainted = true;
        }
      } else {
        state.open = null;
      }
    }
    carry = text.slice(upTo);
    if (carry.length > Math.max(MAX_CARRY_CHUNKS * chunkBytes, 4096)) {
      for (const requests of wanted.values()) for (const request of requests) request.result.unpainted = true;
      return false;
    }
  }
  return true;
}
