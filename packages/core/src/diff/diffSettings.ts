// SPDX-License-Identifier: MIT
/**
 * The settings diff: compares two sets of project settings key by key, the
 * way Snapmaker Orca groups and names them. Either side can be a project's
 * own settings, a stock profile's, or a preset applied to its base profile;
 * the caller supplies the settings and a label for each side.
 *
 * Values are compared as Snapmaker Orca treats them, so a difference is a
 * real one: numbers compare by value ("1.0" equals "1", "15.0%" equals
 * "15%"), a single value equals a list that repeats it (Snapmaker Orca
 * repeats one value for every toolhead or variant), G-code compares without
 * line-ending or trailing-space differences, and filament settings compare
 * filament slot by filament slot.
 *
 * A setting only one side has is `only-a` or `only-b` when Snapmaker Orca
 * knows the setting, and `unmatched` when it doesn't (a key from another
 * slicer, which may exist in Snapmaker Orca under another name). The diff
 * never guesses a mapping between names.
 */
import { Any2orcaError } from "../errors.js";
import { ABOVE_STOCK_DEFAULTS, machineLimitFor } from "../engine/aboveStock.js";
import { FILAMENT_FLOW_VARIANT_KEYS, MAX_VOLUMETRIC_SPEED } from "../engine/applyFilamentFlowVariants.js";
import { SETTINGS_CATALOG, SETTINGS_CATALOG_SOURCE, type SettingGroup } from "./settingsCatalog.js";
import { isOtherPrinter, valueLayout, type ValueLayout } from "./valueLayout.js";

export type DiffGroupName = SettingGroup | "other";
export type DiffStatus = "same" | "changed" | "only-a" | "only-b" | "unmatched";

/**
 * A value worth a look, when the diff was given a reference profile: a speed
 * or acceleration above the printer's machine limits (it will be capped), or
 * a speed, acceleration or filament max volumetric speed above Snapmaker's
 * stock value (22/40 mm³/s for max volumetric speed).
 */
export type DiffAttention = "above-limit" | "above-stock";

export interface DiffRow {
  key: string;
  /** Where Snapmaker Orca shows the setting, for example "Speed > Acceleration > Outer wall", or the key itself. */
  label: string;
  /** The value on each side as text (list entries joined with ", "), or null where that side doesn't have the setting. */
  a: string | null;
  b: string | null;
  status: DiffStatus;
  /** The settings page and section Snapmaker Orca shows the setting on (for example "Speed" and "Acceleration"), for grouping rows; absent where it shows it on none. */
  page?: string;
  section?: string;
  /** Set when either side's value is above the reference profile's stock value or its machine limits (needs `DiffOptions.reference`). */
  attention?: DiffAttention;
  /** What each side's several values are, where they're a pair or per-nozzle list (see {@link ValueLayout}); absent for single values. */
  layout?: { a?: ValueLayout; b?: ValueLayout };
}

export interface DiffGroup {
  group: DiffGroupName;
  /** For filament settings: the filament slot, 1 first. */
  slot?: number;
  rows: DiffRow[];
}

export interface SettingsDiff {
  format: "any2orca-diff";
  version: 1;
  aLabel: string;
  bLabel: string;
  /** The Snapmaker Orca release whose settings, labels and groups the diff uses. */
  catalog: { tag: string; commit: string };
  groups: DiffGroup[];
  /** True when no row differs (in the groups compared). */
  identical: boolean;
}

export interface SettingsSide {
  /** Shown as the side's name, for example a file name or `Snapmaker's stock 0.20mm Standard @Snapmaker U1 (0.4 nozzle) profile`. */
  label: string;
  settings: Readonly<Record<string, unknown>>;
}

export interface DiffOptions {
  /** Which groups to compare. Default: all. */
  groups?: readonly DiffGroupName[];
  /** Also list settings that are the same on both sides (status "same"). Default false. */
  includeUnchanged?: boolean;
  /** Also compare bookkeeping entries (preset inheritance, the changed-settings list, version stamps). Default false. */
  includeBookkeeping?: boolean;
  /**
   * A profile to measure values against, for each row's `attention`: its
   * stock project settings and its printer's machine settings. Usually the
   * stock side of the comparison, or the profile a file would convert with.
   */
  reference?: { stock: Readonly<Record<string, unknown>>; machine: Readonly<Record<string, unknown>> };
}

/** Entries that describe how a file was saved rather than how it prints. */
export const BOOKKEEPING_KEYS: ReadonlySet<string> = new Set([
  "different_settings_to_system",
  "inherits",
  "inherits_group",
  "name",
  "from",
  "version",
  "is_custom_defined",
  "print_compatible_printers",
  "compatible_printers",
  "compatible_printers_condition",
  "compatible_prints",
  "compatible_prints_condition",
  "compatible_machine_expression_group",
  "compatible_process_expression_group",
  "upward_compatible_machine",
  "filament_ids",
  "project_schema_version",
]);

/** A project has a few hundred settings; this bounds the work for a crafted file. */
export const MAX_DIFF_KEYS = 10_000;

const GROUP_ORDER: readonly DiffGroupName[] = ["print", "filament", "machine", "other"];
const VARIANT_KEYS: ReadonlySet<string> = new Set(FILAMENT_FLOW_VARIANT_KEYS);
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?%?$/;

function entryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

/** One entry as Snapmaker Orca would compare it. */
function normalizeEntry(raw: string): string {
  const text = raw.includes("\n") || raw.includes("\r") ? raw.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "") : raw.trim();
  if (NUMBER.test(text)) {
    const percent = text.endsWith("%");
    const n = Number(percent ? text.slice(0, -1) : text);
    if (Number.isFinite(n)) return `${n}${percent ? "%" : ""}`;
  }
  return text;
}

function entries(value: unknown): string[] {
  return Array.isArray(value) ? value.map(entryText) : [entryText(value)];
}

/** Equal as Snapmaker Orca treats them: same entries, or one value repeated for every entry. */
function sameValue(a: readonly string[], b: readonly string[]): boolean {
  const x = a.map(normalizeEntry);
  const y = b.map(normalizeEntry);
  if (x.length === y.length) return x.every((v, i) => v === y[i]);
  // An empty list equals only an empty value, never "one value repeated".
  if (x.length === 0 || y.length === 0) return [...x, ...y].every((v) => v === "");
  if (x.length === 1) return y.every((v) => v === x[0]);
  if (y.length === 1) return x.every((v) => v === y[0]);
  // Two lists that each repeat one value, such as a two-nozzle printer's five columns and the U1's two.
  return x.every((v) => v === x[0]) && y.every((v) => v === x[0]);
}

/** Whether two values of one setting are equal as Snapmaker Orca treats them (the comparison the diff uses). */
export function sameSetting(a: unknown, b: unknown): boolean {
  return sameValue(entries(a), entries(b));
}

function display(list: readonly string[] | null): string | null {
  return list === null ? null : list.join(", ");
}

export function labelOf(key: string): string {
  const info = SETTINGS_CATALOG[key];
  if (!info) return key;
  // A section often has the same name as its only setting; say it once.
  const parts = [info.page, info.section, info.label].filter((p, i, all): p is string => Boolean(p) && p !== all[i + 1]);
  return parts.length > 0 && info.label ? parts.join(" > ") : key;
}

function groupOf(key: string): DiffGroupName {
  return Object.hasOwn(SETTINGS_CATALOG, key) ? SETTINGS_CATALOG[key].group : "other";
}

/** How many filament slots a project's settings describe. */
function slotCount(settings: Readonly<Record<string, unknown>>): number {
  for (const key of ["filament_colour", "filament_settings_id", "filament_type"]) {
    const value = settings[key];
    if (Array.isArray(value) && value.length > 0) return value.length;
  }
  return 1;
}

/** The entries of each filament slot for one setting, or null if the setting isn't laid out per slot. */
function splitSlots(settings: Readonly<Record<string, unknown>>, key: string, slots: number): string[][] | null {
  const value = settings[key];
  if (!Array.isArray(value)) return null;
  const list = value.map(entryText);
  if (VARIANT_KEYS.has(key)) {
    const steps = settings.filament_flow_step_size;
    if (Array.isArray(steps) && steps.length === slots) {
      const sizes = steps.map((s) => Math.max(1, Math.trunc(Number(s)) || 1));
      if (sizes.reduce((n, s) => n + s, 0) === list.length) {
        const out: string[][] = [];
        let start = 0;
        for (const size of sizes) {
          out.push(list.slice(start, start + size));
          start += size;
        }
        return out;
      }
    }
  }
  if (list.length % slots !== 0 || list.length === 0) return null;
  const per = list.length / slots;
  return Array.from({ length: slots }, (_, i) => list.slice(i * per, (i + 1) * per));
}

/** How a value compares with the reference, for the settings the above-stock choice covers. Percentages and "nil" are left alone. */
function attentionFor(key: string, sides: ReadonlyArray<readonly string[] | null>, reference: DiffOptions["reference"]): DiffAttention | undefined {
  if (!reference || !Object.hasOwn(ABOVE_STOCK_DEFAULTS, key)) return undefined;
  const numbers = (entries: readonly string[]) => entries.map((e) => (e.trim().endsWith("%") ? NaN : Number(e)));
  if (key === "filament_max_volumetric_speed") {
    // Per filament slot: the standard value, then the high-flow value where there is one.
    const over = sides.some((entries) => entries !== null && numbers(entries).some((n, i) => n > (i % 2 === 1 ? MAX_VOLUMETRIC_SPEED.highFlow : MAX_VOLUMETRIC_SPEED.standard)));
    return over ? "above-stock" : undefined;
  }
  if (!Object.hasOwn(reference.stock, key)) return undefined;
  const limit = machineLimitFor(key, reference.machine);
  const stock = numbers(entries(reference.stock[key]));
  const stockAt = (i: number) => stock[i] ?? stock[0];
  let result: DiffAttention | undefined;
  for (const side of sides) {
    if (side === null) continue;
    numbers(side).forEach((n, i) => {
      // Only values above stock count: Snapmaker's own values are never capped (its 0.20mm Standard high-flow speeds are above the U1's limit by design).
      if (!Number.isFinite(n) || !Number.isFinite(stockAt(i)) || n <= stockAt(i)) return;
      if (limit !== null && n > limit) result = "above-limit";
      else if (result === undefined) result = "above-stock";
    });
  }
  return result;
}

function rowFor(
  key: string,
  a: readonly string[] | null,
  b: readonly string[] | null,
  reference?: DiffOptions["reference"],
  firstOnly: readonly [boolean, boolean] = [false, false],
  layout?: { a?: ValueLayout; b?: ValueLayout },
): DiffRow {
  let status: DiffStatus;
  if (a !== null && b !== null) status = sameValue(a, b) ? "same" : "changed";
  else if (!Object.hasOwn(SETTINGS_CATALOG, key)) status = "unmatched";
  else status = a === null ? "only-b" : "only-a";
  const attention = attentionFor(key, [firstOnly[0] ? (a?.slice(0, 1) ?? null) : a, firstOnly[1] ? (b?.slice(0, 1) ?? null) : b], reference);
  const info = Object.hasOwn(SETTINGS_CATALOG, key) ? SETTINGS_CATALOG[key] : undefined;
  return {
    key,
    label: labelOf(key),
    a: display(a),
    b: display(b),
    status,
    ...(info?.page ? { page: info.page } : {}),
    ...(info?.page && info.section ? { section: info.section } : {}),
    ...(attention ? { attention } : {}),
    ...(layout && (layout.a || layout.b) ? { layout: { ...(layout.a ? { a: layout.a } : {}), ...(layout.b ? { b: layout.b } : {}) } } : {}),
  };
}

/** Snapmaker Orca's settings-page order, then label, then key. */
function rowOrder(x: DiffRow, y: DiffRow): number {
  const ox = Object.hasOwn(SETTINGS_CATALOG, x.key) ? (SETTINGS_CATALOG[x.key].order ?? Infinity) : Infinity;
  const oy = Object.hasOwn(SETTINGS_CATALOG, y.key) ? (SETTINGS_CATALOG[y.key].order ?? Infinity) : Infinity;
  return (ox === oy ? 0 : ox < oy ? -1 : 1) || x.label.localeCompare(y.label) || x.key.localeCompare(y.key);
}

function ownKeys(settings: Readonly<Record<string, unknown>>, side: string): string[] {
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Any2orcaError("invalid_project", `The ${side} settings aren't a settings object.`);
  }
  const keys = Object.keys(settings);
  if (keys.length > MAX_DIFF_KEYS) throw new Any2orcaError("invalid_project", `The ${side} settings have ${keys.length} entries, more than the ${MAX_DIFF_KEYS} a project can have.`);
  return keys;
}

/** Compares two sets of settings. */
export function diffSettings(a: SettingsSide, b: SettingsSide, options: DiffOptions = {}): SettingsDiff {
  const wanted = new Set<DiffGroupName>(options.groups ?? GROUP_ORDER);
  const keys = [...new Set([...ownKeys(a.settings, "first"), ...ownKeys(b.settings, "second")])].filter(
    (key) => options.includeBookkeeping || !BOOKKEEPING_KEYS.has(key),
  );
  const otherPrinter = [isOtherPrinter(a.settings), isOtherPrinter(b.settings)] as const;
  const slotsA = slotCount(a.settings);
  const slotsB = slotCount(b.settings);

  const byGroup = new Map<string, DiffGroup>();
  const groupFor = (group: DiffGroupName, slot?: number): DiffGroup => {
    const id = slot === undefined ? group : `${group}:${slot}`;
    let found = byGroup.get(id);
    if (!found) {
      found = slot === undefined ? { group, rows: [] } : { group, slot, rows: [] };
      byGroup.set(id, found);
    }
    return found;
  };

  for (const key of keys) {
    const group = groupOf(key);
    if (!wanted.has(group)) continue;
    const hasA = Object.hasOwn(a.settings, key);
    const hasB = Object.hasOwn(b.settings, key);
    if (group === "filament") {
      const split = (side: SettingsSide, has: boolean, slots: number) => (has ? splitSlots(side.settings, key, slots) : null);
      const sa = split(a, hasA, slotsA);
      const sb = split(b, hasB, slotsB);
      if ((hasA ? sa : true) && (hasB ? sb : true)) {
        const slots = Math.max(hasA ? slotsA : 0, hasB ? slotsB : 0);
        for (let i = 0; i < slots; i++) {
          const ea = sa?.[i] ?? null;
          const eb = sb?.[i] ?? null;
          const layout = { a: ea ? valueLayout(key, ea.length, a.settings, true) : undefined, b: eb ? valueLayout(key, eb.length, b.settings, true) : undefined };
          groupFor("filament", i + 1).rows.push(rowFor(key, ea, eb, options.reference, undefined, layout));
        }
        continue;
      }
    }
    const ea = hasA ? entries(a.settings[key]) : null;
    const eb = hasB ? entries(b.settings[key]) : null;
    const layout = { a: ea ? valueLayout(key, ea.length, a.settings) : undefined, b: eb ? valueLayout(key, eb.length, b.settings) : undefined };
    groupFor(group).rows.push(rowFor(key, ea, eb, options.reference, otherPrinter, layout));
  }

  const groups = [...byGroup.values()]
    .map((g) => ({ ...g, rows: g.rows.sort(rowOrder) }))
    .sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || (x.slot ?? 0) - (y.slot ?? 0));
  const identical = groups.every((g) => g.rows.every((r) => r.status === "same"));
  const shown = options.includeUnchanged ? groups : groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.status !== "same") })).filter((g) => g.rows.length > 0);

  return { format: "any2orca-diff", version: 1, aLabel: a.label, bLabel: b.label, catalog: { ...SETTINGS_CATALOG_SOURCE }, groups: shown, identical };
}
