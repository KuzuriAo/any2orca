// SPDX-License-Identifier: MIT
import { escapeRegExp } from "./internal/escapeRegExp.js";
import { parseVertices } from "./parseVertices.js";
import { isSelfClosingTag, xmlBlockStartingWith, xmlTags } from "./xmlBlocks.js";
import { forEachObjectVertex, LARGE_PART_BYTES } from "./streamObjectVertices.js";
import { applyTransform, compose, parseMatrix, type Mat3, type Vec3 } from "./transform.js";

export type Bbox = [minX: number, maxX: number, minY: number, maxY: number];

const utf8Decoder = new TextDecoder("utf-8");

/**
 * Compute the true world-space X/Y bounding box of a top-level object's
 * placed geometry, composing the item's plate-placement transform with
 * each part's own transform. Needed because objects assembled from
 * rotated multi-color/cut sub-parts (`<component>`) can have a visual
 * center nowhere near their stored item transform's translation -- the
 * only way to know the real center is to transform the actual mesh
 * vertices.
 *
 * @param zipEntries the full decompressed zip contents (e.g. fflate's
 *   `unzipSync` output) -- this function reads component part files by
 *   path directly out of it.
 * @param partFileCache memoizes decoded part-file text across many calls
 *   within one conversion pass (mutated in place by design: a cross-call
 *   memoization cache, not incidental state).
 * @returns `[minX, maxX, minY, maxY]`, or `null` if nothing could be found.
 */
/**
 * Finds the `<object id="...">...</object>` block for `objectId` in `text`, or null.
 * Scanned in one pass: the lazy block pattern this replaces rescanned the rest of the
 * file for every opener that never closed, which a crafted file turned into minutes
 * (40,000 openers in 1 MB took 3.5 s, and the reader calls this once per object).
 */
function findObjectBlock(objectId: string, text: string): string | null {
  return xmlBlockStartingWith(text, "object", `id="${objectId}"`);
}

/**
 * The object's own `<item ...>` placement transform, or null: what
 * `<item objectid="N"[^>]*transform="([^"]+)"` captured, which is the first such
 * item that has a transform (and, being greedy, the last transform in that tag).
 */
function itemTransform(objectId: string, topModelText: string): string | null {
  const prefix = ` objectid="${objectId}"`;
  for (const { attrs } of xmlTags(topModelText, "item")) {
    if (!attrs.startsWith(prefix)) continue;
    const transforms = [...attrs.matchAll(/transform="([^"]+)"/g)];
    if (transforms.length > 0) return transforms[transforms.length - 1][1];
  }
  return null;
}

/** Order-independent single-attribute lookup within one tag's attributes. */
function componentAttr(attrs: string, name: string): string | null {
  const match = new RegExp(`${escapeRegExp(name)}="([^"]*)"`).exec(attrs);
  return match ? match[1] : null;
}

/**
 * One part of a top-level object as the model places it: the mesh it is (its object id, and the part file holding it,
 * or null when the mesh is in the main model file), the transform that puts it on the plate, and its lowest and
 * highest z there (NaN when no vertex was found). An object with no parts of its own is one part with its own id.
 */
export interface PartPlacement {
  id: string;
  path: string | null;
  R: Mat3;
  T: Vec3;
  zMin: number;
  zMax: number;
}

/**
 * @param parts when given, receives each part's placement and height from the same pass over the vertices
 *   (see {@link PartPlacement}).
 */
export function objectWorldBboxXY(
  objectId: string,
  topModelText: string,
  partFileCache: Map<string, string>,
  zipEntries: Readonly<Record<string, Uint8Array>>,
  parts?: PartPlacement[],
): Bbox | null {
  const objBlock = findObjectBlock(objectId, topModelText);
  const itemMatch = itemTransform(objectId, topModelText);
  if (!objBlock || !itemMatch) return null;

  const [itemR, itemT] = parseMatrix(itemMatch);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  // Attribute order isn't fixed by the 3MF spec, so each attribute is
  // pulled independently rather than matched positionally. `p:path` is
  // absent for components referencing an <object> defined in this same
  // model file (a legitimate "assembled from local sub-parts" case, not
  // just the "split across separate part files" one) -- when absent,
  // resolve objectid against topModelText itself instead of an external part.
  let anyComponent = false;

  let zLow = Infinity;
  let zHigh = -Infinity;
  const include = ([wx, wy, wz]: [number, number, number]) => {
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < zLow) zLow = wz;
    if (wz > zHigh) zHigh = wz;
    count++;
  };
  /** Records the part just scanned, with the height the pass found for it. */
  const closePart = (id: string, path: string | null, R: Mat3, T: Vec3) => {
    parts?.push({ id, path, R, T, zMin: zLow <= zHigh ? zLow : NaN, zMax: zLow <= zHigh ? zHigh : NaN });
    zLow = Infinity;
    zHigh = -Infinity;
  };

  for (const { attrs } of xmlTags(objBlock, "component")) {
    if (!isSelfClosingTag(attrs)) continue;
    anyComponent = true;
    const path = componentAttr(attrs, "p:path");
    const subObjId = componentAttr(attrs, "objectid");
    // The 3MF spec makes a component's transform optional (identity when absent); PrusaSlicer leaves it out.
    const transform = componentAttr(attrs, "transform") ?? "1 0 0 0 1 0 0 0 1 0 0 0";
    if (!subObjId) continue;

    const [compR, compT] = parseMatrix(transform);
    const [R, T] = compose(itemR, itemT, compR, compT);
    let subBlock: string | null;
    if (path) {
      const key = path.replace(/^\/+/, "");
      const bytes = zipEntries[key];
      // A very large mesh is scanned from its bytes: decoding it whole can exceed the engine's longest string.
      if (bytes && bytes.length > LARGE_PART_BYTES) {
        // Kept aside until the block is known to close, as the whole-file path only uses a closed block.
        let [aMinX, aMaxX, aMinY, aMaxY, aMinZ, aMaxZ, aCount] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity, 0];
        const closed = forEachObjectVertex(bytes, subObjId, (v) => {
          const [wx, wy, wz] = applyTransform(v, R, T);
          if (wx < aMinX) aMinX = wx;
          if (wx > aMaxX) aMaxX = wx;
          if (wy < aMinY) aMinY = wy;
          if (wy > aMaxY) aMaxY = wy;
          if (wz < aMinZ) aMinZ = wz;
          if (wz > aMaxZ) aMaxZ = wz;
          aCount++;
        });
        if (closed && aCount > 0) {
          minX = Math.min(minX, aMinX);
          maxX = Math.max(maxX, aMaxX);
          minY = Math.min(minY, aMinY);
          maxY = Math.max(maxY, aMaxY);
          count += aCount;
          zLow = aMinZ;
          zHigh = aMaxZ;
        }
        closePart(subObjId, key, R, T);
        continue;
      }
      if (!partFileCache.has(key)) {
        partFileCache.set(key, bytes ? utf8Decoder.decode(bytes) : "");
      }
      subBlock = findObjectBlock(subObjId, partFileCache.get(key)!);
    } else {
      subBlock = findObjectBlock(subObjId, topModelText);
    }
    if (subBlock) for (const v of parseVertices(subBlock)) include(applyTransform(v, R, T));
    closePart(subObjId, path ? path.replace(/^\/+/, "") : null, R, T);
  }
  if (!anyComponent) {
    // Direct mesh in the same object definition (no components at all).
    for (const v of parseVertices(objBlock)) include(applyTransform(v, itemR, itemT));
    closePart(objectId, null, itemR, itemT);
  }

  if (count === 0) return null;
  return [minX, maxX, minY, maxY];
}
