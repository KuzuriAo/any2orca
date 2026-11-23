// SPDX-License-Identifier: MIT
/**
 * What a result says about layers the nozzle doesn't take: the creator's layers thinner than the printer's minimum
 * layer height for the nozzle, or thicker than its maximum. Snapmaker Orca slices them as they are, without a warning.
 */
import type { PlateFilaments } from "../archive/plateFilaments.js";

/** How far past the limit a layer must be to count, in mm: layer tops are sums of floating point heights. */
const TOLERANCE = 1e-4;

/** "0.12", "0.4": three decimals at most, trailing zeros dropped. */
const mm = (value: number): string => `${Number(value.toFixed(3))}`;

/**
 * The notes for a project's layers against the nozzle's limits, one for layers that are too thin and one for layers
 * that are too thick, each only when it applies.
 *
 * @param nozzleSize the nozzle's diameter in mm, as the profile names it
 * @param limits the thinnest and thickest layer the nozzle takes, from the converted file's own printer settings
 */
export function layerHeightNotes(plates: readonly PlateFilaments[], nozzleSize: string, limits: { min: number; max: number }): string[] {
  if (!(limits.min > 0) || !(limits.max >= limits.min)) return [];
  let thinnest = Infinity;
  let thickest = 0;
  for (const plate of plates) {
    if (!plate.layerHeights) continue;
    thinnest = Math.min(thinnest, plate.layerHeights.thinnest);
    thickest = Math.max(thickest, plate.layerHeights.thickest);
  }
  const range = `${mm(limits.min)} to ${mm(limits.max)} mm`;
  const how = "They stay as the creator set them, and Snapmaker Orca slices them that way without a warning.";
  const change = `To change that, set the layers to heights from ${range} in Snapmaker Orca.`;
  const notes: string[] = [];
  if (thinnest < limits.min - TOLERANCE) {
    notes.push(`The project has layers as thin as ${mm(thinnest)} mm, thinner than the ${mm(limits.min)} mm the U1's ${nozzleSize} mm nozzle takes. ${how} ${change}`);
  }
  if (thickest > limits.max + TOLERANCE) {
    notes.push(`The project has layers as thick as ${mm(thickest)} mm, thicker than the ${mm(limits.max)} mm the U1's ${nozzleSize} mm nozzle takes. ${how} ${change}`);
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
