// SPDX-License-Identifier: MIT
import type { JsonRecord } from "./types.js";

/**
 * Process keys Snapmaker Orca 2.4.0 stores per flow variant, as `[standard,
 * high_flow]`, on a tier that has high-flow tuning. Taken from projects
 * Snapmaker Orca itself saved on "0.20mm Standard @Snapmaker U1 (0.4 nozzle)"
 * (keys it writes as two-entry lists that a converted file carries as one
 * value). Snapmaker Orca then picks each toolhead's values from its entry in
 * `nozzle_volume_type`, so one print can run a high-flow toolhead and a
 * standard one at their own speeds; verified in sliced G-code.
 */
export const VARIANT_PROCESS_KEYS = [
  "accel_to_decel_enable", "accel_to_decel_factor", "bridge_acceleration", "bridge_speed", "default_acceleration",
  "default_jerk", "default_junction_deviation", "enable_overhang_speed", "extrusion_rate_smoothing_external_perimeter_only",
  "gap_infill_speed", "infill_jerk", "initial_layer_acceleration", "initial_layer_infill_speed", "initial_layer_jerk",
  "initial_layer_speed", "initial_layer_travel_speed", "inner_wall_acceleration", "inner_wall_jerk", "inner_wall_speed",
  "internal_bridge_speed", "internal_solid_infill_acceleration", "internal_solid_infill_speed", "ironing_speed",
  "max_volumetric_extrusion_rate_slope", "max_volumetric_extrusion_rate_slope_segment_length", "outer_wall_acceleration",
  "outer_wall_jerk", "outer_wall_speed", "overhang_1_4_speed", "overhang_2_4_speed", "overhang_3_4_speed",
  "overhang_4_4_speed", "slow_down_layers", "slowdown_for_curled_perimeters", "small_perimeter_speed",
  "small_perimeter_threshold", "sparse_infill_acceleration", "sparse_infill_speed", "support_interface_speed",
  "support_speed", "top_surface_acceleration", "top_surface_jerk", "top_surface_speed", "travel_acceleration",
  "travel_jerk", "travel_speed",
] as const;

const FLOW_VARIANTS = ["standard", "high_flow"];

/**
 * Which toolheads have the Liber High Flow Hotend, one entry per toolhead,
 * or null for none. `true` means all of them. A list must name every
 * toolhead (the U1 has four), so a short or long list is a caller error,
 * not something to guess about.
 */
export function resolveHighFlowSelection(value: boolean | readonly boolean[] | undefined, toolheads: number): boolean[] | null {
  if (value === undefined || value === false) return null;
  if (value === true) return new Array<boolean>(toolheads).fill(true);
  if (value.length !== toolheads) {
    throw new Error(`highFlowHotends lists ${value.length} toolhead(s), but this printer has ${toolheads}.`);
  }
  return value.some(Boolean) ? value.map(Boolean) : null;
}

/** The tier's own high-flow values, and the standard values they replace, for the keys Snapmaker tunes. */
export interface HighFlowTuning {
  standard: Record<string, string>;
  highFlow: Record<string, string>;
}

/**
 * Sets a converted project up for the Snapmaker Liber High Flow
 * Hotend on the selected toolheads, the way Snapmaker Orca saves it:
 *
 * - `nozzle_volume_type` lists every toolhead, "high_flow" or "standard",
 *   so the file matches the printer. Without it Snapmaker Orca opens the project
 *   with all toolheads on standard.
 * - On a tier with its own high-flow tuning, the process carries both
 *   variants: `process_flow_support`/`printer_flow_support` are
 *   `["standard", "high_flow"]` and every VARIANT_PROCESS_KEYS key becomes
 *   `[standard, high_flow]`. The tuned keys get Snapmaker's high-flow value
 *   in the second slot, unless the creator changed that value from the
 *   tier's standard one, in which case their value is used in both slots
 *   (a creator's tuning always wins, as it does for standard speeds).
 * - `filament_volume_type` says, per filament, whether it slices with its
 *   standard or its high-flow filament values (temperature, max volumetric
 *   speed, pressure advance...); Snapmaker Orca uses this, not the toolhead's own
 *   type, verified in sliced G-code. A filament takes the type of the
 *   toolhead it prints on: filament N prints as tool T(N-1), so filaments 1
 *   to 4 follow toolheads 1 to 4. Filaments beyond the toolhead count are
 *   swapped onto a toolhead chosen when printing, so they take the type all
 *   toolheads share, or standard (with a note) when the toolheads differ.
 * - A tier without high-flow tuning keeps its normal speeds, as it does in
 *   Snapmaker Orca, and gets a note saying so.
 *
 * Every key written is added to different_settings_to_system so Snapmaker Orca keeps
 * it instead of falling back to the system preset. Mutates `settings`.
 */
export function applyHighFlowHotends(settings: JsonRecord, selection: readonly boolean[], tuning: HighFlowTuning | null, warnings: string[]): void {
  const written = new Set<string>(["nozzle_volume_type"]);
  settings.nozzle_volume_type = selection.map((hasHighFlow) => (hasHighFlow ? "high_flow" : "standard"));

  // Project state like filament_colour, not a preset setting, so it isn't flagged in different_settings_to_system.
  const filamentTypes = settings.filament_volume_type;
  if (Array.isArray(filamentTypes)) {
    const shared = selection.every(Boolean) ? "high_flow" : selection.some(Boolean) ? null : "standard";
    settings.filament_volume_type = filamentTypes.map((_, i) => (i < selection.length ? (selection[i] ? "high_flow" : "standard") : (shared ?? "standard")));
    if (filamentTypes.length > selection.length && shared === null) {
      warnings.push(
        `  WARN: filaments ${selection.length + 1} and up share a toolhead chosen when printing, and only some toolheads have the Liber High Flow Hotend, so they use their standard filament values. In Snapmaker Orca, switch any that will print on a high-flow toolhead to high flow.`,
      );
    }
  }

  if (tuning) {
    for (const key of VARIANT_PROCESS_KEYS) {
      if (!(key in settings)) continue;
      const value = settings[key];
      if (Array.isArray(value) && value.length !== 1) continue;
      const single = Array.isArray(value) ? value[0] : value;
      settings[key] = [single, single];
      written.add(key);
    }
    for (const [key, highFlowValue] of Object.entries(tuning.highFlow)) {
      const current = settings[key];
      const standardValue = Array.isArray(current) ? current[0] : current;
      if (standardValue === undefined) continue;
      const creatorChanged = String(standardValue) !== String(tuning.standard[key]);
      settings[key] = [standardValue, creatorChanged ? standardValue : highFlowValue];
      written.add(key);
    }
    settings.process_flow_support = [...FLOW_VARIANTS];
    settings.printer_flow_support = [...FLOW_VARIANTS];
    written.add("process_flow_support");
    written.add("printer_flow_support");
  } else {
    warnings.push(
      "  WARN: this profile has no separate high-flow speeds in Snapmaker's presets, so it uses its normal speeds; the selected toolheads are still set to the Liber High Flow Hotend.",
    );
  }

  const diffs = settings.different_settings_to_system;
  if (Array.isArray(diffs) && typeof diffs[0] === "string") {
    const flagged = new Set(diffs[0].split(";").filter(Boolean));
    for (const key of written) flagged.add(key);
    settings.different_settings_to_system = [[...flagged].sort().join(";"), ...diffs.slice(1)];
  }
}
