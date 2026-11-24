// SPDX-License-Identifier: MIT
/**
 * Takes the creator's own layer heights out of a project, so one layer height, the converted profile's, is every
 * layer's: an object's variable layer heights (`Metadata/layer_heights_profile.txt`), the layer height a height range
 * sets (`Metadata/layer_config_ranges.xml`) and an object's own layer height (`model_settings.config`).
 *
 * Everything here reads a file's text, which is untrusted: only matching lines are removed, nothing is run or built
 * from it, and a file past the size limit is left as it is.
 */

const LAYER_PROFILES_PATH = "Metadata/layer_heights_profile.txt";
const LAYER_RANGES_PATH = "Metadata/layer_config_ranges.xml";
const MODEL_SETTINGS_PATH = "Metadata/model_settings.config";
/** The same limit the plate reading puts on these small settings files. */
const MAX_BYTES = 16 * 1024 * 1024;

/** What the creator's project had that is now gone, in the order `FLATTENED_KINDS` lists. */
export const FLATTENED_KINDS = ["variable", "range", "object"] as const;
export type FlattenedKind = (typeof FLATTENED_KINDS)[number];

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

/** A layer height set for a range of an object's height: its option line, removed whole. */
const RANGE_LAYER_HEIGHT = /[ \t]*<option\s+opt_key="layer_height"\s*>[^<]*<\/option>[ \t]*\r?\n?/g;
/** An object's own layer height: its metadata line, removed whole. */
const OBJECT_LAYER_HEIGHT = /[ \t]*<metadata\s+key="layer_height"\s+value="[^"]*"\s*\/>[ \t]*\r?\n?/g;

/**
 * A copy of a project's archive entries without the creator's variable layer heights, ranges' layer heights and
 * objects' own layer heights, and which of those it held. Returns the entries it was given when it held none.
 */
export function flattenLayers(entries: Readonly<Record<string, Uint8Array>>): { entries: Record<string, Uint8Array>; removed: FlattenedKind[] } {
  const out: Record<string, Uint8Array> = { ...entries };
  const removed: FlattenedKind[] = [];

  const profiles = entries[LAYER_PROFILES_PATH];
  if (profiles && profiles.length <= MAX_BYTES && /^object_id=\d/m.test(decoder.decode(profiles))) {
    delete out[LAYER_PROFILES_PATH];
    removed.push("variable");
  }
  const edit = (path: string, pattern: RegExp, kind: FlattenedKind) => {
    const bytes = entries[path];
    if (!bytes || bytes.length > MAX_BYTES) return;
    const text = decoder.decode(bytes);
    const changed = text.replace(pattern, "");
    if (changed === text) return;
    out[path] = encoder.encode(changed);
    removed.push(kind);
  };
  edit(LAYER_RANGES_PATH, RANGE_LAYER_HEIGHT, "range");
  edit(MODEL_SETTINGS_PATH, OBJECT_LAYER_HEIGHT, "object");
  return { entries: removed.length > 0 ? out : (entries as Record<string, Uint8Array>), removed };
}

/** The note for a conversion that set one layer height: "Every layer is 0.18 mm, as you chose. ..." */
export function flattenedNote(layerHeight: number, removed: readonly FlattenedKind[]): string {
  const names: Record<FlattenedKind, string> = {
    variable: "variable layer heights",
    range: "layer heights set for ranges of an object's height",
    object: "layer heights set on objects",
  };
  const list = FLATTENED_KINDS.filter((k) => removed.includes(k)).map((k) => names[k]);
  const text = list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const height = `${Number(layerHeight.toFixed(3))}`;
  return list.length === 0 ? `Every layer is ${height} mm, as you chose.` : `Every layer is ${height} mm, as you chose. The creator's ${text} were replaced.`;
}
