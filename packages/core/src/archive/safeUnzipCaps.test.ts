// SPDX-License-Identifier: MIT
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "../errors.js";
import { DEFAULT_MAX_UNPACKED_BYTES, formatSize, MAX_UNPACKED_BYTES_LIMIT, safeUnzipSync } from "./safeUnzip.js";

/** Rewrites every central-directory entry's declared uncompressed size, as a crafted archive would. */
function declareSizes(zip: Uint8Array, originalSize: number, compressedSize?: number): Uint8Array {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 46 <= out.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    view.setUint32(i + 24, originalSize, true);
    if (compressedSize !== undefined) view.setUint32(i + 20, compressedSize, true);
  }
  return out;
}

function files(count: number, size: number): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) result[`f${i}.bin`] = new Uint8Array(size);
  return result;
}

describe("safeUnzipSync caps on declared sizes", () => {
  it("refuses an entry declared over the size limit, as too_large", () => {
    const zip = declareSizes(zipSync(files(1, 10), { level: 0 }), 0xfffffff0);
    expect(() => safeUnzipSync(zip)).toThrow(/^This project is too large: it unpacks to more than 2 GB, the most any2orca converts by default\.$/);
    try {
      safeUnzipSync(zip);
    } catch (err) {
      expect(err).toBeInstanceOf(Any2orcaError);
      expect((err as Any2orcaError).code).toBe("too_large");
    }
  });

  it("refuses an archive whose declared total passes the total cap", () => {
    // Honest-looking ratios (stored, compressed size = declared size), so only the total cap can refuse it.
    const zip = declareSizes(zipSync(files(4, 10), { level: 0 }), 600 * 1024 * 1024, 600 * 1024 * 1024);
    expect(() => safeUnzipSync(zip)).toThrow(/unpacks to more than 2 GB/);
  });

  it("takes a raised or lowered limit, and checks it", () => {
    // 2.4 GB declared in all: over the default, under a 4 GB limit (refused later only for not really inflating).
    const zip = declareSizes(zipSync(files(4, 10), { level: 0 }), 600 * 1024 * 1024, 600 * 1024 * 1024);
    expect(() => safeUnzipSync(zip, 4 * 1024 ** 3)).not.toThrow(/unpacks to more than/);
    const small = zipSync({ "a.bin": new Uint8Array(2 * 1024 * 1024) }, { level: 0 });
    expect(() => safeUnzipSync(small, 1024 * 1024)).toThrow(/unpacks to more than 1 MB, the limit set for this conversion\./);
    expect(DEFAULT_MAX_UNPACKED_BYTES).toBe(2 * 1024 ** 3);
    for (const bad of [0, 1000, 1024 ** 2 + 0.5, MAX_UNPACKED_BYTES_LIMIT + 1, Number.NaN]) {
      expect(() => safeUnzipSync(small, bad)).toThrow(TypeError);
    }
  });

  it("formats sizes for messages", () => {
    expect([formatSize(2 * 1024 ** 3), formatSize(1.53 * 1024 ** 3), formatSize(512 * 1024 ** 2)]).toEqual(["2 GB", "1.5 GB", "512 MB"]);
  });

  it("refuses many entries just under the per-entry ratio threshold that together inflate far beyond the archive", () => {
    // Shaped like 400 x (10 MB - 1) zero entries in a 4 MB file; patched here so nothing actually inflates.
    const zip = declareSizes(zipSync(files(40, 1000)), 10 * 1024 * 1024 - 1);
    expect(() => safeUnzipSync(zip)).toThrow(/zip bomb/);
  });

  it("refuses an entry whose compressed data is far larger than the size it declares", () => {
    // Incompressible bytes, so the deflate stream is ~5000 bytes, declared as 10.
    let seed = 1;
    const noise = Uint8Array.from({ length: 5000 }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
    const zip = declareSizes(zipSync({ "a.bin": noise }), 10);
    expect(() => safeUnzipSync(zip)).toThrow(/is damaged: .* holds more data than the file says it does/);
  });

  it("refuses an archive with two entries of the same name", () => {
    const zip = zipSync({ "a.txt": new Uint8Array([1]), "b.txt": new Uint8Array([2]) });
    for (let i = 0; i + 5 <= zip.length; i++) if (new TextDecoder().decode(zip.subarray(i, i + 5)) === "b.txt") zip[i] = 0x61;
    expect(() => safeUnzipSync(zip)).toThrow(/twice, and a slicer would read a different copy/);
  });
});
