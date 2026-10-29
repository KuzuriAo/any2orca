// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/** Print and travel speeds, mm/s. Limited by the machine's X/Y maximum speed. */
export const SPEED_KEYS = [
  "outer_wall_speed",
  "inner_wall_speed",
  "sparse_infill_speed",
  "internal_solid_infill_speed",
  "top_surface_speed",
  "gap_infill_speed",
  "bridge_speed",
  "support_speed",
  "support_interface_speed",
  "ironing_speed",
  "initial_layer_speed",
  "initial_layer_infill_speed",
  "overhang_1_4_speed",
  "overhang_2_4_speed",
  "overhang_3_4_speed",
  "overhang_4_4_speed",
  "skirt_speed",
  "travel_speed",
] as const;

/** Accelerations while extruding, mm/s². Limited by the machine's maximum extruding acceleration. */
export const EXTRUDING_ACCELERATION_KEYS = [
  "default_acceleration",
  "outer_wall_acceleration",
  "inner_wall_acceleration",
  "top_surface_acceleration",
  "initial_layer_acceleration",
  "bridge_acceleration",
  "sparse_infill_acceleration",
  "internal_solid_infill_acceleration",
] as const;

function firstNumber(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Caps speeds and accelerations that came from the source file at the U1's
 * own machine limits from its profile (machine_max_speed_x/y,
 * machine_max_acceleration_extruding/travel), never at any particular source
 * printer's numbers. A source made for a faster printer can't ask the U1 for
 * more than it allows.
 *
 * Snapmaker's stock values are never changed, even where Snapmaker's profile
 * sets one above its own machine limit (the 0.20mm Standard high-flow speeds
 * are 600 mm/s against a 500 mm/s limit); the printer applies the limit to
 * those itself. So only entries that differ from the U1 profile's own value
 * are capped. Percentages (relative to another setting) and "nil" entries
 * are left alone, and so is any setting whose limit the machine profile
 * doesn't give.
 */
export function clampToMachineLimits(settings: JsonRecord, baseline: JsonRecord, machineSettings: JsonRecord, warnings: string[]): void {
  const maxSpeed = Math.min(firstNumber(machineSettings.machine_max_speed_x) ?? Infinity, firstNumber(machineSettings.machine_max_speed_y) ?? Infinity);
  const maxExtruding = firstNumber(machineSettings.machine_max_acceleration_extruding) ?? Infinity;
  const maxTravel = firstNumber(machineSettings.machine_max_acceleration_travel) ?? Infinity;
  const limits: Array<[readonly string[], number, string]> = [
    [SPEED_KEYS, maxSpeed, "mm/s"],
    [EXTRUDING_ACCELERATION_KEYS, maxExtruding, "mm/s²"],
    [["travel_acceleration"], maxTravel, "mm/s²"],
  ];
  for (const [keys, limit, unit] of limits) {
    if (!Number.isFinite(limit)) continue;
    for (const key of keys) {
      const value = settings[key];
      if (value === undefined) continue;
      const stock = baseline[key];
      const stockEntry = (i: number): unknown => (Array.isArray(stock) ? (stock[i] ?? stock[0]) : stock);
      const clamp = (entry: unknown, i: number): unknown => {
        if (typeof entry !== "string" || entry.endsWith("%") || entry === "nil" || entry === stockEntry(i)) return entry;
        const n = Number(entry);
        return Number.isFinite(n) && n > limit ? String(limit) : entry;
      };
      const clamped = Array.isArray(value) ? value.map(clamp) : clamp(value, 0);
      if (JSON.stringify(clamped) !== JSON.stringify(value)) {
        settings[key] = clamped;
        warnings.push(`  WARN: ${key} lowered to ${limit} ${unit}, the U1's machine limit.`);
      }
    }
  }
}
