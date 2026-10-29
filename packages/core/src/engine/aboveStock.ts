// SPDX-License-Identifier: MIT
/**
 * Values above Snapmaker's stock: which settings the user can choose for,
 * what happens when nobody chooses, and checking a choice from a caller
 *. The U1's machine limits are not part of the choice:
 * clampToMachineLimits caps every value at them afterwards, whatever is
 * chosen.
 *
 * - Print speeds carry the creator's value by default; the alternative is
 *   Snapmaker's stock value.
 * - Accelerations and travel speed keep Snapmaker's stock value when the
 *   creator's is higher (MIN_COMPARISON_KEYS); the alternative is the
 *   creator's value.
 * - Filament max volumetric speed is capped at 22/40 mm³/s by default; the
 *   alternative is the creator's value, uncapped.
 *
 * Settings the converter never takes from a source file (BLOCKLIST) aren't
 * offered.
 */
import { EXTRUDING_ACCELERATION_KEYS, SPEED_KEYS } from "./clampToMachineLimits.js";
import { BLOCKLIST, MIN_COMPARISON_KEYS } from "./policy.js";

export type AboveStockDefault = "keep" | "stock" | "capped";

/** What each covered setting does when nobody chooses. */
export const ABOVE_STOCK_DEFAULTS: Readonly<Record<string, AboveStockDefault>> = Object.freeze(
  Object.fromEntries([
    ...[...SPEED_KEYS, ...EXTRUDING_ACCELERATION_KEYS, "travel_acceleration"]
      .filter((key) => !BLOCKLIST.includes(key))
      .map((key) => [key, MIN_COMPARISON_KEYS.includes(key) ? "stock" : "keep"] as const),
    ["filament_max_volumetric_speed", "capped"] as const,
  ]),
);

/** A caller's choice for values above stock: settings to keep at the creator's value, and settings to set to Snapmaker's stock value. */
export interface AboveStockChoice {
  keep?: readonly string[];
  stock?: readonly string[];
}

export interface ResolvedAboveStockChoice {
  keep: ReadonlySet<string>;
  stock: ReadonlySet<string>;
}

const MAX_CHOICE_KEYS = 100;

/** Checks a choice; throws TypeError for anything that isn't one (unknown keys, a key in both lists, stock for max volumetric speed). */
export function resolveAboveStockChoice(choice: AboveStockChoice | undefined): ResolvedAboveStockChoice {
  const empty = { keep: new Set<string>(), stock: new Set<string>() };
  if (choice === undefined) return empty;
  if (choice === null || typeof choice !== "object" || Array.isArray(choice)) throw new TypeError("aboveStock must be an object with keep and stock lists.");
  const list = (value: unknown, name: string): Set<string> => {
    if (value === undefined) return new Set();
    if (!Array.isArray(value) || value.length > MAX_CHOICE_KEYS || !value.every((k) => typeof k === "string")) {
      throw new TypeError(`aboveStock.${name} must be a list of at most ${MAX_CHOICE_KEYS} setting keys.`);
    }
    for (const key of value) {
      if (!Object.hasOwn(ABOVE_STOCK_DEFAULTS, key)) throw new TypeError(`aboveStock.${name}: "${key.slice(0, 60)}" isn't a speed, acceleration or max volumetric speed you can choose for.`);
    }
    return new Set(value);
  };
  const keep = list(choice.keep, "keep");
  const stock = list(choice.stock, "stock");
  for (const key of keep) if (stock.has(key)) throw new TypeError(`aboveStock: "${key}" is in both keep and stock.`);
  if (stock.has("filament_max_volumetric_speed")) {
    throw new TypeError("aboveStock.stock can't include filament_max_volumetric_speed: filament values are the creator's; it's capped by default, or kept.");
  }
  return { keep, stock };
}

function positiveNumber(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The U1's machine limit for a speed or acceleration setting, from the printer's machine settings, or null if it has none. */
export function machineLimitFor(key: string, machine: Readonly<Record<string, unknown>>): number | null {
  if ((SPEED_KEYS as readonly string[]).includes(key)) {
    const x = positiveNumber(machine.machine_max_speed_x);
    const y = positiveNumber(machine.machine_max_speed_y);
    return x === null && y === null ? null : Math.min(x ?? Infinity, y ?? Infinity);
  }
  if ((EXTRUDING_ACCELERATION_KEYS as readonly string[]).includes(key)) return positiveNumber(machine.machine_max_acceleration_extruding);
  if (key === "travel_acceleration") return positiveNumber(machine.machine_max_acceleration_travel);
  return null;
}

/** The first number in a value (the standard entry of a per-variant list), or null. */
export function firstNumber(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string" && raw.endsWith("%")) return null;
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The largest number in a value (for per-slot lists like max volumetric speed), or null. */
export function largestNumber(value: unknown): number | null {
  const values = (Array.isArray(value) ? value : [value]).map((v) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN)).filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values) : null;
}
