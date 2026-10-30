// SPDX-License-Identifier: MIT
/**
 * Conversion policy: which source settings are dropped, which are always
 * kept, which are forced, and which filament keys never transfer. These are
 * the project's own decisions, applied the same way to every profile, so they live in the
 * core rather than in the profile data.
 */
export const BLOCKLIST: readonly string[] = [
  "version",
  "printer_model",
  "print_settings_id",
  "printer_settings_id",
  "exclude_object",
  "filename_format",
  "different_settings_to_system",
  "standby_temperature_delta",
  "preheat_time",
  "printable_area",
  "bed_exclude_area",
  "printable_height",
  "extruder_clearance_height_to_lid",
  "extruder_clearance_height_to_rod",
  "extruder_clearance_radius",
  "gcode_flavor",
  "bed_custom_model",
  "bed_custom_texture",
  "nozzle_type",
  "nozzle_volume",
  "nozzle_diameter",
  "max_layer_height",
  "min_layer_height",
  "machine_max_acceleration_e",
  "machine_max_acceleration_extruding",
  "machine_max_acceleration_retracting",
  "machine_max_acceleration_travel",
  "machine_max_acceleration_x",
  "machine_max_acceleration_y",
  "machine_max_acceleration_z",
  "machine_max_jerk_e",
  "machine_max_jerk_x",
  "machine_max_jerk_y",
  "machine_max_jerk_z",
  "machine_max_speed_e",
  "machine_max_speed_x",
  "machine_max_speed_y",
  "machine_max_speed_z",
  "machine_min_extruding_rate",
  "machine_min_travel_rate",
  "accel_to_decel_enable",
  "travel_jerk",
  "default_jerk",
  "infill_jerk",
  "initial_layer_jerk",
  "inner_wall_jerk",
  "outer_wall_jerk",
  "top_surface_jerk",
];

// The customization gate: unless the source's own
// different_settings_to_system flags a key as something the creator
// actually customized in Bambu Studio -- not just any transferable
// difference, which is often just Bambu's own printer/preset default
// reported incidentally -- the selected U1 tier's own tuned value wins.
// BLOCKLIST and MIN_COMPARISON_KEYS are handled separately/take
// precedence; every other key goes through this gate in
// buildProjectSettings.ts. Without it, a real conversion had wipe_speed, seam_gap, min_width_top_surface, and
// bridge_flow/bridge_density all diverged from the selected U1 tier's own
// values even though the creator never touched any of them in Bambu Studio.
//
// MIN_COMPARISON_KEYS: travel_speed and every feature-level *_acceleration
// setting describe what's mechanically safe/appropriate on the U1
// specifically, not a portable creator preference -- so instead of the
// customization gate above, Bambu's value is honored only when it's LOWER
// (more conservative) than the U1 tier's own default, regardless of
// whether the creator explicitly customized it; a HIGHER Bambu value is
// always ignored, since it could exceed what's actually safe/intended on
// this different printer. Deliberately excludes machine_max_*/*_jerk
// (BLOCKLIST, above) -- those have no meaningful "creator preference vs.
// mechanical limit" spectrum at all, so they stay a hard block rather than
// a comparison.
export const MIN_COMPARISON_KEYS: readonly string[] = [
  "travel_speed",
  "bridge_acceleration",
  "default_acceleration",
  "initial_layer_acceleration",
  "inner_wall_acceleration",
  "internal_solid_infill_acceleration",
  "outer_wall_acceleration",
  "sparse_infill_acceleration",
  "top_surface_acceleration",
  "travel_acceleration",
];

// Keys that must always
// track Bambu's real value, regardless of the customization-flag gate
// every other key goes through. Two distinct reasons land a key here:
//
// 1. print_sequence: not a quality/taste preference at all -- it's
//    coupled to the object LAYOUT that computeShifts already relies on.
//    "By Object" needs real XY clearance between every object's full
//    height; "By Layer" needs none. Bambu Studio's own object placement/
//    spacing in the source file was computed assuming whichever mode
//    Bambu actually used. A real conversion caught this directly: the
//    source used "by layer" (unflagged, since it's Bambu's own default,
//    not something the creator toggled) but the U1 templates default to
//    "by object", producing real bounding-box overlaps once printed with
//    clearance the source layout never accounted for.
//
// 2. sparse_infill_density/skin_infill_density/skeleton_infill_density:
//    a genuine, deliberate creator strength/print-time choice -- but
//    Bambu's different_settings_to_system only flags a DEVIATION FROM
//    BAMBU'S OWN preset, not "did the creator ever think about this
//    setting." A creator who saved/selected a custom Bambu preset with
//    15% infill baked in never "customizes" it away from that preset's
//    own default, so Bambu never flags it -- even though 15% vs. the U1
//    tier's own 10% is exactly the kind of thing the customization gate
//    was meant to catch. A real conversion caught this directly: all
//    three showed the U1 tier's own (lower) density instead of the
//    source's real, unflagged 15%.
//
// 3. initial_layer_print_height: same underlying reason as #2 (Bambu's
//    flag doesn't cover a custom-preset's own baked-in value). Unlike
//    layer_height (NOT in this set: it's tier-defining and stays gated).
//
// 4. brim_type: not a cosmetic/taste preference like most gated keys --
//    it's a bed-adhesion decision, and losing it silently can mean the
//    difference between a print succeeding and failing outright, not
//    just looking slightly different. Same root cause as #2/#3: a
//    source printer's own un-customized default (e.g. a Bambu H2D
//    profile defaulting to "auto_brim") never gets flagged in
//    different_settings_to_system, so the ordinary gated path silently
//    replaced it with the U1 tier's own "no_brim" default, as seen
//    in a real conversion.
export const ALWAYS_TRANSFER_KEYS: readonly string[] = [
  "print_sequence",
  "sparse_infill_density",
  "skin_infill_density",
  "skeleton_infill_density",
  "initial_layer_print_height",
  "brim_type",
];

// Settings that always keep the U1 profile's own value, whatever the source
// file says. The profile is Snapmaker's stock profile for the pinned
// release, so these follow Snapmaker's updates; nothing here is a number of
// ours. They never transfer for one of two reasons:
//
// - The source's value doesn't suit the U1's Klipper firmware:
//   enable_arc_fitting (arc moves are a Marlin-style feature).
// - The value is specific to the source printer or file layout and has no
//   safe meaning on the U1: ensure_vertical_shell_thickness (Bambu Studio
//   uses different options), ooze_prevention and tree_support_wall_count
//   (tuned for the U1's toolchanger), and the filament slot used for walls
//   and infill (wall_filament, sparse_infill_filament,
//   solid_infill_filament).
//
// Tuning values (raft first-layer expansion, single-extruder priming,
// prime tower values) are not here: they follow the ordinary rule,
// Snapmaker's stock value unless the creator changed it.
export const U1_VALUE_KEYS: readonly string[] = [
  "enable_arc_fitting",
  "ensure_vertical_shell_thickness",
  "ooze_prevention",
  "tree_support_wall_count",
  "wall_filament",
  "sparse_infill_filament",
  "solid_infill_filament",
];

// Printer (machine) settings never transfer from a source file: they belong
// to the U1 printer profile. This is the key set of Snapmaker's U1 machine
// preset (packages/profiles/templates/machine_settings_1.config; a test keeps
// the two in step). Together with every G-code key (see isGcodeKey) and
// `from`, these always keep the U1 profile's value.
export const MACHINE_SETTINGS_KEYS: readonly string[] = [
  "auxiliary_fan",
  "bed_exclude_area",
  "bed_model",
  "bed_texture",
  "before_layer_change_gcode",
  "change_filament_gcode",
  "default_bed_type",
  "default_filament_profile",
  "default_print_profile",
  "deretraction_speed",
  "enable_filament_ramming",
  "extruder_clearance_height_to_lid",
  "extruder_clearance_height_to_rod",
  "extruder_clearance_radius",
  "extruder_colour",
  "extruder_offset",
  "gcode_flavor",
  "host_type",
  "is_custom_defined",
  "layer_change_gcode",
  "long_retractions_when_cut",
  "machine_end_gcode",
  "machine_load_filament_time",
  "machine_max_acceleration_e",
  "machine_max_acceleration_extruding",
  "machine_max_acceleration_retracting",
  "machine_max_acceleration_travel",
  "machine_max_acceleration_x",
  "machine_max_acceleration_y",
  "machine_max_acceleration_z",
  "machine_max_jerk_e",
  "machine_max_jerk_x",
  "machine_max_jerk_y",
  "machine_max_jerk_z",
  "machine_max_speed_e",
  "machine_max_speed_x",
  "machine_max_speed_y",
  "machine_max_speed_z",
  "machine_min_extruding_rate",
  "machine_min_travel_rate",
  "machine_pause_gcode",
  "machine_start_gcode",
  "machine_tool_change_time",
  "machine_unload_filament_time",
  "max_layer_height",
  "min_layer_height",
  "name",
  "nozzle_diameter",
  "nozzle_type",
  "nozzle_volume",
  "printable_area",
  "printable_height",
  "printer_flow_support",
  "printer_model",
  "printer_notes",
  "printer_settings_id",
  "printer_technology",
  "printer_variant",
  "purge_in_prime_tower",
  "ramming_pressure_advance_value",
  "retract_before_wipe",
  "retract_length_toolchange",
  "retract_lift_above",
  "retract_lift_below",
  "retract_lift_enforce",
  "retract_restart_extra",
  "retract_restart_extra_toolchange",
  "retract_when_changing_layer",
  "retraction_distances_when_cut",
  "retraction_length",
  "retraction_minimum_travel",
  "retraction_speed",
  "scan_first_layer",
  "silent_mode",
  "single_extruder_multi_material",
  "thumbnails",
  "tool_change_temprature_wait",
  "travel_slope",
  "wipe",
  "wipe_distance",
  "z_hop",
  "z_hop_types",
  "z_hop_when_prime",
  "from",
];

/**
 * Every kind of G-code: start, end, by object, layer change, time lapse, filament
 * change, extrusion role change, pause, template, a filament's own start and end,
 * and any added later. It runs on the printer, and a source file's G-code was
 * written for another printer (even a filament preset's: Bambu's switches its
 * chamber fan, Creality Print's moves Z for the K2), so it always keeps the U1
 * profile's value. Snapmaker's U1 filaments carry only a comment there.
 */
export function isGcodeKey(key: string): boolean {
  return key.endsWith("_gcode");
}

/** Filament keys that always keep the U1 profile's value, besides every G-code key (see {@link isGcodeKey}). */
export const FILAMENT_KEY_BLOCKLIST: readonly string[] = [
  "compatible_printers",
  "compatible_printers_condition",
  "compatible_prints",
  "compatible_prints_condition",
];
