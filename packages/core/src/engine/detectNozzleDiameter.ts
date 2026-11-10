// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** Nozzle diameters we carry a Snapmaker U1 profile for, smallest first. */
export const SUPPORTED_NOZZLE_DIAMETERS = ["0.2", "0.4", "0.6", "0.8"] as const;
export type KnownNozzleDiameter = (typeof SUPPORTED_NOZZLE_DIAMETERS)[number];
/** One of {@link SUPPORTED_NOZZLE_DIAMETERS}, or a size a later catalog added. */
export type SupportedNozzleDiameter = KnownNozzleDiameter | (string & {});

/**
 * Reads the Bambu source's own `nozzle_diameter` (blocklisted from the
 * merge itself, but still present in the raw uploaded project settings)
 * and snaps it to the nearest U1 nozzle size we carry a profile for.
 *
 * Bambu stores this as a per-extruder array (e.g. `["0.4","0.4","0.4","0.4"]`)
 * but a bare scalar is accepted too. Returns `null` when the value is
 * missing or unparseable so the caller can fall back to the default
 * profile rather than guess.
 */
export function detectNozzleDiameter(projectSettings: JsonRecord): SupportedNozzleDiameter | null {
  const raw = projectSettings.nozzle_diameter;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = typeof first === "string" ? Number.parseFloat(first) : typeof first === "number" ? first : NaN;
  if (!Number.isFinite(value)) return null;

  let closest: SupportedNozzleDiameter = SUPPORTED_NOZZLE_DIAMETERS[0];
  let closestDistance = Math.abs(value - Number.parseFloat(closest));
  for (const candidate of SUPPORTED_NOZZLE_DIAMETERS) {
    const distance = Math.abs(value - Number.parseFloat(candidate));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

/** What a conversion can be asked to convert for: a U1 nozzle size, or the creator's own ("match"). */
export const NOZZLE_CHOICES = [...SUPPORTED_NOZZLE_DIAMETERS, "match"] as const;
export type KnownNozzleChoice = (typeof NOZZLE_CHOICES)[number];
/** One of {@link NOZZLE_CHOICES}, or a size a later catalog added. */
export type NozzleChoice = KnownNozzleChoice | (string & {});
/** The nozzle size a conversion is for unless told otherwise: the U1's stock 0.4 mm, which most U1s run. */
export const DEFAULT_NOZZLE: KnownNozzleDiameter = "0.4";

export interface SourceNozzleSizes {
  /** The distinct nozzle sizes the project uses, as written (e.g. "0.2", "0.4"), smallest first. */
  sizes: string[];
  /** The project uses more than one size (Bambu Studio's multi-diameter mode, or several sizes in its nozzle list). */
  mixed: boolean;
  /** Each filament's nozzle size as the file maps it, or null where the file doesn't say. */
  filamentSizes: (string | null)[];
}

const sizeText = (value: unknown): string | null => {
  const n = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

/**
 * The nozzle sizes a source project uses. A single-nozzle file has one, its
 * `nozzle_diameter`. Bambu Studio's multi-nozzle printers (the H3C's nine
 * PrintTools) list each nozzle's size in `extruder_nozzle_diameter`, with
 * `multi_nozzle_diameter_mode` "1" when they differ, and map each filament
 * to a nozzle in `filament_nozzle_map`; `nozzle_diameter` then holds only
 * the first nozzle's size.
 */
export function sourceNozzleSizes(projectSettings: JsonRecord): SourceNozzleSizes {
  const perNozzle = Array.isArray(projectSettings.extruder_nozzle_diameter) ? projectSettings.extruder_nozzle_diameter.map(sizeText) : [];
  const first = Array.isArray(projectSettings.nozzle_diameter) ? projectSettings.nozzle_diameter.map(sizeText) : [sizeText(projectSettings.nozzle_diameter)];
  const listed = (perNozzle.some((s) => s !== null) ? perNozzle : first).filter((s): s is string => s !== null);
  const sizes = [...new Set(listed)].sort((a, b) => Number(a) - Number(b));
  const flagged = projectSettings.multi_nozzle_diameter_mode === "1" || projectSettings.multi_nozzle_diameter_mode === 1;
  const filamentCount = Array.isArray(projectSettings.filament_colour) ? projectSettings.filament_colour.length : 0;
  const map = Array.isArray(projectSettings.filament_nozzle_map) ? projectSettings.filament_nozzle_map : [];
  const filamentSizes = Array.from({ length: filamentCount }, (_, i): string | null => {
    if (sizes.length === 1) return sizes[0]!;
    const index = typeof map[i] === "string" ? Number.parseInt(map[i], 10) : typeof map[i] === "number" ? map[i] : NaN;
    return Number.isInteger(index) && index >= 0 && index < perNozzle.length ? perNozzle[index]! : null;
  });
  return { sizes, mixed: sizes.length > 1 || (flagged && sizes.length > 0), filamentSizes };
}
