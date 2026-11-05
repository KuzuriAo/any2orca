// SPDX-License-Identifier: MIT
/**
 * Applies the key map to a PrusaSlicer project's settings, giving the settings
 * in Snapmaker Orca's keys and value shapes: a single value is a string, a
 * per-filament or per-extruder value is an array of strings, as the Bambu
 * Studio family writes `project_settings.config`. Everything the pipeline does
 * after this (the U1 profile, the filament slots, the machine limits) is the
 * same as for a Bambu-family project.
 *
 * The policy is "transfer everything mapped": PrusaSlicer records no list of
 * what the creator changed, so every mapped print setting is marked as
 * changed, and the pipeline's own rules decide what the U1 keeps.
 */
import { SETTINGS_CATALOG } from "../../diff/settingsCatalog.js";
import { splitNumberList, splitStringList, type PrusaIni } from "./ini.js";
import { PRUSA_KEY_MAP, type PrusaTransform } from "./keyMap.js";

export type OrcaSettings = Record<string, string | string[]>;

export interface ConvertedSettings {
  settings: OrcaSettings;
  /** For each PrusaSlicer key that was carried, the Snapmaker Orca keys it wrote. */
  targets: Map<string, string[]>;
  /** Settings with no Snapmaker Orca counterpart, with the reason each wasn't carried. */
  dropped: { key: string; why: string }[];
  /** Keys this converter has no rule for (a newer PrusaSlicer); not carried. */
  unknown: string[];
  warnings: string[];
}

/** Keys a project carries that aren't in a preset, so the catalog doesn't list them; whether each is a list. */
const PROJECT_STATE_VECTORS: Readonly<Record<string, boolean>> = {
  print_settings_id: false,
  printer_settings_id: false,
  filament_settings_id: true,
  wipe_tower_x: true,
  wipe_tower_y: true,
  flush_volumes_matrix: true,
  filament_load_time: true,
  filament_unload_time: true,
  filament_z_hop_types: true,
};

/**
 * Whether the key is written as a list: a filament or machine setting Snapmaker Orca keeps per filament or per
 * extruder. A print setting is written as one value, as the Bambu Studio family writes it, even where Snapmaker
 * Orca's U1 profile keeps a pair (one per hotend type): the pipeline spreads one value over the pair.
 */
function isVector(key: string): boolean {
  const info = SETTINGS_CATALOG[key];
  if (info?.type) return info.type.endsWith("s") && info.group !== "print";
  return PROJECT_STATE_VECTORS[key] ?? false;
}

/** How PrusaSlicer joined the value, read from what Snapmaker Orca keeps under `target`. */
type ValueShape = "strings" | "numbers" | "text";
function valueShape(target: string): ValueShape {
  const type = SETTINGS_CATALOG[target]?.type;
  if (type === "coStrings" || target === "filament_settings_id") return "strings";
  // One text, commas and all: a note, a preset name, a choice.
  if (type === "coString" || type === "coEnum" || (type === undefined && PROJECT_STATE_VECTORS[target] === false)) return "text";
  return "numbers";
}

const isPercent = (v: string): boolean => v.trim().endsWith("%");
const num = (v: string): number => Number.parseFloat(v);

/** A number as Snapmaker Orca writes one: up to four decimals, no trailing zeros. */
function fmt(n: number): string {
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : "0";
}

/**
 * Snapmaker Orca's brim type for PrusaSlicer's brim settings. PrusaSlicer's "Brim" checkbox is the brim width: it's
 * checked when the width is above 0, and unchecking it sets the width to 0 (`FrequentlyChangedParameters.cpp`). It
 * prints no brim when the width is 0 or the type is "no brim" (`Brim.cpp`), whatever the type says, so "outer only"
 * with a width of 0 is no brim. Snapmaker Orca draws its brim by type alone, so that state becomes "no_brim"; anything
 * else keeps PrusaSlicer's type, which Snapmaker Orca names the same.
 */
function brimType(settings: ReadonlyMap<string, string>): string | null {
  const width = settings.get("brim_width");
  const type = settings.get("brim_type");
  if (width !== undefined && Number.isFinite(num(width)) && num(width) <= 0) return "no_brim";
  return type ?? null;
}

/** The value as a list, split the way PrusaSlicer joined it for what the target keeps. */
function entries(ini: PrusaIni, key: string, target: string): string[] {
  const raw = ini.raw.get(key);
  const value = ini.settings.get(key);
  if (raw === undefined || value === undefined) return [];
  switch (valueShape(target)) {
    case "strings":
      return splitStringList(raw);
    case "text":
      return [value];
    default:
      return splitNumberList(value);
  }
}

/** The first entry of a value PrusaSlicer may keep per extruder. */
function first(ini: PrusaIni, key: string): string | undefined {
  const value = ini.settings.get(key);
  if (value === undefined) return undefined;
  return splitNumberList(value)[0];
}

/** `value` resolved against `base` when it's a percentage, else as is. */
function percentOf(value: string, base: number | undefined): string | null {
  if (!isPercent(value)) return value;
  if (base === undefined || !Number.isFinite(base)) return null;
  return fmt((num(value) / 100) * base);
}

/** A PrusaSlicer speed resolved to a number, following its percent-of chain. */
function resolvedSpeed(ini: PrusaIni, key: string): number | undefined {
  const value = first(ini, key);
  if (value === undefined) return undefined;
  if (!isPercent(value)) return num(value);
  const base: Record<string, string> = {
    external_perimeter_speed: "perimeter_speed",
    solid_infill_speed: "infill_speed",
    top_solid_infill_speed: "solid_infill_speed",
    support_material_interface_speed: "support_material_speed",
    first_layer_speed: "perimeter_speed",
    first_layer_infill_speed: "first_layer_speed",
  };
  const baseKey = base[key];
  if (!baseKey) return undefined;
  const baseValue = resolvedSpeed(ini, baseKey);
  return baseValue === undefined ? undefined : (num(value) / 100) * baseValue;
}

interface TransformContext {
  ini: PrusaIni;
  key: string;
  value: string;
  warnings: string[];
  dropped: { key: string; why: string }[];
}

/** The transformed value as a list of entries, or null when the setting isn't carried (the transform says why). */
type Transform = (ctx: TransformContext) => string[] | null;

const percentOfSpeed =
  (baseKey: string): Transform =>
  ({ ini, key, value, warnings }) => {
    if (!isPercent(value)) return [value];
    const resolved = resolvedSpeed(ini, key);
    if (resolved === undefined) {
      warnings.push(`  WARN: ${key} is ${value} of ${baseKey}, which isn't a number this project can resolve, so Snapmaker's stock value is used.`);
      return null;
    }
    return [fmt(resolved)];
  };

const TRANSFORMS: Readonly<Record<PrusaTransform, Transform>> = {
  arcFitting: ({ value }) => [value === "disabled" ? "0" : "1"],
  filamentColour: ({ ini, warnings }) => {
    const colors = entries(ini, "filament_colour", "filament_colour");
    const extruderColors = entries(ini, "extruder_colour", "extruder_colour");
    let fromExtruders = 0;
    const out = colors.map((color, i) => {
      const extruder = extruderColors[i] ?? "";
      if (/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(extruder) && extruder.toUpperCase() !== color.toUpperCase()) {
        fromExtruders++;
        return extruder;
      }
      return color;
    });
    if (fromExtruders > 0) warnings.push(`  note: ${fromExtruders} filament color(s) taken from the printer's extruder colors, which are what PrusaSlicer shows for this project.`);
    return out;
  },
  filamentZHopTypes: ({ ini, key }) => entries(ini, key, "filament_z_hop_types").map((entry) => (entry === "nil" ? "nil" : entry === "1" ? "Slope Lift" : "Normal Lift")),
  filamentType: ({ ini }) => entries(ini, "filament_type", "filament_type").map((type) => ({ PET: "PETG", NYLON: "PA" })[type] ?? type),
  firstLayerHeight: ({ ini, value }) => {
    const layer = ini.settings.get("layer_height");
    const resolved = percentOf(value, layer === undefined ? undefined : num(layer));
    return resolved === null ? null : [resolved];
  },
  gapFillTarget: ({ value }) => [value === "0" ? "nowhere" : "everywhere"],
  infillCombination: ({ ini }) => [ini.settings.get("automatic_infill_combination") === "1" || num(ini.settings.get("infill_every_layers") ?? "1") > 1 ? "1" : "0"],
  invertBool: ({ value }) => [value === "1" ? "0" : "1"],
  ironingType: ({ ini, value }) => [ini.settings.get("ironing") === "1" ? value : "no ironing"],
  onlyOneWallTop: ({ value }) => [value === "none" ? "0" : "1"],
  percentComplement: ({ ini, key }) => entries(ini, key, "filament_shrink").map((entry) => `${fmt(100 - num(entry))}%`),
  percentOfFirstLayerSpeed: percentOfSpeed("first_layer_speed"),
  percentOfInfillSpeed: percentOfSpeed("infill_speed"),
  percentOfPerimeterSpeed: percentOfSpeed("perimeter_speed"),
  percentOfSolidInfillSpeed: percentOfSpeed("solid_infill_speed"),
  percentOfSupportSpeed: percentOfSpeed("support_material_speed"),
  percentOnly: ({ key, value, warnings }) => {
    if (isPercent(value)) return [value];
    warnings.push(`  WARN: ${key} is ${value} mm, and Snapmaker Orca keeps it as a percentage of the line width, so Snapmaker's stock value is used.`);
    return null;
  },
  printSequence: ({ value }) => [value === "1" ? "by object" : "by layer"],
  // PrusaSlicer's "a solid layer every N layers" is Orca's "insert solid layers: N"; 0 is off, so nothing to carry.
  solidEveryLayers: ({ value }) => (num(value) > 0 ? [String(Math.trunc(num(value)))] : null),
  supportBottomZ: ({ ini, value }) => [value === "0" ? (ini.settings.get("support_material_contact_distance") ?? value) : value],
  supportThreshold: ({ key, value, dropped }) => {
    if (value !== "0") return [value];
    dropped.push({ key, why: "automatic overhang detection has no Snapmaker Orca counterpart" });
    return null;
  },
  supportType: ({ ini, value }) => {
    const tree = ini.settings.get("support_material_style") === "organic";
    return [`${tree ? "tree" : "normal"}(${value === "1" ? "auto" : "manual"})`];
  },
  supportXySpacing: ({ ini, value, warnings }) => {
    if (!isPercent(value)) return [value];
    const width = ["external_perimeter_extrusion_width", "extrusion_width", "nozzle_diameter"].map((k) => num(first(ini, k) ?? "")).find((n) => n > 0);
    if (width === undefined) {
      warnings.push(`  WARN: support_material_xy_spacing is ${value} of a line width this project doesn't give, so Snapmaker's stock value is used.`);
      return null;
    }
    return [fmt((num(value) / 100) * width)];
  },
  // Only the clockwise choice is a change from Orca's automatic direction.
  wallDirection: ({ value }) => (value === "1" ? ["cw"] : null),
  wallSequence: ({ value }) => [value === "1" ? "outer wall/inner wall" : "inner wall/outer wall"],
  zHopTypes: ({ ini, key }) => entries(ini, key, "z_hop_types").map((entry) => (entry === "1" ? "Slope Lift" : "Normal Lift")),
};

/**
 * The value shaped for `target`: a list for a per-filament or per-extruder key; otherwise one value, or the list
 * when PrusaSlicer kept several that differ (the pipeline picks or warns, as it does for a Bambu-family project).
 */
function shaped(target: string, list: string[]): string | string[] | null {
  if (list.length === 0) return null;
  if (isVector(target)) return list;
  return list.every((entry) => entry === list[0]) ? list[0] : list;
}

/**
 * An object's or a volume's own settings (PrusaSlicer keys, from the model config) in Snapmaker Orca's keys, one
 * value each, for `model_settings.config`. A transform that reads other settings sees the project's, with the
 * object's own over them. Keys with no single-value counterpart (filament settings, dropped keys) aren't carried.
 */
export function convertObjectOverrides(ini: PrusaIni, overrides: ReadonlyMap<string, string>): Record<string, string> {
  const merged: PrusaIni = { ...ini, settings: new Map([...ini.settings, ...overrides]), raw: new Map([...ini.raw, ...overrides]) };
  const out: Record<string, string> = {};
  const warnings: string[] = [];
  const dropped: ConvertedSettings["dropped"] = [];
  for (const [key, value] of overrides) {
    const rule = PRUSA_KEY_MAP[key];
    if (!rule) continue;
    const put = (target: string, list: string[] | null) => {
      if (!list || list.length === 0 || SETTINGS_CATALOG[target]?.group === "filament") return;
      out[target] = list[0];
    };
    switch (rule.kind) {
      case "same":
        put(key, [value]);
        break;
      case "rename":
        for (const target of typeof rule.to === "string" ? [rule.to] : rule.to) put(target, [value]);
        break;
      case "choices":
        if (rule.values[value] !== undefined) put(rule.to, [rule.values[value]]);
        break;
      case "transform": {
        const list = TRANSFORMS[rule.via]({ ini: merged, key, value, warnings, dropped });
        for (const target of typeof rule.to === "string" ? [rule.to] : rule.to) put(target, list);
        break;
      }
      default:
        break;
    }
  }
  // An object that turns supports on itself gets the kind and the choices PrusaSlicer shows for it, which would
  // otherwise come from the project's (Snapmaker's stock when the project has supports off).
  if (overrides.get("support_material") === "1") {
    const auto = merged.settings.get("support_material_auto");
    if (auto !== undefined) out.support_type ??= TRANSFORMS.supportType({ ini: merged, key: "support_material_auto", value: auto, warnings, dropped })![0]!;
    const styleRule = PRUSA_KEY_MAP.support_material_style;
    const style = merged.settings.get("support_material_style");
    if (style !== undefined && styleRule?.kind === "choices" && styleRule.values[style] !== undefined) out.support_style ??= styleRule.values[style];
    const plateOnly = merged.settings.get("support_material_buildplate_only");
    if (plateOnly !== undefined) out.support_on_build_plate_only ??= plateOnly;
  }
  // An object's own brim width or type decides its brim on its own: off where the project's is on, or on where it's off.
  if (overrides.has("brim_width") || overrides.has("brim_type")) {
    const type = brimType(merged.settings);
    if (type !== null) out.brim_type = type;
  }
  return out;
}

export function convertPrusaSettings(ini: PrusaIni): ConvertedSettings {
  const settings: OrcaSettings = {};
  const targets = new Map<string, string[]>();
  const dropped: ConvertedSettings["dropped"] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  let current = "";
  const write = (target: string, list: string[]) => {
    // Every entry `nil` is PrusaSlicer's "not set" (a filament override left to the printer): nothing to carry.
    if (list.every((entry) => entry === "nil")) return;
    // A value under Snapmaker Orca's minimum: PrusaSlicer's 0 for "automatic" on a speed it requires to be 1 or
    // more, say. Snapmaker Orca refuses the whole file for it, so the stock value stands.
    const min = SETTINGS_CATALOG[target]?.min;
    if (min !== null && min !== undefined && list.some((entry) => /^-?\d+(\.\d+)?$/.test(entry) && Number(entry) < min)) {
      dropped.push({ key: target, why: `${list.join(",")} is below Snapmaker Orca's minimum of ${min}` });
      return;
    }
    const value = shaped(target, list);
    if (value !== null) {
      settings[target] = value;
      targets.set(current, [...(targets.get(current) ?? []), target]);
    }
  };

  for (const [key, value] of ini.settings) {
    current = key;
    const rule = PRUSA_KEY_MAP[key];
    if (!rule) {
      unknown.push(key);
      continue;
    }
    switch (rule.kind) {
      case "same":
        write(key, entries(ini, key, key));
        break;
      case "rename":
        for (const target of typeof rule.to === "string" ? [rule.to] : rule.to) write(target, entries(ini, key, target));
        break;
      case "choices": {
        const mapped = rule.values[value];
        if (mapped === undefined) {
          warnings.push(`  WARN: ${key} "${value.slice(0, 40)}" has no Snapmaker Orca counterpart, so Snapmaker's stock value is used.`);
        } else {
          write(rule.to, [mapped]);
        }
        break;
      }
      case "transform": {
        const list = TRANSFORMS[rule.via]({ ini, key, value, warnings, dropped });
        if (list) for (const target of typeof rule.to === "string" ? [rule.to] : rule.to) write(target, list);
        break;
      }
      case "drop":
        dropped.push({ key, why: rule.why });
        break;
      case "machine":
      case "handled":
        break;
    }
  }

  // The brim the project prints, from the width (PrusaSlicer's checkbox) as well as the type; also for a project from
  // a PrusaSlicer old enough to have no brim type. Snapmaker Orca's pipeline always carries the source's brim type.
  const brim = brimType(ini.settings);
  if (brim !== null && settings.brim_type !== brim) {
    settings.brim_type = brim;
    const source = ini.settings.has("brim_type") ? "brim_type" : "brim_width";
    if (!targets.get(source)?.includes("brim_type")) targets.set(source, [...(targets.get(source) ?? []), "brim_type"]);
  }

  if (ini.version) settings.version = ini.version;

  const filamentCount = Array.isArray(settings.filament_colour) ? settings.filament_colour.length : 1;
  // A filament setting PrusaSlicer keeps once for every filament (its vendor, say) is one value per filament in
  // Snapmaker Orca; the pipeline takes a short list as missing values, so it's spread here.
  for (const [key, value] of Object.entries(settings)) {
    if (SETTINGS_CATALOG[key]?.group === "filament" && Array.isArray(value) && value.length === 1 && filamentCount > 1) {
      settings[key] = Array.from({ length: filamentCount }, () => value[0]);
    }
  }
  // A support or wipe tower filament the project doesn't have (a preset for a five-tool printer on a one-filament
  // project, say) would point Snapmaker Orca at a filament that isn't there, so the stock value stands.
  for (const key of ["support_filament", "support_interface_filament", "wipe_tower_filament"]) {
    const value = settings[key];
    if (typeof value === "string" && Number.parseInt(value, 10) > filamentCount) {
      delete settings[key];
      for (const [source, written] of targets) if (written.includes(key)) targets.set(source, written.filter((t) => t !== key));
      dropped.push({ key, why: `filament ${value} isn't one of the project's ${filamentCount}` });
    }
  }
  // Snapmaker Orca sizes its purge structures by these two arrays and refuses a file whose matrix doesn't fit the
  // filament count. PrusaSlicer has the matrix (n x n) but no vector (2n); the pipeline sizes both from the source's,
  // so the vector is given here. The U1 purges by its own minimum, so only the sizes matter.
  if (!Array.isArray(settings.flush_volumes_matrix)) settings.flush_volumes_matrix = Array.from({ length: filamentCount * filamentCount }, () => "0");
  settings.flush_volumes_vector = Array.from({ length: filamentCount * 2 }, () => "140");

  // Policy: every mapped print setting counts as changed by the creator, so the print entry lists them all. The
  // filament entries (one per filament) and the printer entry stay empty: the pipeline overlays filament values whole,
  // and the printer's settings (retraction, purge moves, limits) are the U1's own, as they are for a Bambu-family
  // project, whose list never names them either. Snapmaker Orca itself takes them from its printer preset on load.
  const printKeys = Object.keys(settings)
    .filter((k) => SETTINGS_CATALOG[k]?.group === "print")
    .sort();
  settings.different_settings_to_system = [printKeys.join(";"), ...Array.from({ length: filamentCount }, () => ""), ""];

  return { settings, targets, dropped, unknown, warnings };
}
