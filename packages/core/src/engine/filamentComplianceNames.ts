// SPDX-License-Identifier: MIT
/**
 * Filament names for the Snapmaker and Generic naming options, used to
 * satisfy marketplace rules (e.g. Snapmaker Space, Snapmaker's own model
 * platform) that require an uploaded project to declare a Generic or
 * Snapmaker filament rather than a third-party one like Bambu's own.
 *
 * The names are data, not code: the profile catalog's `filamentNames`
 * (any2orca-profiles' data/index.json, generated from the filament presets
 * Snapmaker installs with Snapmaker Orca) lists every preset each printer
 * offers and the product lines that map onto them. This module only matches
 * a source filament to a line and picks that line's preset for the target
 * printer, so every name it returns exists for that nozzle size.
 *
 * Matching is by product line, never by color: a filament's material is its
 * `filament_type`, and its line is the first line for that material whose
 * keywords appear in its name or type ("Bambu PLA Matte" is PLA Matte,
 * "Bambu PLA Basic" is plain PLA, which maps to Snapmaker PLA SnapSpeed).
 */

export type FilamentComplianceMode = "generic" | "snapmaker";

/** One preset a printer offers, with what a project saved with it records. */
export interface FilamentPresetEntry {
  /** The preset family, its name without the " @printer" part, e.g. "Snapmaker PLA Matte". */
  family: string;
  /** What Snapmaker Orca writes as this preset's `filament_ids` entry. */
  id: string;
  /** What Snapmaker Orca writes as this preset's `filament_vendor` entry. */
  vendor: string;
}

/** A product line and the preset family each naming option maps it to (null: no such preset). */
export interface FilamentLine {
  id: string;
  label: string;
  materials: string[];
  keywords: string[];
  snapmaker: string | null;
  generic: string | null;
}

/** The profile catalog's `filamentNames`. */
export interface FilamentNameTable {
  profileSet: { repository: string; version: string; commit: string };
  /** Source `filament_type` values read as another material, e.g. "PA6-CF" as "PA-CF". */
  materialAliases: Record<string, string>;
  lines: FilamentLine[];
  /** Per printer id: every filament preset it offers, by name. */
  printers: Record<string, { nozzleDiameter: string; presets: Record<string, FilamentPresetEntry> }>;
}

export interface FilamentNameResult {
  /**
   * - "renamed": named after the line's preset for the chosen option.
   * - "kept": already the name of a preset of the chosen kind for this
   *   printer (e.g. a file saved in Snapmaker Orca), so the creator's
   *   choice stays; its id and vendor are still written as that preset's.
   * - "generic": the Snapmaker option, but Snapmaker makes no preset for
   *   this line at this nozzle size, so the Generic one is used.
   * - "unchanged": no preset of either kind fits (an unknown material, or
   *   none at this nozzle size); the creator's name stays.
   */
  outcome: "renamed" | "kept" | "generic" | "unchanged";
  /** The preset written; absent when unchanged. */
  preset?: { name: string; id: string; vendor: string };
  /** The product line matched, or null when the material has no line. */
  line: { id: string; label: string } | null;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function containsKeyword(haystack: string[], keyword: string): boolean {
  const needle = tokens(keyword);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
}

/**
 * The part of a `filament_settings_id` that names the filament: without the
 * " @printer..." part, and without a "(project.3mf)" tag the slicer appends
 * to presets it imported from a project, whose file name says nothing about
 * the material.
 */
function filamentNamePart(filamentSettingsId: string): string {
  const withoutProjectTags = filamentSettingsId.replace(/\([^()]*\.3mf\)/gi, " ");
  const at = withoutProjectTags.indexOf(" @");
  return at >= 0 ? withoutProjectTags.slice(0, at) : withoutProjectTags;
}

/** The product line a source filament belongs to, or null when its material has none. */
export function matchFilamentLine(table: FilamentNameTable, filamentType: string, filamentSettingsId: string): FilamentLine | null {
  const type = filamentType.trim().toUpperCase();
  const material = Object.hasOwn(table.materialAliases, type) ? table.materialAliases[type] : type;
  const words = tokens(`${filamentType} ${filamentNamePart(filamentSettingsId)}`);
  for (const line of table.lines) {
    if (!line.materials.includes(material)) continue;
    if (line.keywords.length === 0 || line.keywords.some((k) => containsKeyword(words, k))) return line;
  }
  return null;
}

/**
 * The name, id and vendor one filament gets under a naming option for the
 * target printer. Never returns a name the printer doesn't offer.
 */
export function resolveFilamentName(
  table: FilamentNameTable,
  printerId: string,
  filamentType: string,
  filamentSettingsId: string,
  mode: FilamentComplianceMode,
): FilamentNameResult {
  const printer = Object.hasOwn(table.printers, printerId) ? table.printers[printerId] : undefined;
  const line = matchFilamentLine(table, filamentType, filamentSettingsId);
  const lineRef = line ? { id: line.id, label: line.label } : null;
  if (!printer) return { outcome: "unchanged", line: lineRef };
  const presetOf = (name: string) => {
    const entry = printer.presets[name];
    return { name, id: entry.id, vendor: entry.vendor };
  };

  const current = filamentSettingsId.trim();
  const currentEntry = Object.hasOwn(printer.presets, current) ? printer.presets[current] : undefined;
  if (currentEntry && currentEntry.vendor.toLowerCase() === mode) return { outcome: "kept", preset: presetOf(current), line: lineRef };
  if (!line) return { outcome: "unchanged", line: null };

  const byFamily = (family: string | null) => (family === null ? undefined : Object.keys(printer.presets).find((name) => printer.presets[name].family === family));
  if (mode === "snapmaker") {
    const snapmaker = byFamily(line.snapmaker);
    if (snapmaker) return { outcome: "renamed", preset: presetOf(snapmaker), line: lineRef };
  }
  const generic = byFamily(line.generic);
  if (generic) return { outcome: mode === "snapmaker" ? "generic" : "renamed", preset: presetOf(generic), line: lineRef };
  return { outcome: "unchanged", line: lineRef };
}
