// SPDX-License-Identifier: MIT
import { bambuFamilyReader } from "./bambuFamily.js";
import type { SourceReader } from "./reader.js";

export type { ParsedProject, ReadContext, SourceFormat, SourceReader } from "./reader.js";

/** Every reader, in the order they're tried. */
export const SOURCE_READERS: readonly SourceReader[] = [bambuFamilyReader];

/** The reader for these zip entries, or null when no reader recognizes them. */
export function findSourceReader(entries: Record<string, Uint8Array>): SourceReader | null {
  return SOURCE_READERS.find((reader) => reader.detect(entries)) ?? null;
}
