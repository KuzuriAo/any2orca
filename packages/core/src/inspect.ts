// SPDX-License-Identifier: MIT
/**
 * What a UI needs to show about a source file before converting it: plates,
 * objects and their footprints, filament slots with real color names, and
 * the settings that drive profile matching. Everything here reads the
 * file's own project_settings.config, which is untrusted, so every field is
 * type-checked rather than cast.
 */
import { lookupFilamentColorName, type FilamentColorMatch } from "./archive/lookupFilamentColorName.js";
import { detectNozzleDiameter, type SupportedNozzleDiameter } from "./engine/detectNozzleDiameter.js";
import { parseTierName } from "./engine/parseTierName.js";
import { plainText } from "./plainText.js";
import type { ConvertObject } from "./schema.js";

/** The printer maker a source file was set up for, from its `printer_model`. */
export type SourceVendor = "bambu" | "creality" | "anycubic" | "snapmaker" | "elegoo" | "prusa" | "flashforge" | "other";

const VENDOR_PATTERNS: ReadonlyArray<{ vendor: SourceVendor; pattern: RegExp }> = [
  { vendor: "bambu", pattern: /^(bambu\s*lab|bbl)\b/i },
  { vendor: "creality", pattern: /^creality\b/i },
  { vendor: "anycubic", pattern: /^anycubic\b/i },
  { vendor: "snapmaker", pattern: /^snapmaker\b/i },
  { vendor: "elegoo", pattern: /^elegoo\b/i },
  { vendor: "prusa", pattern: /^(original\s+)?prusa\b/i },
  { vendor: "flashforge", pattern: /^flashforge\b/i },
];

export interface FilamentSlotInfo {
  /** 1-based slot number, as slicers show it. */
  slot: number;
  /** "#RRGGBB" (or whatever the file holds, with a leading "#"). */
  color: string;
  /** Material, e.g. "PLA", from `filament_type` or guessed from the preset name. */
  type: string;
  /** The source preset name, e.g. `"Bambu PLA Matte @BBL X1C"`. Empty if the file has none. */
  presetName: string;
  /** The real product color name, when the preset and hex match a known filament. */
  colorName?: FilamentColorMatch;
}

export interface Inspection {
  /** Distinct plate numbers that have objects, ascending. */
  plates: number[];
  /** Top-level objects with their footprint on the source bed (bbox, or fallbackXy when bbox is null). */
  objects: ConvertObject[];
  filaments: FilamentSlotInfo[];
  /** The file's first nozzle_diameter as written, e.g. "0.4". */
  nozzleDiameter: string | null;
  /** The supported nozzle size profile matching uses, or null if none could be read. */
  matchNozzleDiameter: SupportedNozzleDiameter | null;
  layerHeight: number | null;
  /** The source's process preset, e.g. `"0.20mm Standard @BBL X1C"`. */
  sourcePresetName: string | null;
  /** The tier name parsed from it, e.g. "Standard". */
  tierName: string | null;
  /** e.g. "Bambu Lab X1 Carbon". */
  printerModel: string | null;
  sourceVendor: SourceVendor;
  /** The source slicer's settings version string, e.g. "02.02.00.85". */
  slicerVersion: string | null;
  /** The source bed's printable_area, for drawing the source plate. */
  sourcePrintableArea: string[] | null;
  /** Non-fatal notes from reading the file. */
  warnings: string[];
  /**
   * The project's unpacked size in bytes. Above 1 GB, converting takes a minute or two and a few GB of
   * memory (the warnings say so too), so a UI can say that before the user converts.
   */
  unpackedBytes: number;
}

const MAX_DISPLAY_STRING = 500;

function asDisplayString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? plainText(value.slice(0, MAX_DISPLAY_STRING)) : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Keeps array positions so parallel arrays (colors, types, names) stay aligned; non-strings become "". */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? plainText(v.slice(0, MAX_DISPLAY_STRING)) : typeof v === "number" ? String(v) : ""));
}

function guessMaterial(presetName: string): string {
  for (const material of ["PLA", "PETG", "TPU", "ABS"]) if (presetName.includes(material)) return material;
  return "Filament";
}

/**
 * The source printer's maker, from `printer_model` (e.g. "Creality K2 Plus"),
 * falling back to the printer named after "@" in the process preset (e.g.
 * "0.20mm Standard @BBL X1C"). Not the 3MF's Application tag: Anycubic
 * Slicer Next writes "BambuStudio" there.
 */
export function detectSourceVendor(printerModel: string | null, sourcePresetName: string | null = null): SourceVendor {
  const presetPrinter = sourcePresetName?.split("@")[1]?.trim() ?? null;
  for (const candidate of [printerModel, presetPrinter]) {
    if (!candidate) continue;
    const match = VENDOR_PATTERNS.find(({ pattern }) => pattern.test(candidate));
    if (match) return match.vendor;
  }
  return "other";
}

/** Builds an {@link Inspection} from a parsed project's settings and objects. */
export function inspectProject(projectSettings: Record<string, unknown>, objects: ConvertObject[], warnings: readonly string[], unpackedBytes: number): Inspection {
  const colors = toStringArray(projectSettings.filament_colour);
  const types = toStringArray(projectSettings.filament_type);
  const names = toStringArray(projectSettings.filament_settings_id);
  const filaments = colors.map((color, i): FilamentSlotInfo => {
    const presetName = names[i] ?? "";
    const hex = color.startsWith("#") ? color : `#${color}`;
    const colorName = lookupFilamentColorName(presetName, hex);
    return {
      slot: i + 1,
      color: hex,
      type: types[i] || guessMaterial(presetName),
      presetName,
      ...(colorName ? { colorName } : {}),
    };
  });

  const plates = [...new Set(objects.flatMap((o) => (o.plate === undefined ? [] : [o.plate])))].sort((a, b) => a - b);

  const rawNozzle = Array.isArray(projectSettings.nozzle_diameter) ? projectSettings.nozzle_diameter[0] : projectSettings.nozzle_diameter;
  const layerHeightRaw = projectSettings.layer_height;
  const layerHeightValue =
    typeof layerHeightRaw === "number" ? layerHeightRaw : typeof layerHeightRaw === "string" ? Number.parseFloat(layerHeightRaw) : NaN;
  const sourcePresetName = asDisplayString(projectSettings.print_settings_id) ?? asDisplayString(projectSettings.name);
  const printerModel =
    asDisplayString(projectSettings.printer_model) ??
    asDisplayString(projectSettings.printer_settings_id)?.replace(/\s+\d+(\.\d+)?\s+nozzle$/i, "") ??
    null;
  const printableArea = projectSettings.printable_area;

  return {
    plates,
    objects: objects.map((o) => ({ ...o })),
    filaments,
    nozzleDiameter: asDisplayString(rawNozzle),
    matchNozzleDiameter: detectNozzleDiameter(projectSettings),
    layerHeight: Number.isFinite(layerHeightValue) ? layerHeightValue : null,
    sourcePresetName,
    tierName: typeof projectSettings.print_settings_id === "string" ? parseTierName(projectSettings.print_settings_id) : null,
    printerModel,
    sourceVendor: detectSourceVendor(printerModel, sourcePresetName),
    slicerVersion: asDisplayString(projectSettings.version),
    sourcePrintableArea:
      Array.isArray(printableArea) && printableArea.length <= 64 && printableArea.every((p) => typeof p === "string")
        ? (printableArea as string[]).slice()
        : null,
    warnings: [...warnings],
    unpackedBytes,
  };
}
