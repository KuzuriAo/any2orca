// SPDX-License-Identifier: MIT
import type { ConvertRequest, ConvertResponse } from "../schema.js";
import { applyFilamentComplianceMode, type RenamedFilament } from "./applyFilamentComplianceMode.js";
import type { FilamentNameTable } from "./filamentComplianceNames.js";
import { EXTRA_PROJECT_LEVEL_FILAMENT_KEYS } from "./constants.js";
import { buildFilamentConfigs } from "./buildFilamentConfigs.js";
import { clampColorPenetration } from "./clampColorPenetration.js";
import { clampToMachineLimits } from "./clampToMachineLimits.js";
import { applyFilamentFlowVariants, MAX_VOLUMETRIC_SPEED } from "./applyFilamentFlowVariants.js";
import { applyHighFlowHotends, resolveHighFlowSelection, type HighFlowTuning } from "./applyHighFlowHotends.js";
import { applyPresetChanges } from "./applyPresetChanges.js";
import { ABOVE_STOCK_DEFAULTS, firstNumber, largestNumber, type ResolvedAboveStockChoice } from "./aboveStock.js";
import { buildProjectSettings } from "./buildProjectSettings.js";
import { carrySourceLayerHeight } from "./carrySourceLayerHeight.js";
import { computeShifts } from "./computeShifts.js";
import { detectNozzleDiameter } from "./detectNozzleDiameter.js";
import { extractFilamentSlots } from "./extractFilamentSlots.js";
import { fillFilamentSlots } from "./fillFilamentSlots.js";
import { remapBrimType } from "./remapBrimType.js";
import { resizeFlushVolumes } from "./resizeFlushVolumes.js";
import type { JsonRecord } from "./types.js";
import { ChangeTracker, valueText, type ChangeItem, type ChangeReason, type Classify } from "../explain/whatChanged.js";
import { U1_VALUE_KEYS } from "./policy.js";

/**
 * Everything the pipeline needs to know about a printer + profile,
 * independent of where it came from (the profile catalog, or a fixture
 * built from the profile templates in tests).
 */
export interface ConvertProfile {
  printer: {
    id: string;
    printableArea: string[];
    extruderClearanceRadius: number;
    machineSettingsConfig: JsonRecord;
    /** This nozzle supports the Liber High Flow Hotend (the profile templates' high_flow.json). Absent = false. */
    highFlowSupported?: boolean;
    /** The catalog's filament names for the Snapmaker/Generic naming options (index.json `filamentNames`). Absent: those options leave names as they are and say so. */
    filamentNames?: FilamentNameTable;
  };
  profile: {
    id: string;
    baselineProjectSettings: JsonRecord;
    filamentShapeConfig: JsonRecord;
    blocklist: ReadonlySet<string>;
    minComparisonKeys: ReadonlySet<string>;
    alwaysTransferKeys: ReadonlySet<string>;
    filamentKeyBlocklist: ReadonlySet<string>;
    /** This tier's own high-flow values (the profile templates' high_flow.json), empty/absent for a tier without high-flow tuning. */
    highFlowOverrides?: Record<string, string>;
  };
}

export interface RunConvertPipelineOptions {
  /**
   * Keep the source file's own layer height instead of the tier's. The
   * caller sets this only when it auto-matched a tier that isn't an exact
   * layer-height match -- see carrySourceLayerHeight. Off by default.
   */
  carrySourceLayerHeight?: boolean;
  /**
   * A preset's checked values (see resolvePreset), written over the merged
   * settings before the safety steps run, so the user's values win over the
   * creator's and are still capped at the machine limits.
   */
  presetChanges?: Readonly<Record<string, string | string[]>>;
  /**
   * The user's choice for values above Snapmaker's stock,
   * already checked by resolveAboveStockChoice. Absent: the defaults.
   */
  aboveStock?: ResolvedAboveStockChoice;
}

export interface RunConvertPipelineResult {
  response: ConvertResponse;
  warnings: string[];
  /** What the conversion changed, grouped by why (see explain/whatChanged.ts). */
  changes: ReadonlyMap<ChangeReason, ChangeItem[]>;
}

const U1_VALUE_KEY_SET: ReadonlySet<string> = new Set(U1_VALUE_KEYS);

function numbers(value: unknown): number[] {
  return (Array.isArray(value) ? value : [value]).map((v) => Number(v)).filter(Number.isFinite);
}

/** A step that only ever changes settings for one reason. */
const because = (reason: ChangeReason, note?: string): Classify => () => ({ reason, ...(note ? { note } : {}) });

/**
 * The full conversion merge + centering pipeline, given an already
 * resolved profile. Pure function: no network or file access. `Project.convert()`
 * loads a ConvertProfile from the catalog and calls this; tests build one
 * straight from the profile templates.
 *
 * Orchestrates the engine functions: extract filament slots -> build
 * filament configs -> build the merged project settings -> cap speeds at
 * the U1's machine limits -> compute the centering shifts.
 *
 * The print and printer are Snapmaker's stock presets, which Snapmaker Orca
 * already has, so like Snapmaker Orca's own stock projects the output
 * carries no embedded print or machine preset; the source's embedded
 * presets are dropped (shouldDropFromBambu). Filament presets are embedded,
 * as Snapmaker Orca does for filaments that aren't its own presets.
 *
 * @param application the target slicer's Application value at the pinned
 *   release (the catalog index's `slicer.application`), passed straight
 *   through to the response's `application` field.
 */
export function runConvertPipeline(
  profile: ConvertProfile,
  request: ConvertRequest,
  application: string,
  options: RunConvertPipelineOptions = {},
): RunConvertPipelineResult {
  const warnings: string[] = [];
  const { printer, profile: p } = profile;

  const filamentTemplateKeys = new Set(Object.keys(p.filamentShapeConfig));
  let { filamentKeyArrays, slots } = extractFilamentSlots(
    request.projectSettings,
    filamentTemplateKeys,
    EXTRA_PROJECT_LEVEL_FILAMENT_KEYS,
    p.filamentKeyBlocklist,
    warnings,
  );

  // flush_volumes_matrix/vector aren't a per-filament template key (a full
  // n x n matrix, not one value per slot), so extractFilamentSlots' generic
  // reshape can't cover them -- resized separately here and merged into the
  // same overlay, which buildProjectSettings already fully-replaces
  // whatever keys are present in, exactly like filament_colour/filament_ids.
  // Skipped entirely (not just a no-op merge) when filamentKeyArrays is
  // null -- filament extraction already failed and warned; a "resized to 0
  // filaments" warning on top of that would just be confusing noise.
  if (filamentKeyArrays) {
    const resizedFlushVolumes = resizeFlushVolumes(request.projectSettings, slots.length, warnings);
    if (resizedFlushVolumes) {
      filamentKeyArrays = { ...filamentKeyArrays, ...resizedFlushVolumes };
    }
  }

  let filamentComplianceFallback: string[] | undefined;
  let filamentComplianceUnchanged: string[] | undefined;
  let renamedFilaments: RenamedFilament[] = [];
  if (request.filamentComplianceMode) {
    // Preset names exist per nozzle size, so they follow the target printer, not the source's nozzle.
    const applied = applyFilamentComplianceMode(slots, filamentKeyArrays, request.filamentComplianceMode, printer.filamentNames, printer.id);
    slots = applied.slots;
    filamentKeyArrays = applied.filamentKeyArrays;
    renamedFilaments = applied.renamed;
    if (applied.fellBackToGenericMaterials.length > 0) filamentComplianceFallback = applied.fellBackToGenericMaterials;
    if (applied.unchangedMaterials.length > 0) filamentComplianceUnchanged = applied.unchangedMaterials;
    if (!printer.filamentNames) {
      warnings.push("  WARN: this profile catalog has no filament names, so filament names were left as they are. Update any2orca-profiles.");
    }
  }

  const { files: filamentFiles } = buildFilamentConfigs(slots, p.filamentShapeConfig, p.filamentKeyBlocklist);

  // High-flow hotends (request.highFlowHotends): which toolheads have the
  // Liber hotend, only where the nozzle supports it. The tier's high-flow
  // values are applied after the merge, as the second variant of each
  // speed, so a creator-customized value still wins (applyHighFlowHotends).
  const toolheads = Array.isArray(printer.machineSettingsConfig.nozzle_diameter) && printer.machineSettingsConfig.nozzle_diameter.length > 0
    ? printer.machineSettingsConfig.nozzle_diameter.length
    : 4;
  const highFlowSelection = resolveHighFlowSelection(request.highFlowHotends, toolheads);
  const highFlowApplies = highFlowSelection !== null && printer.highFlowSupported === true;
  if (highFlowSelection !== null && !highFlowApplies) {
    warnings.push(
      "  WARN: high-flow hotends were requested, but Snapmaker has no high-flow option for this nozzle size (only 0.4mm), so the project is set up for standard hotends.",
    );
  }
  const highFlowValues = highFlowApplies ? (p.highFlowOverrides ?? {}) : {};
  const highFlowTuning: HighFlowTuning | null =
    Object.keys(highFlowValues).length > 0
      ? {
          highFlow: highFlowValues,
          // The stock standard value: the first entry where the profile stores one per variant.
          standard: Object.fromEntries(
            Object.keys(highFlowValues).map((key) => {
              const stock = p.baselineProjectSettings[key];
              return [key, String((Array.isArray(stock) ? stock[0] : stock) ?? "")];
            }),
          ),
        }
      : null;

  const tracker = new ChangeTracker();
  const keep = options.aboveStock?.keep ?? new Set<string>();
  const useStock = options.aboveStock?.stock ?? new Set<string>();
  // Keeping the creator's acceleration or travel speed above stock: take it as it is, instead of only when lower.
  const keptHigher = [...keep].filter((key) => p.minComparisonKeys.has(key));
  const { newSettings: mergedSettings, notCarried } = buildProjectSettings(
    p.baselineProjectSettings,
    request.projectSettings,
    filamentKeyArrays,
    p.blocklist,
    keptHigher.length > 0 ? new Set([...p.minComparisonKeys].filter((key) => !keep.has(key))) : p.minComparisonKeys,
    keptHigher.length > 0 ? new Set([...p.alwaysTransferKeys, ...keptHigher]) : p.alwaysTransferKeys,
    warnings,
  );
  // Filament settings are the creator's, carried as a whole; they're summarized in one line below.
  tracker.compare(p.baselineProjectSettings, mergedSettings, (key) => {
    if (filamentKeyArrays && Object.hasOwn(filamentKeyArrays, key)) return null;
    if (key === "print_sequence") return { reason: "layout", note: "kept to match how the model is laid out" };
    if (keep.has(key) && p.minComparisonKeys.has(key)) return { reason: "yours", note: "you chose to keep the creator's value" };
    if (p.minComparisonKeys.has(key)) return { reason: "creator", note: "lower than Snapmaker's stock value" };
    return { reason: "creator" };
  });
  if (filamentKeyArrays && slots.length > 0) {
    tracker.add("creator", {
      label: `${slots.length} filament${slots.length === 1 ? "" : "s"}: colors, materials and filament settings kept as the creator set them, except G-code, which is the U1's own`,
      before: null,
      after: null,
    });
  }
  if (request.filamentComplianceMode) {
    const notes = [
      ...(filamentComplianceFallback ? [`Generic for ${filamentComplianceFallback.join(", ")}`] : []),
      ...(filamentComplianceUnchanged ? [`kept the creator's name for ${filamentComplianceUnchanged.join(", ")} (no Snapmaker or Generic preset for this nozzle size)`] : []),
    ];
    tracker.add("yours", {
      label: `Filament names relabeled to ${request.filamentComplianceMode === "generic" ? "Generic" : "Snapmaker"} presets (names only, never temperatures or flow)`,
      before: null,
      after: null,
      ...(notes.length > 0 ? { note: notes.join("; ") } : {}),
    });
    for (const r of renamedFilaments) tracker.add("yours", { label: `Filament ${r.slot + 1} name`, before: r.before || null, after: r.after });
  }
  if (useStock.size > 0) {
    tracker.step(mergedSettings, because("yours", "you chose Snapmaker's stock value"), () => {
      for (const key of useStock) if (Object.hasOwn(p.baselineProjectSettings, key)) mergedSettings[key] = p.baselineProjectSettings[key];
    });
  }
  const presetChanges = options.presetChanges;
  if (presetChanges) tracker.step(mergedSettings, because("yours", "from your preset"), () => applyPresetChanges(mergedSettings, presetChanges, warnings));
  const newSettings = remapBrimType(mergedSettings, warnings);
  tracker.compare(mergedSettings, newSettings, because("firmware", "Bambu Studio's name for a painted brim means something else in Snapmaker Orca"));
  // When the source carries no filament settings at all, the filament count comes from its colors.
  const slotCount = slots.length > 0 ? slots.length : Array.isArray(newSettings.filament_colour) ? newSettings.filament_colour.length : 0;
  const filamentFromSource = new Set(Object.keys(filamentKeyArrays ?? {}));
  fillFilamentSlots(newSettings, filamentTemplateKeys, filamentFromSource, slotCount);
  // Laying the filament settings out per hotend type isn't a change in meaning; lowering a max volumetric speed is.
  tracker.step(
    newSettings,
    (key, before, after) => {
      if (key !== "filament_max_volumetric_speed") return null;
      const was = numbers(before);
      const step = Number(Array.isArray(newSettings.filament_flow_step_size) ? newSettings.filament_flow_step_size[0] : 1);
      const standard = numbers(after).filter((_, i) => step !== 2 || i % 2 === 0);
      return standard.length === was.length && standard.some((v, i) => v < was[i])
        ? { reason: "capped", note: `at most ${MAX_VOLUMETRIC_SPEED.standard} mm³/s, ${MAX_VOLUMETRIC_SPEED.highFlow} with a high-flow hotend` }
        : null;
    },
    () =>
      applyFilamentFlowVariants(newSettings, request.projectSettings, p.baselineProjectSettings, printer.highFlowSupported === true, filamentFromSource, slotCount, warnings, {
        capVolumetricSpeed: !keep.has("filament_max_volumetric_speed"),
      }),
  );
  if (keep.has("filament_max_volumetric_speed")) {
    tracker.add("yours", {
      key: "filament_max_volumetric_speed",
      label: "Filament max volumetric speed kept as the creator set it",
      before: null,
      after: valueText(newSettings.filament_max_volumetric_speed),
      note: `you chose not to cap it at ${MAX_VOLUMETRIC_SPEED.standard} mm³/s (${MAX_VOLUMETRIC_SPEED.highFlow} high flow)`,
      alternative: "stock",
    });
  }
  tracker.step(newSettings, because("firmware", "no deeper than the shell, as Snapmaker Orca would reset it"), () => clampColorPenetration(newSettings, warnings));
  if (options.carrySourceLayerHeight) {
    tracker.step(newSettings, because("creator", "no U1 profile has this layer height, so the creator's is kept"), () =>
      carrySourceLayerHeight(newSettings, request.projectSettings, printer.machineSettingsConfig, warnings),
    );
  }
  if (highFlowApplies && highFlowSelection) {
    tracker.step(newSettings, because("yours", "for the toolheads with the Liber High Flow Hotend"), () =>
      applyHighFlowHotends(newSettings, highFlowSelection, highFlowTuning, warnings),
    );
  }
  tracker.step(newSettings, because("capped", "the U1's machine limit"), () =>
    clampToMachineLimits(newSettings, p.baselineProjectSettings, printer.machineSettingsConfig, warnings),
  );
  // Hardened steel nozzles instead of the stock stainless ones (only the 0.4
  // profile says stainless; the other sizes are hardened already).
  if (request.hardenedNozzles) {
    tracker.step(newSettings, because("yours", "hardened steel nozzles"), () => {
      newSettings.nozzle_type = "hardened_steel";
    });
  }

  const bambuClearanceRadiusRaw = request.projectSettings.extruder_clearance_max_radius;
  const bambuClearanceRadius =
    typeof bambuClearanceRadiusRaw === "string" || typeof bambuClearanceRadiusRaw === "number"
      ? Number(bambuClearanceRadiusRaw)
      : null;
  const { shifts, warnings: shiftWarnings } = computeShifts(
    request.objects,
    printer.printableArea,
    Number.isFinite(bambuClearanceRadius) ? bambuClearanceRadius : null,
    printer.extruderClearanceRadius,
  );
  warnings.push(...shiftWarnings);
  addShiftItems(tracker, request.objects, shifts);

  const configFiles: ConvertResponse["configFiles"] = { ...filamentFiles };

  // `warnings` mixes routine per-conversion bookkeeping (e.g. computeShifts'
  // "true geometric center -> target" line, which fires on every plate
  // every time) with genuinely actionable notes -- every actionable one is
  // consistently marked with a "WARN" substring (see computeShifts.ts,
  // extractFilamentSlots.ts, coerceValue.ts), so that's what the response
  // surfaces. The full, unfiltered list stays available in this function's
  // own return value for tests and debugging.
  const userFacingWarnings = warnings.filter((w) => w.includes("WARN"));

  return {
    response: {
      projectSettings: newSettings,
      configFiles,
      shifts,
      application,
      ...(filamentComplianceFallback ? { filamentComplianceFallback } : {}),
      ...(filamentComplianceUnchanged ? { filamentComplianceUnchanged } : {}),
      ...(userFacingWarnings.length > 0 ? { warnings: userFacingWarnings } : {}),
    },
    warnings,
    changes: tracker.build(request.projectSettings, p.baselineProjectSettings, newSettings, (key) => {
      if (U1_VALUE_KEY_SET.has(key)) return "always the U1's own value";
      if (p.blocklist.has(key) || p.filamentKeyBlocklist.has(key)) return "always the U1's own value";
      if (p.minComparisonKeys.has(key)) {
        // In Snapmaker Orca and Bambu Studio, an acceleration of 0 means "the same as normal printing".
        if (firstNumber(request.projectSettings[key]) === 0) return "0 in the creator's file means the same as normal printing; Snapmaker's stock value is used";
        return "higher than Snapmaker's stock value; only lower values are carried over";
      }
      if (notCarried.includes(key)) return "the creator changed it, but its values don't fit the U1's layout; Snapmaker's stock value is used";
      return "the creator's file doesn't mark it as changed";
    }, (key, reason) => {
      const choice = ABOVE_STOCK_DEFAULTS[key];
      if (!choice) return undefined;
      if (reason === "yours") return keep.has(key) ? "stock" : useStock.has(key) ? "keep" : undefined;
      const above = (firstNumber(newSettings[key]) ?? 0) > (firstNumber(p.baselineProjectSettings[key]) ?? Infinity);
      const sourceAbove = (firstNumber(request.projectSettings[key]) ?? 0) > (firstNumber(p.baselineProjectSettings[key]) ?? Infinity);
      if (reason === "creator" && choice === "keep" && above) return "stock";
      if (reason === "stock" && choice === "stock" && sourceAbove) return "keep";
      if (reason === "capped") return choice === "capped" && (largestNumber(request.projectSettings[key]) ?? 0) > 0 ? "keep" : "stock";
      return undefined;
    }),
  };
}

/** One line per plate whose objects moved to the center of the U1's bed (or per object, where they moved differently). */
function addShiftItems(tracker: ChangeTracker, objects: ConvertRequest["objects"], shifts: Record<string, [number, number]>): void {
  const round = (n: number) => Math.round(n * 10) / 10;
  const byPlate = new Map<number, Array<{ name: string; shift: [number, number] }>>();
  for (const object of objects) {
    const shift = shifts[object.id];
    if (!shift || (round(shift[0]) === 0 && round(shift[1]) === 0)) continue;
    const list = byPlate.get(object.plate ?? 1) ?? [];
    list.push({ name: object.name ?? `object ${object.id}`, shift });
    byPlate.set(object.plate ?? 1, list);
  }
  for (const [plate, moved] of [...byPlate].sort((a, b) => a[0] - b[0])) {
    const same = moved.every((m) => round(m.shift[0]) === round(moved[0].shift[0]) && round(m.shift[1]) === round(moved[0].shift[1]));
    const entries = same ? [{ name: moved.length === 1 ? `"${moved[0].name}"` : `${moved.length} objects`, shift: moved[0].shift }] : moved.map((m) => ({ name: `"${m.name}"`, shift: m.shift }));
    for (const entry of entries) {
      tracker.add("layout", {
        label: `Plate ${plate}: ${entry.name} moved to the center of the U1's bed`,
        before: null,
        after: null,
        note: `${round(entry.shift[0])} mm in X, ${round(entry.shift[1])} mm in Y`,
      });
    }
  }
}
