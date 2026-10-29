// SPDX-License-Identifier: MIT
import { detectHighFlowVariantIndex } from "./detectVariantIndex.js";
import { filamentVariantLayout } from "./filamentVariantLayout.js";
import type { JsonRecord } from "./types.js";

/**
 * Filament settings that Snapmaker Orca 2.4 stores once per flow variant
 * (standard, high flow) on a nozzle with a high-flow option. Mirrors
 * `filament_flow_variant_options()` in Snapmaker Orca's PrintConfig.cpp.
 */
export const FILAMENT_FLOW_VARIANT_KEYS = [
  "filament_flow_ratio",
  "enable_pressure_advance",
  "pressure_advance",
  "nozzle_temperature_initial_layer",
  "nozzle_temperature",
  "filament_max_volumetric_speed",
  "fan_min_speed",
  "fan_max_speed",
  "additional_cooling_fan_speed",
  "filament_retraction_length",
  "filament_retraction_speed",
  "filament_deretraction_speed",
  "filament_z_hop_types",
  "filament_wipe_distance",
  "filament_retract_length_toolchange",
  "filament_multitool_ramming",
  "filament_multitool_ramming_volume",
  "filament_multitool_ramming_flow",
  "filament_minimal_purge_on_wipe_tower",
] as const;

/**
 * The most plastic per second a converted file asks for, mm³/s. These are
 * Snapmaker's own numbers for its fastest stock U1 filament (Snapmaker PLA
 * Matte @U1: 22 standard, 40 high flow). A creator's lower value is kept.
 */
export const MAX_VOLUMETRIC_SPEED = { standard: 22, highFlow: 40 } as const;

const cap = (value: unknown, limit: number): unknown => {
  if (typeof value !== "string" || value === "nil") return value;
  const n = Number(value);
  return Number.isFinite(n) && n > limit ? String(limit) : value;
};

/**
 * Lays out the per-variant filament settings the way Snapmaker Orca does
 * and caps each filament's max volumetric speed.
 *
 * On a nozzle with a high-flow option (the U1's 0.4), every per-variant
 * setting gets two values per filament, standard then high flow, with
 * `filament_flow_step_size` 2 and the matching `filament_flow_support`
 * declarations; which one a filament prints with is chosen in Snapmaker
 * Orca when it's assigned to a toolhead (`filament_volume_type`, standard
 * until then). The standard value is what the converter already has for
 * each slot. The high-flow value is the source's own high-flow value when
 * the source has one (Bambu Studio stores both, named by variant; Snapmaker
 * Orca stores both, tagged by filament_flow_support, see
 * filamentVariantLayout.ts), otherwise Snapmaker's stock high-flow value
 * for settings the source doesn't carry, otherwise the standard value.
 *
 * Other nozzle sizes keep one value per filament.
 *
 * Max volumetric speed is then capped at 22 mm³/s for a standard toolhead
 * and 40 mm³/s for a high-flow one (`MAX_VOLUMETRIC_SPEED`).
 *
 * @param fromSource filament keys whose per-slot values came from the source.
 */
export function applyFilamentFlowVariants(
  settings: JsonRecord,
  source: JsonRecord,
  baseline: JsonRecord,
  highFlowSupported: boolean,
  fromSource: ReadonlySet<string>,
  slotCount: number,
  warnings: string[],
  options: { capVolumetricSpeed?: boolean } = {},
): void {
  if (slotCount < 1) return;
  const perSlot = (value: unknown) => Array.from({ length: slotCount }, () => value);

  if (!highFlowSupported) {
    settings.filament_flow_step_size = perSlot("1");
    settings.filament_flow_support = perSlot("standard");
    settings.filament_volume_type = perSlot("standard");
  } else {
    const sourceHighFlow = detectHighFlowVariantIndex(source);
    const layout = filamentVariantLayout(source, slotCount);
    for (const key of FILAMENT_FLOW_VARIANT_KEYS) {
      const standard = settings[key];
      if (!Array.isArray(standard) || standard.length !== slotCount) continue;
      const fromSourceValues = source[key];
      const group = Array.isArray(fromSourceValues) && fromSourceValues.length % slotCount === 0 ? fromSourceValues.length / slotCount : 0;
      const stock = baseline[key];
      const highFlowFor = (i: number): unknown => {
        if (fromSource.has(key)) {
          if (layout && Array.isArray(fromSourceValues) && fromSourceValues.length === layout.length) {
            const position = layout.slots[i].highFlow;
            return position === null ? standard[i] : fromSourceValues[position];
          }
          return sourceHighFlow !== null && group > sourceHighFlow ? (fromSourceValues as unknown[])[i * group + sourceHighFlow] : standard[i];
        }
        return Array.isArray(stock) && stock.length >= 2 ? stock[1] : standard[i];
      };
      settings[key] = standard.flatMap((value, i) => [value, highFlowFor(i)]);
    }
    settings.filament_flow_step_size = perSlot("2");
    settings.filament_flow_support = Array.from({ length: slotCount }, () => ["standard", "high_flow"]).flat();
    settings.filament_volume_type = perSlot("standard");
  }

  const speeds = settings.filament_max_volumetric_speed;
  if (!Array.isArray(speeds) || options.capVolumetricSpeed === false) return;
  const step = highFlowSupported ? 2 : 1;
  const capped = speeds.map((value, i) => cap(value, step === 2 && i % 2 === 1 ? MAX_VOLUMETRIC_SPEED.highFlow : MAX_VOLUMETRIC_SPEED.standard));
  if (JSON.stringify(capped) !== JSON.stringify(speeds)) {
    settings.filament_max_volumetric_speed = capped;
    warnings.push(
      `  WARN: Filament max volumetric speed lowered to at most ${MAX_VOLUMETRIC_SPEED.standard} mm³/s${highFlowSupported ? ` (${MAX_VOLUMETRIC_SPEED.highFlow} mm³/s on a high-flow toolhead)` : ""}, Snapmaker's value for its fastest U1 filament. Raise it in Snapmaker Orca if your filament can melt faster.`,
    );
  }
}
