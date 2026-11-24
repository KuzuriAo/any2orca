// SPDX-License-Identifier: MIT
/**
 * What a result says about layers the nozzle doesn't support: the creator's layers thinner than the printer's minimum
 * layer height for the nozzle, or thicker than its maximum. Snapmaker Orca slices them as they are, without a warning.
 */
import type { PlateFilaments } from "../archive/plateFilaments.js";
import { plainText } from "../plainText.js";

/** How far past the limit a layer must be to count, in mm: layer tops are sums of floating point heights. */
const TOLERANCE = 1e-4;
/** The most objects a note names, and the longest name it quotes. */
const MAX_NAMED = 3;
const MAX_NAME = 40;

/** "0.12", "0.4": three decimals at most, trailing zeros dropped. */
const mm = (value: number): string => `${Number(value.toFixed(3))}`;

/** "Cow", "Cow and Base", "Cow, Base and Tail", "Cow, Base, Tail and 2 more". A name comes from the file: cleaned and cut. */
function nameList(ids: readonly string[], names: ReadonlyMap<string, string>): string {
  const shown = ids.slice(0, MAX_NAMED).map((id) => {
    // Newlines and tabs survive plainText; the replacement character it leaves for a control character is dropped.
    const clean = plainText(names.get(id) ?? "").replace(/[\s\uFFFD]+/g, " ").trim().slice(0, MAX_NAME).trim();
    return clean !== "" ? clean : `object ${id.replace(/[^0-9A-Za-z_-]/g, "").slice(0, 12)}`;
  });
  const more = ids.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * The notes for a project's layers against the nozzle's limits, one for layers that are too thin and one for layers
 * that are too thick, each only when it applies. Where the layers come from an object's variable layer heights, the
 * note names the objects, since setting a layer height in Snapmaker Orca doesn't clear those.
 *
 * @param nozzleSize the nozzle's diameter in mm, as the profile names it
 * @param limits the thinnest and thickest layer the nozzle supports, from the converted file's own printer settings
 * @param objectNames each object's name by its id
 */
export function layerHeightNotes(
  plates: readonly PlateFilaments[],
  nozzleSize: string,
  limits: { min: number; max: number },
  objectNames: ReadonlyMap<string, string> = new Map(),
): string[] {
  if (!(limits.min > 0) || !(limits.max >= limits.min)) return [];
  let thinnest = Infinity;
  let thickest = 0;
  const variable = new Map<string, { thinnest: number; thickest: number }>();
  for (const plate of plates) {
    if (!plate.layerHeights) continue;
    thinnest = Math.min(thinnest, plate.layerHeights.thinnest);
    thickest = Math.max(thickest, plate.layerHeights.thickest);
    for (const v of plate.layerHeights.variable ?? []) {
      const known = variable.get(v.object);
      variable.set(v.object, { thinnest: Math.min(known?.thinnest ?? Infinity, v.thinnest), thickest: Math.max(known?.thickest ?? 0, v.thickest) });
    }
  }
  const supports = `The U1's ${nozzleSize} mm nozzle supports layers from ${mm(limits.min)} to ${mm(limits.max)} mm.`;
  const stay = "The layers stay as the creator set them, and Snapmaker Orca slices them that way without a warning.";
  const change = "To change that, set the layers to heights in that range in Snapmaker Orca.";
  const changeOthers = "To change the other layers, set them to heights in that range in Snapmaker Orca.";

  /** The sentence about what to do: for variable layer heights, which objects and how; for the rest, set heights. */
  const what = (outside: (v: { thinnest: number; thickest: number }) => boolean, overall: number, extreme: (v: { thinnest: number; thickest: number }) => number, beyond: (a: number, b: number) => boolean): string => {
    const ids = [...variable].filter(([, v]) => outside(v)).map(([id]) => id);
    if (ids.length === 0) return change;
    const those = ids.length === 1 ? "that object" : "those objects";
    const vary = `The creator made the layer height vary on ${nameList(ids, objectNames)} (variable layer heights), and a layer height set in Snapmaker Orca doesn't clear that: reset the variable layer heights on ${those}, or apply them again with settings that suit this nozzle. The file doesn't say which settings the creator used.`;
    // Other layers, outside the range too, that no variable layer heights explain.
    const othersOut = ids.every((id) => beyond(overall, extreme(variable.get(id)!)));
    return othersOut ? `${vary} ${changeOthers}` : vary;
  };

  const notes: string[] = [];
  if (thinnest < limits.min - TOLERANCE) {
    const how = what((v) => v.thinnest < limits.min - TOLERANCE, thinnest, (v) => v.thinnest, (a, b) => a < b - TOLERANCE);
    notes.push(`The project has layers as thin as ${mm(thinnest)} mm. ${supports} ${stay} ${how}`);
  }
  if (thickest > limits.max + TOLERANCE) {
    const how = what((v) => v.thickest > limits.max + TOLERANCE, thickest, (v) => v.thickest, (a, b) => a > b + TOLERANCE);
    notes.push(`The project has layers as thick as ${mm(thickest)} mm. ${supports} ${stay} ${how}`);
  }
  return notes;
}

/** The nozzle's limits from a project's `min_layer_height` and `max_layer_height` (one entry per toolhead, or one value). */
export function layerLimitsOf(projectSettings: Readonly<Record<string, unknown>>): { min: number; max: number } | null {
  const numbers = (value: unknown): number[] => (Array.isArray(value) ? value : [value]).map((v) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN)).filter((n) => Number.isFinite(n) && n > 0);
  const mins = numbers(projectSettings.min_layer_height);
  const maxes = numbers(projectSettings.max_layer_height);
  if (mins.length === 0 || maxes.length === 0) return null;
  return { min: Math.max(...mins), max: Math.min(...maxes) };
}
