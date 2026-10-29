// SPDX-License-Identifier: MIT
import { unzipSync, type Unzipped } from "fflate";
import { Any2orcaError } from "../errors.js";

/**
 * Defeats a classic decompression-bomb .3mf (a tiny compressed file whose
 * zip central directory *declares* a huge uncompressed size) -- fflate's
 * `filter` callback runs against each entry's declared size, read straight
 * from the zip's central directory, BEFORE that entry is actually
 * inflated, so an oversized claim is rejected up front rather than after
 * the expensive decompression already happened. This matters because
 * .3mf parsing runs on the machine of whoever converts the file (a browser
 * tab or the CLI), so a malicious file shared on a creator site would
 * otherwise crash or hang that person's machine.
 *
 * The actual signature of a bomb is an absurd COMPRESSION RATIO, not a
 * large absolute size -- a single DEFLATE stream tops out near ~1032:1
 * even on maximally-repetitive input, so a small compressed file claiming
 * gigabytes is only achievable by a crafted bomb, never real data. A flat
 * total size cap alone would reject real large projects: creators publish
 * models that unpack to 1.5GB from a 250MB file, an ordinary ~6:1 ratio.
 * MAX_COMPRESSION_RATIO catches the real signature; the absolute caps
 * below are now just a generous backstop against a single entry/archive
 * being too large to handle regardless of how honestly it compresses.
 */
const MAX_COMPRESSION_RATIO = 100;
// Ratio math is noisy/meaningless on small entries (a 50-byte file
// expanding to 5KB is "100:1" but harmless) -- only entries at least this
// large uncompressed are worth ratio-checking at all.
const MIN_UNCOMPRESSED_BYTES_FOR_RATIO_CHECK = 10 * 1024 * 1024; // 10MB
// The same ratio limit applied to the archive as a whole once its declared
// total passes the threshold, so many entries each just under it can't add up
// to gigabytes from a few megabytes of file.
/**
 * The most a project may unpack to by default: above the largest real
 * projects seen (1.5GB), and as much as a browser tab reliably holds while
 * converting (about twice the unpacked size at the peak).
 */
export const DEFAULT_MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024;
/** The most `maxUnpackedBytes` can raise the limit to, for the command line and Node. */
export const MAX_UNPACKED_BYTES_LIMIT = 16 * 1024 * 1024 * 1024;
/** Above this, opening a project warns that converting it takes a lot of memory. */
export const LARGE_PROJECT_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRY_COUNT = 10_000;
const MAX_ENTRY_NAME_LENGTH = 1024;

/**
 * Rejects zip-slip shaped entry names: parent-directory segments, absolute
 * or drive-letter paths, backslashes and NUL. Nothing here writes entries
 * to disk by name, but output filenames for a bundle's nested files come
 * from these names, and a name like that has no legitimate use in a 3MF.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_ENTRY_NAME_LENGTH) return false;
  if (name.includes("\\") || name.includes("\0")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return !name.split("/").some((segment) => segment === "..");
}

/** "2 GB", "1.5 GB", "512 MB": a size for a message. */
export function formatSize(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${Number(gb.toFixed(1))} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/**
 * Unzips a project in memory, refusing what looks crafted (see above).
 * `maxUnpackedBytes` raises or lowers the size limit; the default suits a
 * browser tab.
 */
export function safeUnzipSync(fileBytes: Uint8Array, maxUnpackedBytes: number = DEFAULT_MAX_UNPACKED_BYTES): Unzipped {
  if (!Number.isSafeInteger(maxUnpackedBytes) || maxUnpackedBytes < 1024 * 1024 || maxUnpackedBytes > MAX_UNPACKED_BYTES_LIMIT) {
    throw new TypeError(`maxUnpackedBytes must be a whole number of bytes from 1 MB to ${formatSize(MAX_UNPACKED_BYTES_LIMIT)}.`);
  }
  // Says what's wrong, not what to do: the CLI, the web app and the docs each give their own way to raise the limit.
  const tooLarge = () =>
    new Any2orcaError(
      "too_large",
      `This project is too large: it unpacks to more than ${formatSize(maxUnpackedBytes)}, ${maxUnpackedBytes === DEFAULT_MAX_UNPACKED_BYTES ? "the most any2orca converts by default" : "the limit set for this conversion"}.`,
    );
  const unsafe = (message: string) => new Any2orcaError("invalid_file", message);
  let totalBytes = 0;
  let totalCompressedBytes = 0;
  let entryCount = 0;
  const seenNames = new Set<string>();

  const entries = unzipSync(fileBytes, {
    filter(file) {
      entryCount++;
      // Slicers read the first copy of a repeated name and this reader the last, so the two would see different files.
      if (seenNames.has(file.name)) {
        throw unsafe(`This file can't be opened safely: it contains ${JSON.stringify(file.name.slice(0, 200))} twice, and a slicer would read a different copy than any2orca. Re-save the project in its slicer.`);
      }
      seenNames.add(file.name);
      if (exceedsDeclaredSize(file.size, file.originalSize)) {
        throw unsafe(`This file is damaged: ${JSON.stringify(file.name.slice(0, 200))} holds more data than the file says it does. Download it again, or re-save the project in its slicer.`);
      }
      if (!isSafeEntryName(file.name)) {
        throw unsafe(`This file can't be opened safely: it contains a file named ${JSON.stringify(file.name.slice(0, 200))}, a kind of path a real 3MF never has.`);
      }
      if (entryCount > MAX_ENTRY_COUNT) {
        throw unsafe(`This file holds more than ${MAX_ENTRY_COUNT.toLocaleString("en-US")} files inside it, far more than a real 3MF project, so it isn't opened.`);
      }
      if (file.originalSize > maxUnpackedBytes) throw tooLarge();
      if (file.originalSize >= MIN_UNCOMPRESSED_BYTES_FOR_RATIO_CHECK) {
        const ratio = file.size > 0 ? file.originalSize / file.size : Infinity;
        if (ratio > MAX_COMPRESSION_RATIO) {
          throw unsafe(
            `This file can't be opened safely: part of it (${JSON.stringify(file.name.slice(0, 200))}) expands to more than ${MAX_COMPRESSION_RATIO} times its packed size, which is how a file built to fill up memory (a "zip bomb") looks.`,
          );
        }
      }
      totalBytes += file.originalSize;
      totalCompressedBytes += file.size;
      if (totalBytes > maxUnpackedBytes) throw tooLarge();
      if (totalBytes >= MIN_UNCOMPRESSED_BYTES_FOR_RATIO_CHECK) {
        const ratio = totalCompressedBytes > 0 ? totalBytes / totalCompressedBytes : Infinity;
        if (ratio > MAX_COMPRESSION_RATIO) {
          throw unsafe(
            `This file can't be opened safely: it expands to more than ${MAX_COMPRESSION_RATIO} times its packed size, which is how a file built to fill up memory (a "zip bomb") looks.`,
          );
        }
      }
      return true;
    },
  });
  return entries;
}

// Deflate never grows data by more than a few bytes per block, so compressed
// data much larger than its declared size is a stream that inflates far past
// the size every cap above trusted.
function exceedsDeclaredSize(compressedBytes: number, declaredBytes: number): boolean {
  return compressedBytes > declaredBytes * 1.01 + 1024;
}
