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
export type SourceVendor = "bambu" | "creality" | "anycubic" | "snapmaker" | "elegoo" | "prusa" | "flashforge" | "qidi" | "other";

const VENDOR_PATTERNS: ReadonlyArray<{ vendor: SourceVendor; pattern: RegExp }> = [
  { vendor: "bambu", pattern: /^(bambu\s*lab|bbl)\b/i },
  { vendor: "creality", pattern: /^creality\b/i },
  { vendor: "anycubic", pattern: /^anycubic\b/i },
  { vendor: "snapmaker", pattern: /^snapmaker\b/i },
  { vendor: "elegoo", pattern: /^elegoo\b/i },
  { vendor: "prusa", pattern: /^(original\s+)?prusa\b/i },
  { vendor: "flashforge", pattern: /^flashforge\b/i },
  { vendor: "qidi", pattern: /^qidi\b/i },
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
  /**
   * How many plates the project has, empty ones included (a plate with no objects keeps its number). Always set by
   * `inspect()`; optional so code that builds an Inspection itself (a test's mock) needn't.
   */
  plateCount?: number;
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
  /**
   * Where each plate's bed sits in the source project, in mm from the first plate's, keyed by plate number: subtract it
   * from an object's `bbox` to draw the object on its own plate. Present only when the source slicer doesn't lay its
   * plates out on Bambu Studio's grid (columns = ceil(sqrt(plate count)), a pitch of 1.2 beds, later rows at negative Y):
   * PrusaSlicer 2.9 places its beds in rings with a gap of at most 100 mm, later rows at positive Y. Absent: use that grid.
   */
  sourcePlateOrigins?: Record<number, [number, number]>;
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
 * "0.20mm Standard @BBL X1C"), then in the first filament preset (QIDI
 * Studio's printer model and process preset say only "Q1 Pro"; its filament
 * presets say "@Qidi Q1 Pro 0.4 nozzle"). Not the 3MF's Application tag:
 * Anycubic Slicer Next writes "BambuStudio" there.
 */
/** PrusaSlicer's printer profiles name their maker in `printer_notes` ("PRINTER_VENDOR_PRUSA3D"), where the model name doesn't. */
const NOTES_VENDORS: Readonly<Record<string, SourceVendor>> = { PRUSA3D: "prusa", CREALITY: "creality", ANYCUBIC: "anycubic", ELEGOO: "elegoo", FLASHFORGE: "flashforge", SNAPMAKER: "snapmaker", BBL: "bambu" };

export function detectSourceVendor(
  printerModel: string | null,
  sourcePresetName: string | null = null,
  printerNotes: string | null = null,
  printerPresetName: string | null = null,
  filamentPresetName: string | null = null,
): SourceVendor {
  const presetPrinter = sourcePresetName?.split("@")[1]?.trim() ?? null;
  const filamentPrinter = filamentPresetName?.split("@")[1]?.trim() ?? null;
  const notesVendor = /\bPRINTER_VENDOR_([A-Z0-9]{1,20})\b/.exec(printerNotes ?? "")?.[1];
  if (notesVendor && Object.hasOwn(NOTES_VENDORS, notesVendor)) return NOTES_VENDORS[notesVendor];
  // The printer preset's name last: PrusaSlicer's `printer_model` is a code ("COREONE"), its preset name says "Prusa CORE One".
  for (const candidate of [printerModel, presetPrinter, printerPresetName, filamentPrinter]) {
    if (!candidate) continue;
    const match = VENDOR_PATTERNS.find(({ pattern }) => pattern.test(candidate));
    if (match) return match.vendor;
  }
  return "other";
}

/** Builds an {@link Inspection} from a parsed project's settings and objects. */
export function inspectProject(
  projectSettings: Record<string, unknown>,
  objects: ConvertObject[],
  warnings: readonly string[],
  unpackedBytes: number,
  sourcePlateOrigins?: Readonly<Record<number, readonly [number, number]>>,
  plateCount?: number,
): Inspection {
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
    plateCount: Math.max(1, plateCount ?? 0, ...plates),
    objects: objects.map((o) => ({ ...o })),
    filaments,
    nozzleDiameter: asDisplayString(rawNozzle),
    matchNozzleDiameter: detectNozzleDiameter(projectSettings),
    layerHeight: Number.isFinite(layerHeightValue) ? layerHeightValue : null,
    sourcePresetName,
    tierName: typeof projectSettings.print_settings_id === "string" ? parseTierName(projectSettings.print_settings_id) : null,
    printerModel,
    sourceVendor: detectSourceVendor(
      printerModel,
      sourcePresetName,
      typeof projectSettings.printer_notes === "string" ? projectSettings.printer_notes.slice(0, 4000) : null,
      asDisplayString(projectSettings.printer_settings_id),
      names[0]?.slice(0, 200) ?? null,
    ),
    slicerVersion: asDisplayString(projectSettings.version),
    sourcePrintableArea:
      Array.isArray(printableArea) && printableArea.length <= 64 && printableArea.every((p) => typeof p === "string")
        ? (printableArea as string[]).slice()
        : null,
    warnings: [...warnings],
    unpackedBytes,
    ...(sourcePlateOrigins
      ? { sourcePlateOrigins: Object.fromEntries(Object.entries(sourcePlateOrigins).slice(0, 1000).map(([p, origin]) => [Number(p), [origin[0], origin[1]]])) }
      : {}),
  };
}
