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

/**
 * A filament naming option: every filament set to a preset Snapmaker Orca ships, of Snapmaker's, of Polymaker's (for
 * the PLA it has U1 presets for; the Snapmaker option's preset for the rest) or Generic.
 */
export type FilamentComplianceMode = "generic" | "snapmaker" | "polymaker";

/** The filament naming options, in the order a UI lists them after the creator's own names. */
export const FILAMENT_COMPLIANCE_MODES: readonly FilamentComplianceMode[] = ["snapmaker", "polymaker", "generic"];

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

/** One of a brand's product lines and the brand's preset family it maps to (null: none of the brand's presets fits it). */
export interface FilamentBrandLine {
  /** The line's id in the catalog, e.g. "polymaker-pla-silk". */
  id: string;
  /** The line as people say it, e.g. "Polymaker silk PLA". */
  label: string;
  /** The materials (`filament_type`, after the aliases) the line is for. */
  materials: string[];
  /** Words in a filament's name or type that mark the line; none for the material's plain line. */
  keywords: string[];
  /** The brand's preset family for the line, e.g. "Polymaker Silk PLA Family"; null when none of the brand's presets fits it. */
  preset: string | null;
}

/**
 * A filament maker other than Snapmaker whose presets Snapmaker Orca installs for the U1 (Polymaker). Under the
 * Snapmaker option, a filament that is the brand's takes the brand's preset for its line, where the target nozzle
 * size has one; any other filament of the brand follows the ordinary lines. A filament is the brand's when its
 * `filament_vendor` is one of `vendors`, or its name holds one of `names` as a word.
 */
export interface FilamentBrand {
  /** The brand's id in the catalog, e.g. "polymaker". */
  id: string;
  /** The brand's name, e.g. "Polymaker". */
  label: string;
  /** `filament_vendor` values that say the filament is the brand's, lower-case. */
  vendors: string[];
  /** Words in a filament's name that say it is the brand's ("polyterra"), lower-case. */
  names: string[];
  /** The brand's lines; as with the ordinary lines, the first one for the material whose keywords match wins. */
  lines: FilamentBrandLine[];
}

/** The profile catalog's `filamentNames`. */
export interface FilamentNameTable {
  profileSet: { repository: string; version: string; commit: string };
  /** Source `filament_type` values read as another material, e.g. "PA6-CF" as "PA-CF". */
  materialAliases: Record<string, string>;
  lines: FilamentLine[];
  /** Filament makers whose own presets the Snapmaker option may choose. Absent in older catalog data. */
  brands?: FilamentBrand[];
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
  /** Set when the preset is a brand's own (a Polymaker preset for a Polymaker filament): the brand, as the catalog names it. */
  brand?: { id: string; label: string };
  /**
   * Under a brand's option (Polymaker): set when none of the brand's presets fits this filament for this printer, so
   * it got what the Snapmaker option gives it (the rest of the result).
   */
  brandFallback?: { id: string; label: string };
}

/** What else is known about a source filament when its name is resolved. */
export interface FilamentNameSource {
  /** The filament's `filament_vendor` in the source project, which can say whose it is where its name doesn't. */
  vendor?: string;
  /**
   * `false` leaves the brands out: the name is resolved by the ordinary lines alone, as before brands existed.
   * The conversion uses it where it asks which Snapmaker preset stands behind a filament it doesn't rename.
   */
  brands?: boolean;
}

/**
 * Whether a filament naming option has presets of its own for a nozzle size: `false` for `"polymaker"` where Snapmaker
 * Orca ships no Polymaker preset for that size (it has them for the 0.4 mm nozzle only), and for any option when the
 * table has no printer of that size. A UI can gray the option out there and say why; the conversion still accepts it,
 * and every filament then gets what `"snapmaker"` gives it.
 *
 * @param table the profile catalog's `filamentNames` (`catalog.index.filamentNames`); without it, `false`.
 * @param nozzleDiameter the nozzle size converted for, such as "0.4".
 */
export function filamentModeHasPresets(table: FilamentNameTable | undefined, mode: FilamentComplianceMode, nozzleDiameter: string): boolean {
  if (!table) return false;
  const printers = Object.values(table.printers).filter((p) => p.nozzleDiameter === nozzleDiameter);
  if (mode !== "polymaker") return printers.length > 0;
  return printers.some((p) => Object.values(p.presets).some((entry) => entry.vendor.toLowerCase() === "polymaker"));
}

/** The nozzle sizes a filament naming option has presets of its own for, lowest first: for Polymaker, ["0.4"]. */
export function filamentModeNozzleSizes(table: FilamentNameTable | undefined, mode: FilamentComplianceMode): string[] {
  if (!table) return [];
  const sizes = new Set(Object.values(table.printers).map((p) => p.nozzleDiameter));
  return [...sizes].filter((size) => filamentModeHasPresets(table, mode, size)).sort((a, b) => Number(a) - Number(b));
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

/** The brand a source filament is from, by its vendor value first, then by a word of its name; null when it is none the table lists. */
export function matchFilamentBrand(table: FilamentNameTable, filamentSettingsId: string, vendor?: string): FilamentBrand | null {
  const brands = table.brands ?? [];
  const named = typeof vendor === "string" ? vendor.trim().toLowerCase() : "";
  const byVendor = named === "" ? undefined : brands.find((brand) => brand.vendors.includes(named));
  if (byVendor) return byVendor;
  const words = tokens(filamentNamePart(filamentSettingsId));
  return brands.find((brand) => brand.names.some((name) => words.includes(name))) ?? null;
}

/**
 * The name, id and vendor one filament gets under a naming option for the
 * target printer. Never returns a name the printer doesn't offer.
 *
 * Under the Snapmaker option, a filament from a brand whose presets Snapmaker
 * Orca installs (the table's `brands`: Polymaker) takes that brand's preset
 * for its line when the printer has one, and keeps it when it already has
 * one; `source.vendor` lets the source's `filament_vendor` say whose it is.
 *
 * Under the Polymaker option, every filament is read by Polymaker's lines, whoever made it: a PLA takes Polymaker's
 * preset for its kind where the printer has one, and anything else gets what the Snapmaker option gives it, with
 * `brandFallback` set.
 */
export function resolveFilamentName(
  table: FilamentNameTable,
  printerId: string,
  filamentType: string,
  filamentSettingsId: string,
  mode: FilamentComplianceMode,
  source: FilamentNameSource = {},
): FilamentNameResult {
  const printer = Object.hasOwn(table.printers, printerId) ? table.printers[printerId] : undefined;
  const line = matchFilamentLine(table, filamentType, filamentSettingsId);
  const lineRef = line ? { id: line.id, label: line.label } : null;
  if (!printer) return { outcome: "unchanged", line: lineRef };
  const presetOf = (name: string) => {
    const entry = printer.presets[name];
    return { name, id: entry.id, vendor: entry.vendor };
  };
  const byFamily = (family: string | null) => (family === null ? undefined : Object.keys(printer.presets).find((name) => printer.presets[name].family === family));

  const current = filamentSettingsId.trim();
  const currentEntry = Object.hasOwn(printer.presets, current) ? printer.presets[current] : undefined;
  if (currentEntry && currentEntry.vendor.toLowerCase() === mode) return { outcome: "kept", preset: presetOf(current), line: lineRef };

  // The brand's preset for a filament's line, when the brand has a line for it and the printer has that preset.
  const brandPreset = (brand: FilamentBrand) => {
    const type = filamentType.trim().toUpperCase();
    const material = Object.hasOwn(table.materialAliases, type) ? table.materialAliases[type] : type;
    const words = tokens(`${filamentType} ${filamentNamePart(filamentSettingsId)}`);
    const brandLine = brand.lines.find((l) => l.materials.includes(material) && (l.keywords.length === 0 || l.keywords.some((k) => containsKeyword(words, k))));
    const preset = brandLine ? byFamily(brandLine.preset) : undefined;
    return brandLine && preset ? { preset, line: { id: brandLine.id, label: brandLine.label } } : null;
  };

  if (mode === "polymaker") {
    const brand = (table.brands ?? []).find((b) => b.id === "polymaker");
    const brandRef = brand ? { id: brand.id, label: brand.label } : { id: "polymaker", label: "Polymaker" };
    const found = brand ? brandPreset(brand) : null;
    if (found) return { outcome: "renamed", preset: presetOf(found.preset), line: found.line, brand: brandRef };
    return { ...resolveFilamentName(table, printerId, filamentType, filamentSettingsId, "snapmaker", source), brandFallback: brandRef };
  }

  if (mode === "snapmaker" && source.brands !== false) {
    const brands = table.brands ?? [];
    // Already one of a brand's presets for this printer (a file saved in Snapmaker Orca): the creator's choice stays.
    const currentBrand = currentEntry ? brands.find((brand) => brand.vendors.includes(currentEntry.vendor.toLowerCase())) : undefined;
    if (currentBrand) return { outcome: "kept", preset: presetOf(current), line: lineRef, brand: { id: currentBrand.id, label: currentBrand.label } };
    const brand = matchFilamentBrand(table, filamentSettingsId, source.vendor);
    const found = brand ? brandPreset(brand) : null;
    if (brand && found) return { outcome: "renamed", preset: presetOf(found.preset), line: found.line, brand: { id: brand.id, label: brand.label } };
  }
  if (!line) return { outcome: "unchanged", line: null };

  if (mode === "snapmaker") {
    const snapmaker = byFamily(line.snapmaker);
    if (snapmaker) return { outcome: "renamed", preset: presetOf(snapmaker), line: lineRef };
  }
  const generic = byFamily(line.generic);
  if (generic) return { outcome: mode === "snapmaker" ? "generic" : "renamed", preset: presetOf(generic), line: lineRef };
  return { outcome: "unchanged", line: lineRef };
}
