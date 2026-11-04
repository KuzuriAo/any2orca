// SPDX-License-Identifier: MIT
/**
 * How each PrusaSlicer setting key becomes a Snapmaker Orca one. The table is
 * the decision record: every key a PrusaSlicer project can carry has a rule,
 * and a key without one is a failing test, not a silent passthrough (see
 * keyMap.test.ts, which also checks every target against the settings
 * catalog). The rules are written as pairs so the other direction can reuse
 * the table later.
 *
 * Both slicers descend from Slic3r, so about a third of the keys share a name
 * and a value form. The rest were renamed when Bambu Studio took the Slic3r
 * settings over ("perimeters" became "wall_loops"), changed their value set,
 * or exist on one side only.
 *
 * - `same`: the same key and value form on both sides.
 * - `rename`: a different key, the same value form; `to` may name several
 *   keys when Snapmaker Orca keeps one PrusaSlicer value in several places
 *   (the bed temperature, which Orca keeps per plate type).
 * - `choices`: a renamed key with a fixed set of values, each mapped; a value
 *   not in the map isn't carried, with a warning.
 * - `transform`: a value that needs computing (a percentage resolved to a
 *   number, a flag folded into a mode), by name; the code is in
 *   convertSettings.ts.
 * - `drop`: no counterpart; reported, so the creator's settings that can't
 *   be carried are named.
 * - `machine`: the printer's own (bed shape, G-code, motion limits, host):
 *   the U1 profile's values stand, so it's left behind without a report.
 * - `handled`: read by another part of the reader (the color changes, the
 *   filament colors), not by the settings map.
 */

export type PrusaTransform =
  | "arcFitting"
  | "filamentColour"
  | "filamentZHopTypes"
  | "filamentType"
  | "firstLayerHeight"
  | "gapFillTarget"
  | "infillCombination"
  | "invertBool"
  | "ironingType"
  | "onlyOneWallTop"
  | "percentComplement"
  | "percentOfFirstLayerSpeed"
  | "percentOfInfillSpeed"
  | "percentOfPerimeterSpeed"
  | "percentOfSolidInfillSpeed"
  | "percentOfSupportSpeed"
  | "percentOnly"
  | "printSequence"
  | "solidEveryLayers"
  | "supportBottomZ"
  | "supportThreshold"
  | "supportType"
  | "supportXySpacing"
  | "wallDirection"
  | "wallSequence"
  | "zHopTypes";

export type PrusaKeyRule =
  | { readonly kind: "same" }
  | { readonly kind: "rename"; readonly to: string | readonly string[] }
  | { readonly kind: "choices"; readonly to: string; readonly values: Readonly<Record<string, string>> }
  | { readonly kind: "transform"; readonly to: string | readonly string[]; readonly via: PrusaTransform }
  | { readonly kind: "drop"; readonly why: string }
  | { readonly kind: "machine" }
  | { readonly kind: "handled" };

const same: PrusaKeyRule = { kind: "same" };
const machine: PrusaKeyRule = { kind: "machine" };
const handled: PrusaKeyRule = { kind: "handled" };
const rename = (to: string | readonly string[]): PrusaKeyRule => ({ kind: "rename", to });
const drop = (why: string): PrusaKeyRule => ({ kind: "drop", why });
const choices = (to: string, values: Readonly<Record<string, string>>): PrusaKeyRule => ({ kind: "choices", to, values });
const transform = (to: string | readonly string[], via: PrusaTransform): PrusaKeyRule => ({ kind: "transform", to, via });

/** PrusaSlicer's `;`-joined G-code keys carry Prusa's own macros and the source printer's moves; the U1's own G-code is used. */
const PRUSA_GCODE = "the source printer's G-code; the U1's own is used";
const NO_COUNTERPART = "no Snapmaker Orca counterpart";
const INFILL_PATTERNS: Readonly<Record<string, string>> = {
  rectilinear: "rectilinear",
  alignedrectilinear: "alignedrectilinear",
  grid: "grid",
  triangles: "triangles",
  cubic: "cubic",
  line: "line",
  concentric: "concentric",
  honeycomb: "honeycomb",
  "3dhoneycomb": "3dhoneycomb",
  gyroid: "gyroid",
  hilbertcurve: "hilbertcurve",
  archimedeanchords: "archimedeanchords",
  octagramspiral: "octagramspiral",
  adaptivecubic: "adaptivecubic",
  supportcubic: "supportcubic",
  lightning: "lightning",
  zigzag: "zigzag",
  // PrusaSlicer's "stars" has no Snapmaker Orca pattern; not carried.
};
const SURFACE_PATTERNS: Readonly<Record<string, string>> = {
  rectilinear: "rectilinear",
  monotonic: "monotonic",
  monotoniclines: "monotonicline",
  alignedrectilinear: "alignedrectilinear",
  concentric: "concentric",
  hilbertcurve: "hilbertcurve",
  archimedeanchords: "archimedeanchords",
  octagramspiral: "octagramspiral",
};

/**
 * Every key, in PrusaSlicer's own groups: print, filament, printer, then the
 * keys only older PrusaSlicer versions wrote.
 */
export const PRUSA_KEY_MAP: Readonly<Record<string, PrusaKeyRule>> = Object.freeze({
  // ---- Print: layers and perimeters ----
  layer_height: same,
  first_layer_height: transform("initial_layer_print_height", "firstLayerHeight"),
  perimeters: rename("wall_loops"),
  spiral_vase: rename("spiral_mode"),
  slice_closing_radius: same,
  slicing_mode: same,
  resolution: drop("PrusaSlicer's slice resolution; Snapmaker Orca's resolution is the G-code one, taken from gcode_resolution"),
  gcode_resolution: rename("resolution"),
  top_solid_layers: rename("top_shell_layers"),
  bottom_solid_layers: rename("bottom_shell_layers"),
  top_solid_min_thickness: rename("top_shell_thickness"),
  bottom_solid_min_thickness: rename("bottom_shell_thickness"),
  extra_perimeters: drop(NO_COUNTERPART),
  extra_perimeters_on_overhangs: same,
  avoid_crossing_curled_overhangs: drop(NO_COUNTERPART),
  avoid_crossing_perimeters: rename("reduce_crossing_wall"),
  avoid_crossing_perimeters_max_detour: rename("max_travel_detour_distance"),
  only_retract_when_crossing_perimeters: rename("reduce_infill_retraction"),
  thin_walls: rename("detect_thin_wall"),
  thick_bridges: same,
  overhangs: rename("detect_overhang_wall"),
  seam_position: choices("seam_position", { random: "random", nearest: "nearest", aligned: "aligned", rear: "back" }),
  staggered_inner_seams: same,
  seam_gap_distance: rename("seam_gap"),
  scarf_seam_placement: choices("seam_slope_type", { nowhere: "none", contours: "external", everywhere: "all" }),
  scarf_seam_only_on_smooth: rename("seam_slope_conditional"),
  scarf_seam_start_height: rename("seam_slope_start_height"),
  scarf_seam_entire_loop: rename("seam_slope_entire_loop"),
  scarf_seam_length: rename("seam_slope_min_length"),
  scarf_seam_max_segment_length: drop(NO_COUNTERPART),
  scarf_seam_on_inner_perimeters: rename("seam_slope_inner_walls"),
  external_perimeters_first: transform("wall_sequence", "wallSequence"),
  gap_fill_enabled: transform("gap_fill_target", "gapFillTarget"),
  perimeter_generator: rename("wall_generator"),
  wall_transition_length: transform("wall_transition_length", "percentOnly"),
  wall_transition_filter_deviation: transform("wall_transition_filter_deviation", "percentOnly"),
  wall_transition_angle: same,
  wall_distribution_count: same,
  min_feature_size: transform("min_feature_size", "percentOnly"),
  min_bead_width: transform("min_bead_width", "percentOnly"),
  only_one_perimeter_first_layer: rename("only_one_wall_first_layer"),
  top_one_perimeter_type: transform("only_one_wall_top", "onlyOneWallTop"),
  ensure_vertical_shell_thickness: choices("ensure_vertical_shell_thickness", { disabled: "none", partial: "ensure_moderate", enabled: "ensure_all" }),
  interface_shells: same,
  fuzzy_skin: same,
  fuzzy_skin_thickness: same,
  fuzzy_skin_point_dist: rename("fuzzy_skin_point_distance"),
  xy_size_compensation: rename("xy_contour_compensation"),
  elefant_foot_compensation: same,
  mmu_segmented_region_max_width: same,
  mmu_segmented_region_interlocking_depth: same,
  interlocking_beam: same,
  interlocking_beam_width: same,
  interlocking_orientation: same,
  interlocking_beam_layer_count: same,
  interlocking_depth: same,
  interlocking_boundary_avoidance: same,

  // ---- Print: infill ----
  fill_density: rename("sparse_infill_density"),
  fill_pattern: choices("sparse_infill_pattern", INFILL_PATTERNS),
  fill_angle: rename("infill_direction"),
  top_fill_pattern: choices("top_surface_pattern", SURFACE_PATTERNS),
  bottom_fill_pattern: choices("bottom_surface_pattern", SURFACE_PATTERNS),
  infill_every_layers: transform("infill_combination", "infillCombination"),
  // Either PrusaSlicer switch (2.9's automatic one, or combining every N layers) turns Snapmaker Orca's combination on.
  automatic_infill_combination: transform("infill_combination", "infillCombination"),
  automatic_infill_combination_max_layer_height: rename("infill_combination_max_layer_height"),
  solid_infill_every_layers: transform("extra_solid_infills", "solidEveryLayers"),
  infill_only_where_needed: drop(NO_COUNTERPART),
  infill_first: rename("is_infill_first"),
  infill_overlap: transform("infill_wall_overlap", "percentOnly"),
  infill_anchor: same,
  infill_anchor_max: same,
  solid_infill_below_area: rename("minimum_sparse_infill_area"),
  bridge_angle: same,
  bridge_flow_ratio: rename("bridge_flow"),
  dont_support_bridges: rename("bridge_no_support"),
  ironing: handled,
  ironing_type: transform("ironing_type", "ironingType"),
  ironing_flowrate: rename("ironing_flow"),
  ironing_spacing: same,
  ironing_speed: same,

  // ---- Print: speeds and accelerations ----
  perimeter_speed: rename("inner_wall_speed"),
  external_perimeter_speed: transform("outer_wall_speed", "percentOfPerimeterSpeed"),
  small_perimeter_speed: same,
  infill_speed: rename("sparse_infill_speed"),
  solid_infill_speed: transform("internal_solid_infill_speed", "percentOfInfillSpeed"),
  top_solid_infill_speed: transform("top_surface_speed", "percentOfSolidInfillSpeed"),
  support_material_speed: rename("support_speed"),
  support_material_interface_speed: transform("support_interface_speed", "percentOfSupportSpeed"),
  bridge_speed: same,
  over_bridge_speed: drop(NO_COUNTERPART),
  gap_fill_speed: rename("gap_infill_speed"),
  travel_speed: same,
  travel_speed_z: same,
  first_layer_speed: transform("initial_layer_speed", "percentOfPerimeterSpeed"),
  first_layer_infill_speed: transform("initial_layer_infill_speed", "percentOfFirstLayerSpeed"),
  first_layer_speed_over_raft: drop(NO_COUNTERPART),
  enable_dynamic_overhang_speeds: rename("enable_overhang_speed"),
  // PrusaSlicer names its four overhang speeds by the overlap with the layer below (0% overlap is a bridge);
  // Snapmaker Orca names its four by the overhang (4/4 is the most overhang). Same four bands, opposite order.
  overhang_speed_0: rename("overhang_4_4_speed"),
  overhang_speed_1: rename("overhang_3_4_speed"),
  overhang_speed_2: rename("overhang_2_4_speed"),
  overhang_speed_3: rename("overhang_1_4_speed"),
  perimeter_acceleration: rename("inner_wall_acceleration"),
  external_perimeter_acceleration: rename("outer_wall_acceleration"),
  infill_acceleration: rename("sparse_infill_acceleration"),
  solid_infill_acceleration: rename("internal_solid_infill_acceleration"),
  top_solid_infill_acceleration: rename("top_surface_acceleration"),
  bridge_acceleration: same,
  first_layer_acceleration: rename("initial_layer_acceleration"),
  first_layer_acceleration_over_raft: drop(NO_COUNTERPART),
  travel_acceleration: same,
  travel_short_distance_acceleration: drop(NO_COUNTERPART),
  wipe_tower_acceleration: drop(NO_COUNTERPART),
  default_acceleration: same,
  max_print_speed: drop(NO_COUNTERPART),
  max_volumetric_speed: drop("PrusaSlicer's print-level cap; the filament's own max volumetric speed is carried"),
  max_volumetric_extrusion_rate_slope_positive: rename("max_volumetric_extrusion_rate_slope"),
  max_volumetric_extrusion_rate_slope_negative: drop("Snapmaker Orca has one extrusion rate slope, taken from the positive one"),

  // ---- Print: skirt, brim, raft ----
  skirts: rename("skirt_loops"),
  skirt_distance: same,
  skirt_height: same,
  draft_shield: choices("draft_shield", { disabled: "disabled", limited: "enabled", enabled: "enabled" }),
  min_skirt_length: same,
  brim_width: same,
  brim_separation: rename("brim_object_gap"),
  brim_type: same,
  raft_layers: same,
  raft_contact_distance: same,
  raft_expansion: same,
  raft_first_layer_density: same,
  raft_first_layer_expansion: same,

  // ---- Print: supports ----
  support_material: rename("enable_support"),
  support_material_auto: transform("support_type", "supportType"),
  support_material_style: choices("support_style", { grid: "grid", snug: "snug", organic: "organic" }),
  support_material_threshold: transform("support_threshold_angle", "supportThreshold"),
  support_material_enforce_layers: rename("enforce_support_layers"),
  support_material_buildplate_only: rename("support_on_build_plate_only"),
  support_material_contact_distance: rename("support_top_z_distance"),
  support_material_bottom_contact_distance: transform("support_bottom_z_distance", "supportBottomZ"),
  support_material_pattern: choices("support_base_pattern", { rectilinear: "rectilinear", "rectilinear-grid": "rectilinear-grid", honeycomb: "honeycomb" }),
  support_material_with_sheath: drop(NO_COUNTERPART),
  support_material_spacing: rename("support_base_pattern_spacing"),
  support_material_angle: rename("support_angle"),
  support_material_closing_radius: drop(NO_COUNTERPART),
  support_material_interface_layers: rename("support_interface_top_layers"),
  support_material_bottom_interface_layers: rename("support_interface_bottom_layers"),
  support_material_interface_contact_loops: rename("support_interface_loop_pattern"),
  support_material_interface_pattern: choices("support_interface_pattern", { auto: "auto", rectilinear: "rectilinear", concentric: "concentric" }),
  support_material_interface_spacing: rename("support_interface_spacing"),
  support_material_xy_spacing: transform("support_object_xy_distance", "supportXySpacing"),
  support_material_synchronize_layers: transform("independent_support_layer_height", "invertBool"),
  support_tree_angle: rename("tree_support_branch_angle"),
  support_tree_angle_slow: rename("tree_support_angle_slow"),
  support_tree_branch_diameter: rename("tree_support_branch_diameter"),
  support_tree_branch_diameter_angle: rename("tree_support_branch_diameter_angle"),
  support_tree_branch_diameter_double_wall: drop(NO_COUNTERPART),
  support_tree_tip_diameter: rename("tree_support_tip_diameter"),
  support_tree_branch_distance: rename("tree_support_branch_distance"),
  support_tree_top_rate: rename("tree_support_top_rate"),

  // ---- Print: extrusion widths and multiple extruders ----
  extrusion_width: rename("line_width"),
  first_layer_extrusion_width: rename("initial_layer_line_width"),
  perimeter_extrusion_width: rename("inner_wall_line_width"),
  external_perimeter_extrusion_width: rename("outer_wall_line_width"),
  infill_extrusion_width: rename("sparse_infill_line_width"),
  solid_infill_extrusion_width: rename("internal_solid_infill_line_width"),
  top_infill_extrusion_width: rename("top_surface_line_width"),
  support_material_extrusion_width: rename("support_line_width"),
  automatic_extrusion_widths: drop(NO_COUNTERPART),
  perimeter_extruder: rename("wall_filament"),
  infill_extruder: rename("sparse_infill_filament"),
  solid_infill_extruder: rename("solid_infill_filament"),
  support_material_extruder: rename("support_filament"),
  support_material_interface_extruder: rename("support_interface_filament"),
  wipe_tower_extruder: rename("wipe_tower_filament"),
  ooze_prevention: same,
  standby_temperature_delta: same,
  wipe_tower: rename("enable_prime_tower"),
  wipe_tower_x: same,
  wipe_tower_y: same,
  wipe_tower_width: rename("prime_tower_width"),
  wipe_tower_rotation_angle: same,
  wipe_tower_brim_width: rename("prime_tower_brim_width"),
  wipe_tower_bridging: same,
  wipe_tower_cone_angle: same,
  wipe_tower_extra_spacing: same,
  wipe_tower_extra_flow: same,
  wipe_tower_no_sparse_layers: same,
  single_extruder_multi_material_priming: same,
  wipe_into_infill: rename("flush_into_infill"),
  wipe_into_objects: rename("flush_into_objects"),
  wiping_volumes_matrix: rename("flush_volumes_matrix"),
  wiping_volumes_use_custom_matrix: drop(NO_COUNTERPART),
  multimaterial_purging: drop(NO_COUNTERPART),

  // ---- Print: output and other ----
  complete_objects: transform("print_sequence", "printSequence"),
  extruder_clearance_height: rename("extruder_clearance_height_to_rod"),
  extruder_clearance_radius: same,
  gcode_comments: same,
  gcode_label_objects: machine,
  output_filename_format: machine,
  post_process: drop("PrusaSlicer's post-processing scripts"),
  notes: same,
  gcode_substitutions: drop("PrusaSlicer's G-code substitutions"),
  arc_fitting: transform("enable_arc_fitting", "arcFitting"),
  prefer_clockwise_movements: transform("wall_direction", "wallDirection"),
  print_settings_id: same,
  inherits_cummulative: machine,
  compatible_printers_condition_cummulative: machine,
  compatible_printers: machine,
  compatible_printers_condition: machine,
  compatible_prints: machine,
  compatible_prints_condition: machine,
  custom_parameters_print: drop("PrusaSlicer's custom G-code parameters"),
  custom_parameters_filament: drop("PrusaSlicer's custom G-code parameters"),
  custom_parameters_printer: drop("PrusaSlicer's custom G-code parameters"),
  colorprint_heights: handled,
  variable_layer_height: handled,
  threads: machine,

  // ---- Filament ----
  filament_colour: transform("filament_colour", "filamentColour"),
  filament_settings_id: same,
  filament_type: transform("filament_type", "filamentType"),
  filament_vendor: same,
  filament_notes: same,
  filament_diameter: same,
  extrusion_multiplier: rename("filament_flow_ratio"),
  filament_density: same,
  filament_cost: same,
  filament_spool_weight: drop(NO_COUNTERPART),
  filament_soluble: same,
  filament_abrasive: drop(NO_COUNTERPART),
  filament_max_volumetric_speed: same,
  filament_infill_max_speed: drop(NO_COUNTERPART),
  filament_infill_max_crossing_speed: drop(NO_COUNTERPART),
  filament_shrinkage_compensation_xy: transform("filament_shrink", "percentComplement"),
  filament_shrinkage_compensation_z: transform("filament_shrinkage_compensation_z", "percentComplement"),
  filament_purge_multiplier: drop(NO_COUNTERPART),
  temperature: rename("nozzle_temperature"),
  first_layer_temperature: rename("nozzle_temperature_initial_layer"),
  bed_temperature: rename(["textured_plate_temp", "hot_plate_temp"]),
  first_layer_bed_temperature: rename(["textured_plate_temp_initial_layer", "hot_plate_temp_initial_layer"]),
  bed_temperature_extruder: drop(NO_COUNTERPART),
  chamber_temperature: same,
  chamber_minimal_temperature: drop(NO_COUNTERPART),
  idle_temperature: same,
  cooling: rename("slow_down_for_layer_cooling"),
  fan_always_on: rename("reduce_fan_stop_start_freq"),
  min_fan_speed: rename("fan_min_speed"),
  max_fan_speed: rename("fan_max_speed"),
  bridge_fan_speed: rename("overhang_fan_speed"),
  enable_dynamic_fan_speeds: drop(NO_COUNTERPART),
  overhang_fan_speed_0: drop(NO_COUNTERPART),
  overhang_fan_speed_1: drop(NO_COUNTERPART),
  overhang_fan_speed_2: drop(NO_COUNTERPART),
  overhang_fan_speed_3: drop(NO_COUNTERPART),
  disable_fan_first_layers: rename("close_fan_the_first_x_layers"),
  full_fan_speed_layer: same,
  fan_below_layer_time: rename("fan_cooling_layer_time"),
  slowdown_below_layer_time: rename("slow_down_layer_time"),
  min_print_speed: rename("slow_down_min_speed"),
  cooling_slowdown_logic: drop(NO_COUNTERPART),
  cooling_perimeter_transition_distance: drop(NO_COUNTERPART),
  filament_retract_length: rename("filament_retraction_length"),
  filament_retract_lift: rename("filament_z_hop"),
  filament_retract_lift_above: same,
  filament_retract_lift_below: same,
  filament_retract_speed: rename("filament_retraction_speed"),
  filament_deretract_speed: rename("filament_deretraction_speed"),
  filament_retract_restart_extra: same,
  filament_retract_before_travel: rename("filament_retraction_minimum_travel"),
  filament_retract_layer_change: rename("filament_retract_when_changing_layer"),
  filament_wipe: same,
  filament_retract_before_wipe: same,
  filament_retract_length_toolchange: same,
  filament_retract_restart_extra_toolchange: same,
  filament_seam_gap_distance: drop(NO_COUNTERPART),
  filament_travel_ramping_lift: transform("filament_z_hop_types", "filamentZHopTypes"),
  filament_travel_slope: drop(NO_COUNTERPART),
  filament_travel_max_lift: drop(NO_COUNTERPART),
  filament_travel_lift_before_obstacle: drop(NO_COUNTERPART),
  filament_loading_speed: same,
  filament_loading_speed_start: same,
  filament_unloading_speed: same,
  filament_unloading_speed_start: same,
  filament_load_time: same,
  filament_unload_time: same,
  filament_toolchange_delay: same,
  filament_cooling_moves: same,
  filament_cooling_initial_speed: same,
  filament_cooling_final_speed: same,
  filament_stamping_distance: same,
  filament_stamping_loading_speed: same,
  filament_minimal_purge_on_wipe_tower: same,
  filament_multitool_ramming: same,
  filament_multitool_ramming_volume: same,
  filament_multitool_ramming_flow: same,
  filament_ramming_parameters: same,
  filament_flush_speed: drop(NO_COUNTERPART),
  filament_flush_volume: drop(NO_COUNTERPART),
  start_filament_gcode: drop(PRUSA_GCODE),
  end_filament_gcode: drop(PRUSA_GCODE),

  // ---- Printer ----
  printer_model: same,
  printer_settings_id: same,
  printer_variant: same,
  printer_vendor: machine,
  printer_notes: same,
  printer_technology: same,
  physical_printer_settings_id: machine,
  bed_shape: machine,
  bed_custom_model: machine,
  bed_custom_texture: machine,
  max_print_height: machine,
  max_layer_height: machine,
  min_layer_height: machine,
  duplicate_distance: machine,
  z_offset: machine,
  nozzle_diameter: same,
  nozzle_high_flow: machine,
  extruder_offset: machine,
  extruder_colour: handled,
  gcode_flavor: machine,
  binary_gcode: machine,
  autoemit_temperature_commands: machine,
  use_relative_e_distances: machine,
  use_firmware_retraction: machine,
  use_volumetric_e: machine,
  extrusion_axis: machine,
  remaining_times: machine,
  silent_mode: machine,
  machine_limits_usage: machine,
  machine_max_acceleration_e: machine,
  machine_max_acceleration_extruding: machine,
  machine_max_acceleration_retracting: machine,
  machine_max_acceleration_travel: machine,
  machine_max_acceleration_x: machine,
  machine_max_acceleration_y: machine,
  machine_max_acceleration_z: machine,
  machine_max_feedrate_e: machine,
  machine_max_feedrate_x: machine,
  machine_max_feedrate_y: machine,
  machine_max_feedrate_z: machine,
  machine_max_jerk_e: machine,
  machine_max_jerk_x: machine,
  machine_max_jerk_y: machine,
  machine_max_jerk_z: machine,
  machine_max_junction_deviation: machine,
  machine_min_extruding_rate: machine,
  machine_min_travel_rate: machine,
  retract_length: rename("retraction_length"),
  retract_lift: rename("z_hop"),
  retract_lift_above: same,
  retract_lift_below: same,
  retract_speed: rename("retraction_speed"),
  deretract_speed: rename("deretraction_speed"),
  retract_restart_extra: same,
  retract_before_travel: rename("retraction_minimum_travel"),
  retract_layer_change: rename("retract_when_changing_layer"),
  wipe: same,
  retract_before_wipe: same,
  retract_length_toolchange: same,
  retract_restart_extra_toolchange: same,
  travel_ramping_lift: transform("z_hop_types", "zHopTypes"),
  travel_slope: same,
  travel_max_lift: drop(NO_COUNTERPART),
  travel_lift_before_obstacle: drop(NO_COUNTERPART),
  single_extruder_multi_material: machine,
  cooling_tube_retraction: same,
  cooling_tube_length: same,
  parking_pos_retraction: same,
  extra_loading_move: same,
  high_current_on_filament_swap: same,
  toolchange_ordering: drop(NO_COUNTERPART),
  start_gcode: machine,
  end_gcode: machine,
  before_layer_gcode: machine,
  layer_gcode: machine,
  toolchange_gcode: machine,
  between_objects_gcode: machine,
  color_change_gcode: machine,
  pause_print_gcode: machine,
  template_custom_gcode: machine,
  host_type: machine,
  thumbnails: machine,
  thumbnails_format: machine,
  default_print_profile: machine,
  default_filament_profile: machine,

  // ---- Written only by older PrusaSlicer versions ----
  build_prepare_time: machine,
  enable_pressure_advance: same,
  pressure_advance: same,
  filament_type_sub: drop(NO_COUNTERPART),
  is_mmu: machine,
  post_process_enable: drop("PrusaSlicer's post-processing scripts"),
  wiping_volumes_extruders: drop("PrusaSlicer's older purge volumes; the matrix is carried"),
  clip_multipart_objects: drop(NO_COUNTERPART),
  gcode_binary: machine,
  serial_port: machine,
  serial_speed: machine,
});
