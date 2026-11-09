// SPDX-License-Identifier: MIT
/**
 * The Snapmaker and Generic filament options: a slot renamed to a preset Snapmaker Orca ships takes that
 * preset's own settings, standard and high-flow values and its G-code included, so the file, Snapmaker Orca's
 * app (which resets a filament whose name matches a shipped preset) and its command line (which uses the file's
 * values) all agree. And each filament's entry in `different_settings_to_system` names the settings that differ
 * from the preset the app resets that filament to, so the app keeps what the file says, the creator's values
 * under Original included, and warns about G-code only where it really differs.
 */
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import type { PrinterFilamentPresets } from "../profiles.js";
import { FILAMENT_FLOW_VARIANT_KEYS } from "./applyFilamentFlowVariants.js";
import { resolveFilamentName, type FilamentNameTable } from "./filamentComplianceNames.js";
import type { JsonRecord } from "./types.js";

const VARIANT_KEYS: ReadonlySet<string> = new Set(FILAMENT_FLOW_VARIANT_KEYS);

/** Filament settings that are project state rather than a preset's (Snapmaker Orca's presets hold no color), so never named. */
const PROJECT_STATE_KEYS: ReadonlySet<string> = new Set(["filament_colour"]);

/**
 * Named for a filament no U1 preset fits: the app resets it to an installed preset of the same name, and one made for
 * another printer (Bambu's, say) lists only that maker's printers, so the filament couldn't be used with the U1.
 */
const COMPATIBILITY_KEYS = ["compatible_printers"];

/** A slot that takes a preset's settings: its 0-based index, the preset, and the creator's values it replaces. */
export interface AppliedFilamentPreset {
  slot: number;
  preset: string;
  changed: Array<{ key: string; before: string; after: string }>;
}

/** One preset's settings: the values the printer's presets share, with its own over them. Undefined when there are none. */
export function presetSettingsFor(presets: PrinterFilamentPresets | undefined, name: string): Record<string, string[]> | undefined {
  if (!presets || !Object.hasOwn(presets.presets, name)) return undefined;
  return { ...presets.shared, ...presets.presets[name] };
}

const first = (value: unknown): string | undefined => (Array.isArray(value) ? (value[0] === undefined ? undefined : String(value[0])) : value === undefined ? undefined : String(value));

/** What a slot's preset replaces: each setting whose standard value differs from the creator's. */
export function presetChanges(values: Record<string, string[]>, creator: (key: string) => unknown): AppliedFilamentPreset["changed"] {
  const out: AppliedFilamentPreset["changed"] = [];
  for (const key of Object.keys(values).sort()) {
    const before = first(creator(key));
    const after = values[key][0];
    if (before !== undefined && after !== undefined && before !== after) out.push({ key, before, after });
  }
  return out;
}

/** Writes `values` into one slot: the project's per-filament lists, and the embedded preset file named `name`. */
function writeSlot(settings: JsonRecord, files: Record<string, JsonRecord>, slot: number, name: string, values: Record<string, string[]>, slotCount: number): void {
  for (const [key, value] of Object.entries(values)) {
    const list = settings[key];
    if (!Array.isArray(list)) continue;
    const next = [...list];
    if (VARIANT_KEYS.has(key) && next.length === slotCount * 2) {
      next[slot * 2] = value[0];
      next[slot * 2 + 1] = value[1] ?? value[0];
    } else if (next.length === slotCount) {
      next[slot] = value[0];
    } else continue;
    settings[key] = next;
  }
  for (const cfg of Object.values(files)) {
    if (cfg.name !== name) continue;
    for (const [key, value] of Object.entries(values)) {
      const own = cfg[key];
      // The embedded preset keeps its layout: one value where it holds one, the preset's own list otherwise.
      cfg[key] = Array.isArray(own) && own.length === 1 ? [value[0]] : [...value];
    }
  }
}

/**
 * Writes each applied preset's settings into its slot: the project's per-filament lists (both values of a
 * per-variant setting where the nozzle has a high-flow option) and the slot's embedded preset file. Runs after
 * every other filament step, so nothing later overwrites it.
 */
export function writeFilamentPresets(
  settings: JsonRecord,
  files: Record<string, JsonRecord>,
  applied: readonly AppliedFilamentPreset[],
  presets: PrinterFilamentPresets | undefined,
  slotCount: number,
): void {
  for (const { slot, preset } of applied) {
    const values = presetSettingsFor(presets, preset);
    if (values) writeSlot(settings, files, slot, preset, values, slotCount);
  }
}

/**
 * What Snapmaker Orca's app resets a filament's unnamed settings to when it opens the file: the parent the file
 * names for it, or else the installed preset of the same name (Preset.cpp, load_external_preset).
 * - `preset`: a U1 preset whose settings the catalog holds: the slot's own, or the `parent` written for it.
 * - `named`: a preset the Snapmaker or Generic option named whose settings the catalog lacks; the app uses its own.
 * - `source`: no U1 preset fits, so the app resets to whatever preset of that name is installed, if any.
 */
export type FilamentBase = { kind: "preset"; values: Record<string, string[]>; parent?: string } | { kind: "named" } | { kind: "source" };

/**
 * Each slot's base. Under Original, a filament whose name isn't a U1 preset gets a U1 parent, the preset the
 * Generic option would choose: the creator's name and values stay, and what the file doesn't name resets to a
 * preset made for the U1 rather than to another printer's preset of the same name.
 */
export function filamentBases(
  settings: JsonRecord,
  slotCount: number,
  presets: PrinterFilamentPresets | undefined,
  table: FilamentNameTable | undefined,
  printerId: string,
  /** The Snapmaker or Generic option was chosen. */
  option: boolean,
): FilamentBase[] {
  const names = Array.isArray(settings.filament_settings_id) ? settings.filament_settings_id : [];
  const types = Array.isArray(settings.filament_type) ? settings.filament_type : [];
  const offered = table && Object.hasOwn(table.printers, printerId) ? table.printers[printerId].presets : {};
  return Array.from({ length: slotCount }, (_, i): FilamentBase => {
    const name = typeof names[i] === "string" ? names[i] : "";
    const own = presetSettingsFor(presets, name);
    if (own) return { kind: "preset", values: own };
    if (Object.hasOwn(offered, name)) return option ? { kind: "named" } : { kind: "source" };
    if (!table) return { kind: "source" };
    const parent = resolveFilamentName(table, printerId, typeof types[i] === "string" ? types[i] : "", name, "generic").preset?.name;
    const values = parent === undefined ? undefined : presetSettingsFor(presets, parent);
    return values ? { kind: "preset", values, parent } : { kind: "source" };
  });
}

/**
 * A slot with a U1 parent takes the parent's own G-code, the U1's, so the app (which resets unnamed settings to
 * the parent's) and the command line (which uses the file's) run the same G-code, and neither calls it modified.
 */
export function writeParentGcode(settings: JsonRecord, files: Record<string, JsonRecord>, bases: readonly FilamentBase[], slotCount: number): void {
  const names = Array.isArray(settings.filament_settings_id) ? settings.filament_settings_id : [];
  bases.forEach((base, slot) => {
    const name = names[slot];
    if (base.kind !== "preset" || base.parent === undefined || typeof name !== "string") return;
    const gcode = Object.fromEntries(Object.entries(base.values).filter(([key]) => key.endsWith("_gcode")));
    writeSlot(settings, files, slot, name, gcode, slotCount);
  });
}

const text = (v: unknown): string | undefined => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : undefined);

/** One slot's values of a filament setting: one per slot, or two (standard, high flow); undefined for any other layout. */
function slotValues(value: unknown, slot: number, slotCount: number): string[] | undefined {
  const values = !Array.isArray(value) ? [value] : value.length === slotCount * 2 ? value.slice(slot * 2, slot * 2 + 2) : value.length === slotCount ? [value[slot]] : undefined;
  const out = values?.map(text);
  return out?.every((v) => v !== undefined) ? (out as string[]) : undefined;
}

/** Whether two value lists mean the same, one value standing for both variants as Snapmaker Orca reads it. */
function sameValues(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a || !b) return false;
  if (a.length === b.length) return a.every((v, i) => v === b[i]);
  if (a.length === 1) return b.every((v) => v === a[0]);
  return b.length === 1 && a.every((v) => v === b[0]);
}

/** The settings the source file says the creator changed in one filament; null when its list can't be read for that slot. */
function sourceEntry(source: JsonRecord, slot: number, slotCount: number): string[] | null {
  const list = source.different_settings_to_system;
  if (!Array.isArray(list) || list.length !== slotCount + 2) return null;
  const entry: unknown = list[slot + 1];
  return typeof entry === "string" ? entry.split(";") : null;
}

/**
 * Each filament's entry in `different_settings_to_system` names the settings that differ from its base, and
 * a parent goes in `inherits_group`. The app resets every setting an entry doesn't name to the base's value,
 * which is the file's anyway, and warns about every G-code setting one names (PresetBundle.cpp,
 * validate_presets), so an entry naming more than differs warns about G-code nobody changed. A filament no
 * U1 preset fits names what the source file says the creator changed, what the conversion changed (its
 * G-code, the U1's own, among them) and the printers it suits; every filament setting when the source's list
 * can't be read.
 */
export function listFilamentSettings(settings: JsonRecord, bases: readonly FilamentBase[], source: JsonRecord, slotCount: number): void {
  if (slotCount < 1) return;
  const keys = Object.keys(settings)
    .filter((k) => Object.hasOwn(SETTINGS_CATALOG, k) && SETTINGS_CATALOG[k].group === "filament" && !PROJECT_STATE_KEYS.has(k))
    .sort();
  const known = new Set(keys);
  const entries = Array.from({ length: slotCount }, (_, slot) => {
    const base: FilamentBase = bases[slot] ?? { kind: "source" };
    if (base.kind === "named") return "";
    const values = (key: string) => slotValues(settings[key], slot, slotCount);
    if (base.kind === "preset") return keys.filter((k) => !sameValues(values(k), Object.hasOwn(base.values, k) ? base.values[k] : undefined)).join(";");
    const creator = sourceEntry(source, slot, slotCount);
    const named = creator === null ? keys : [...creator.filter((k) => known.has(k)), ...keys.filter((k) => !sameValues(slotValues(source[k], slot, slotCount), values(k)))];
    return [...new Set([...named, ...COMPATIBILITY_KEYS])].sort().join(";");
  });
  const current = Array.isArray(settings.different_settings_to_system) ? settings.different_settings_to_system : [];
  const print = typeof current[0] === "string" ? current[0] : "";
  const printer = current.length === slotCount + 2 && typeof current[slotCount + 1] === "string" ? current[slotCount + 1] : "";
  settings.different_settings_to_system = [print, ...entries, printer];
  const parents = bases.map((base) => (base.kind === "preset" && base.parent !== undefined ? base.parent : ""));
  if (parents.some((parent) => parent !== "")) settings.inherits_group = ["", ...parents, ""];
}
