// SPDX-License-Identifier: MIT
/**
 * A plate's layers as Snapmaker Orca slices them, so a height can be given as the layer number its layer slider shows.
 *
 * It follows the slicer's own steps (Snapmaker Orca v2.4.1): `generate_object_layers` in `Slicing.cpp` builds each
 * object's layers from its first layer height and either its layer height or its own variable layer heights
 * (`Metadata/layer_heights_profile.txt`, used only when its last height is the object's top, as
 * `PrintObject::update_layer_height_profile` checks), and `ToolOrdering::initialize_layers` merges the plate's
 * objects' layers, joining heights closer than 0.0001 mm. The slider numbers those layers from 1.
 *
 * Where the slicer would add layers of its own, or build them another way (a raft, supports with their own layer
 * heights, a layer height set for a range of heights, Snapmaker's mixed-filament layer modes, printing object by
 * object), the layers aren't worked out: the caller says so instead of giving a number that could be wrong.
 *
 * Everything here comes from the file, which is untrusted: values are range-checked and the work is capped.
 */

/** The slicer's own closeness for heights (libslic3r `EPSILON`). */
const EPSILON = 1e-4;
/** A variable layer height profile's last height must be the object's top within this (PrintObject.cpp). */
const PROFILE_TOP_TOLERANCE = 1e-3;
/** The slicer's floor for a layer height when nothing sets one (libslic3r `MIN_LAYER_HEIGHT`). */
const MIN_LAYER_HEIGHT = 0.01;
/** Far past any real print; a plate that needs more is reported without layer numbers. */
export const MAX_PLATE_LAYERS = 200_000;
/** Bounds the values a crafted profile can make this read. */
const MAX_PROFILE_VALUES = 400_000;
const MAX_PROFILES = 20_000;

/** One object's variable layer heights: `[z, height, z, height, ...]`, z rising. */
export type LayerProfile = readonly number[];

/**
 * The variable layer height profiles in `layer_heights_profile.txt`, by object id. The file numbers objects by their
 * 3MF object id when its first line says `layer_heights_profile_format_version=2` or later, and otherwise by their
 * position in the model's build list, from 1 (`order`), as the slicer reads it.
 */
export function readLayerProfiles(text: string, order: readonly string[]): Map<string, LayerProfile> {
  const profiles = new Map<string, LayerProfile>();
  const lines = text.split("\n", MAX_PROFILES + 1);
  let byObjectId = false;
  let values = 0;
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (i === 0) {
      const version = /^layer_heights_profile_format_version=(\d{1,4})$/.exec(line);
      if (version) {
        byObjectId = Number(version[1]) >= 2;
        continue;
      }
    }
    const entry = /^object_id=(\d{1,9})\|(.*)$/.exec(line);
    if (!entry) continue;
    const key = Number(entry[1]);
    const id = byObjectId ? entry[1]! : order[key - 1];
    if (key === 0 || id === undefined || profiles.has(id)) continue;
    const parts = entry[2]!.split(";");
    // The slicer refuses a profile with four values or fewer, or an odd count.
    if (parts.length <= 4 || parts.length % 2 !== 0) continue;
    values += parts.length;
    if (values > MAX_PROFILE_VALUES) break;
    const profile: number[] = [];
    let valid = true;
    for (const [j, part] of parts.entries()) {
      const n = /^\d{1,6}(\.\d{1,20})?$/.test(part.trim()) ? Number(part) : NaN;
      // Heights rise; layer heights are above zero.
      if (!Number.isFinite(n) || (j % 2 === 0 ? j > 0 && n < profile[j - 2]! : n <= 0)) {
        valid = false;
        break;
      }
      profile.push(n);
    }
    if (valid) profiles.set(id, profile);
  }
  return profiles;
}

/** What one object's layers are built from. */
export interface ObjectLayerInput {
  /** The object's height above the plate, in mm. */
  height: number;
  /** The first layer's height. */
  firstLayer: number;
  /** The object's layer height. */
  layerHeight: number;
  /** The thinnest layer its nozzles take. */
  minLayer: number;
  /** Its variable layer heights, if the file has them. */
  profile?: LayerProfile;
}

/**
 * The tops of one object's layers, lowest first, as `generate_object_layers` builds them; null when they would be
 * more than `maxLayers`.
 */
export function objectLayerTops(input: ObjectLayerInput, maxLayers = MAX_PLATE_LAYERS): number[] | null {
  const { height, firstLayer, layerHeight } = input;
  if (!(height > 0) || !(firstLayer > 0) || !(layerHeight > 0)) return null;
  const minLayer = Math.min(Math.max(MIN_LAYER_HEIGHT, input.minLayer > 0 ? input.minLayer : MIN_LAYER_HEIGHT), layerHeight);
  // The profile counts only when it ends at the object's top; otherwise the slicer builds one from the layer height.
  const custom = input.profile;
  const profile: LayerProfile =
    custom && custom.length >= 4 && Math.abs(custom[custom.length - 2]! - height) <= PROFILE_TOP_TOLERANCE ? custom : [0, layerHeight, height, layerHeight];

  const tops: number[] = [firstLayer];
  let printZ = firstLayer;
  let index = 0;
  let sliceZ = printZ + 0.5 * minLayer;
  while (sliceZ < height) {
    let layer = minLayer;
    if (index < profile.length) {
      let next = index + 2;
      while (next < profile.length && sliceZ >= profile[next]!) {
        index = next;
        next += 2;
      }
      const z1 = profile[index]!;
      const h1 = profile[index + 1]!;
      layer = h1;
      if (next < profile.length) {
        const z2 = profile[next]!;
        const h2 = profile[next + 1]!;
        layer = z2 > z1 ? h1 + (h2 - h1) * ((sliceZ - z1) / (z2 - z1)) : h1;
      }
    }
    if (!(layer > 0)) return null;
    sliceZ = printZ + 0.5 * layer;
    if (sliceZ >= height) break;
    printZ += layer;
    tops.push(printZ);
    if (tops.length > maxLayers) return null;
    sliceZ = printZ + 0.5 * minLayer;
  }
  return tops;
}

/** Several objects' layer tops as one plate's: sorted, heights closer than the slicer's closeness joined at their middle. */
export function mergeLayerTops(lists: ReadonlyArray<readonly number[]>): number[] {
  const all = lists.flat().sort((a, b) => a - b);
  const merged: number[] = [];
  for (let i = 0; i < all.length; ) {
    let j = i + 1;
    const zMax = all[i]! + EPSILON;
    while (j < all.length && all[j]! <= zMax) j++;
    merged.push(0.5 * (all[i]! + all[j - 1]!));
    i = j;
  }
  return merged;
}

/** The first layer (from 1) whose top is above `z`: the layer something starting at `z` starts in. */
export function layerStartingAt(tops: readonly number[], z: number): number {
  let lo = 0;
  let hi = tops.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid]! > z + EPSILON) hi = mid;
    else lo = mid + 1;
  }
  return Math.min(lo, tops.length - 1) + 1;
}

/** The layer (from 1) whose top is at or above `z`: the layer something ending at `z` ends in. */
export function layerEndingAt(tops: readonly number[], z: number): number {
  let lo = 0;
  let hi = tops.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid]! >= z - EPSILON) hi = mid;
    else lo = mid + 1;
  }
  return Math.min(lo, tops.length - 1) + 1;
}

/**
 * The layer (from 1) a pause stored at height `z` stops the print before, as `ToolOrdering::assign_custom_gcodes`
 * places it: the layer whose span, from halfway to the layer below to halfway to the layer above, holds `z` (the top
 * layer takes everything above it). Null for a pause below the first layer's middle, which the slicer drops.
 */
export function pauseLayerAt(tops: readonly number[], z: number): number | null {
  if (tops.length === 0) return null;
  const top = tops.length - 1;
  if (z > 0.5 * ((top > 0 ? tops[top - 1]! : 0) + tops[top]!)) return top + 1;
  let lo = 0;
  let hi = top;
  // The lowest layer whose upper half-way point is at or above z.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (0.5 * (tops[mid]! + tops[mid + 1]!) >= z) hi = mid;
    else lo = mid + 1;
  }
  const below = lo > 0 ? tops[lo - 1]! : 0;
  return z > 0.5 * (below + tops[lo]!) ? lo + 1 : null;
}
