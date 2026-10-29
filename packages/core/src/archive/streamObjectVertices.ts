// SPDX-License-Identifier: MIT
import type { Vec3 } from "./transform.js";

/** Part files above this size are scanned in chunks instead of being decoded into one string. */
export const LARGE_PART_BYTES = 64 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const VERTEX = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;

/**
 * Calls `visit` for every vertex of the first `<object id="objectId" ...>`
 * block in a part file, reading the file's bytes in chunks, without ever
 * holding the file as one string: a single mesh can be larger than the longest
 * string a JavaScript engine can make (about 512 MB in V8), and real projects
 * have meshes that big.
 *
 * Returns true when the block was found and closed. Only then are the visited
 * vertices the ones the whole-file path finds (`parseVertices` on the block
 * from its opening tag to the first `</object>`, the tag included), so a
 * caller must ignore what it was given when this returns false: an object
 * that never closes has no block at all on the whole-file path.
 *
 * @param chunkBytes chunk size, for tests; real callers use the default.
 */
export function forEachObjectVertex(bytes: Uint8Array, objectId: string, visit: (v: Vec3) => void, chunkBytes = CHUNK_BYTES): boolean {
  const decoder = new TextDecoder("utf-8");
  const start = `<object id="${objectId}"`;
  let carry = "";
  let inObject = false;
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const last = offset + chunkBytes >= bytes.length;
    let text = carry + decoder.decode(bytes.subarray(offset, offset + chunkBytes), { stream: !last });
    if (!inObject) {
      const at = text.indexOf(start);
      if (at === -1) {
        // Keep enough of the end to catch a start tag split across chunks.
        carry = text.slice(-start.length);
        continue;
      }
      // The opening tag must be complete before the object's contents begin.
      const tagEnd = text.indexOf(">", at + start.length);
      if (tagEnd === -1) {
        carry = text.slice(at);
        continue;
      }
      inObject = true;
      // The whole-file path scans the block from its opening tag, so a vertex written inside the tag counts too.
      for (const m of text.slice(at, tagEnd + 1).matchAll(VERTEX)) visit([Number(m[1]), Number(m[2]), Number(m[3])]);
      text = text.slice(tagEnd + 1);
    }
    const end = text.indexOf("</object>");
    // Process up to the object's end, or up to the last tag that may be cut off by the chunk boundary.
    const upTo = end !== -1 ? end : last ? text.length : Math.max(0, text.lastIndexOf("<"));
    for (const m of text.slice(0, upTo).matchAll(VERTEX)) visit([Number(m[1]), Number(m[2]), Number(m[3])]);
    if (end !== -1) return true;
    carry = text.slice(upTo);
  }
  return false;
}
