// SPDX-License-Identifier: MIT
/**
 * "What changed?": the converter's own record of what it did to a file's
 * settings, grouped by why. The same record backs the web app's panel, the
 * CLI's `convert --explain` and the JSON export, so all three list the same
 * changes in the same groups and order.
 *
 * The pipeline reports each step to a {@link ChangeTracker}, which compares
 * the settings before and after the step and keeps the settings whose value
 * really changed (by the settings diff's rules, so a value only rewritten in
 * another layout isn't a change). A setting changed by several steps is
 * listed under the last one, with the value from just before it. Settings
 * the creator's file had but the converter didn't use are added at the end,
 * with the reason they kept Snapmaker's stock value.
 */
import { BOOKKEEPING_KEYS, labelOf, sameSetting, type SettingsDiff } from "../diff/diffSettings.js";
import { SETTINGS_CATALOG, SETTINGS_CATALOG_SOURCE } from "../diff/settingsCatalog.js";
import { valueLayout, valueLayoutNotes, type ValueLayout } from "../diff/valueLayout.js";
import type { JsonRecord } from "../engine/types.js";

export type ChangeReason = "creator" | "stock" | "capped" | "firmware" | "layout" | "yours";

export interface ChangeItem {
  /** The setting's key, or absent for an item that isn't one setting (an object moved, a summary). */
  key?: string;
  /** Where Snapmaker Orca shows the setting, e.g. "Strength > Walls > Wall loops", or a sentence. */
  label: string;
  /** The value before the change, as text (list entries joined with ", "), or null if there was none. */
  before: string | null;
  /** The value in the converted file, or null if it has none. */
  after: string | null;
  /** Why, in a few words, when the group's description doesn't say it all. */
  note?: string;
  /**
   * Set when the user can choose differently for this value:
   * "stock" to use Snapmaker's stock value instead, "keep" to keep the
   * creator's value instead. Convert again with `aboveStock` to apply it.
   */
  alternative?: "keep" | "stock";
  /** What the before and after values are, where they're a pair or per-nozzle list (see {@link ValueLayout}); absent for single values. */
  layout?: { before?: ValueLayout; after?: ValueLayout };
}

export interface ChangeGroup {
  reason: ChangeReason;
  title: string;
  /** What "before" and "after" mean in this group. */
  description: string;
  items: ChangeItem[];
}

export interface WhatChanged {
  format: "any2orca-what-changed";
  version: 1;
  /** The profile the file was converted with, and how it was chosen. */
  profile: { id: string; displayName: string; chosenBy: "matched" | "you" | "preset" };
  /** The Snapmaker Orca release whose labels and settings the record uses. */
  catalog: { tag: string; commit: string };
  /** In this order: creator, stock, capped, firmware, layout, yours. Empty groups are left out. */
  groups: ChangeGroup[];
  /** Every difference between the original and converted settings, when asked for (`explain: true`). */
  diff?: SettingsDiff;
}

const GROUPS: ReadonlyArray<Omit<ChangeGroup, "items">> = [
  { reason: "creator", title: "From the creator's file", description: "Settings the creator changed, carried into the converted file. Before: Snapmaker's stock value. After: the creator's." },
  { reason: "stock", title: "Kept at Snapmaker's stock value", description: "Settings the creator's file has with another value, which the converted file doesn't use. Before: the creator's file. After: Snapmaker's stock value." },
  { reason: "capped", title: "Capped for the U1", description: "Values above what the U1 allows, lowered to its limit. Before: the value it would have had. After: the limit." },
  { reason: "firmware", title: "Set for the U1's firmware and Snapmaker Orca", description: "Values Snapmaker Orca or the U1's firmware reads differently, rewritten so they mean the same thing." },
  { reason: "layout", title: "Layout", description: "How the model sits on the U1's bed." },
  { reason: "yours", title: "Your choices", description: "Changes from the options you picked. Before: the value without your choice. After: with it." },
];

/** Text for one value: list entries joined with ", ", and a list repeating one value (one per toolhead) as that value. */
export function valueText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const entries = value.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    return entries.length > 1 && entries.every((e) => e === entries[0]) ? entries[0] : entries.join(", ");
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** How many entries {@link valueText} shows for a value. */
function shownCount(value: unknown): number {
  if (!Array.isArray(value) || value.length < 2) return 1;
  const first = JSON.stringify(value[0]);
  return value.every((v) => JSON.stringify(v) === first) ? 1 : value.length;
}

/** The item's `layout` field, from the settings each side's value was taken from. */
function layoutOf(key: string, before: unknown, beforeSettings: JsonRecord, after: unknown, afterSettings: JsonRecord): Pick<ChangeItem, "layout"> {
  const b = valueLayout(key, shownCount(before), beforeSettings);
  const a = valueLayout(key, shownCount(after), afterSettings);
  return b || a ? { layout: { ...(b ? { before: b } : {}), ...(a ? { after: a } : {}) } } : {};
}

interface Recorded {
  reason: ChangeReason;
  before: unknown;
  note?: string;
}

/** Decides a step's reason for one changed setting, or null to leave the change out of the record. */
export type Classify = (key: string, before: unknown, after: unknown) => { reason: ChangeReason; note?: string } | null;

export class ChangeTracker {
  private readonly recorded = new Map<string, Recorded>();
  private readonly extra = new Map<ChangeReason, ChangeItem[]>();

  /** Records what changed between `before` and `after` (whole settings objects), as `classify` decides. */
  compare(before: JsonRecord, after: JsonRecord, classify: Classify): void {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (BOOKKEEPING_KEYS.has(key)) continue;
      const a = before[key];
      const b = after[key];
      if (a !== undefined && b !== undefined && sameSetting(a, b)) continue;
      if (a === undefined && b === undefined) continue;
      const decided = classify(key, a, b);
      if (decided) this.recorded.set(key, { reason: decided.reason, before: a, ...(decided.note ? { note: decided.note } : {}) });
    }
  }

  /** Runs a step that changes `settings` in place, recording what it changed. */
  step(settings: JsonRecord, classify: Classify, run: () => void): void {
    const before = { ...settings };
    run();
    this.compare(before, settings, classify);
  }

  /** Adds an item that isn't one setting (an object moved, a summary line). */
  add(reason: ChangeReason, item: ChangeItem): void {
    const list = this.extra.get(reason) ?? [];
    list.push(item);
    this.extra.set(reason, list);
  }

  /**
   * The record, given the source's settings, the profile's stock settings
   * and the converted settings. `stockNote` says why a setting the creator's
   * file has kept the stock value. Printer settings (the machine group:
   * G-code, retraction, limits, bed) always come from the U1, so they're
   * one summary line rather than one line each; the full diff lists them.
   */
  build(
    source: JsonRecord,
    stock: JsonRecord,
    output: JsonRecord,
    stockNote: (key: string) => string,
    alternative: (key: string, reason: ChangeReason) => "keep" | "stock" | undefined = () => undefined,
  ): Map<ChangeReason, ChangeItem[]> {
    const groups = new Map<ChangeReason, ChangeItem[]>();
    const push = (reason: ChangeReason, item: ChangeItem) => {
      const list = groups.get(reason) ?? [];
      list.push(item);
      groups.set(reason, list);
    };
    for (const [key, r] of this.recorded) {
      const after = output[key];
      if (r.before !== undefined && after !== undefined && sameSetting(r.before, after)) continue;
      const alt = alternative(key, r.reason);
      // Recorded steps all start from Snapmaker's stock settings, so both values are in the U1's layout.
      push(r.reason, {
        key,
        label: labelOf(key),
        before: valueText(r.before),
        after: valueText(after),
        ...(r.note ? { note: r.note } : {}),
        ...(alt ? { alternative: alt } : {}),
        ...layoutOf(key, r.before, output, after, output),
      });
    }
    let printerSettings = 0;
    for (const key of Object.keys(source)) {
      if (this.recorded.has(key) || BOOKKEEPING_KEYS.has(key)) continue;
      const info = Object.hasOwn(SETTINGS_CATALOG, key) ? SETTINGS_CATALOG[key] : undefined;
      // A filament's G-code is printer code, so it's counted with the printer settings, not summarized as the creator's filament.
      const gcode = key.endsWith("_gcode");
      if (!info || (info.group === "filament" && !gcode) || !Object.hasOwn(stock, key) || !Object.hasOwn(output, key)) continue;
      if (sameSetting(source[key], stock[key]) || !sameSetting(output[key], stock[key])) continue;
      if (info.group === "machine" || gcode) {
        printerSettings++;
        continue;
      }
      const alt = alternative(key, "stock");
      push("stock", {
        key,
        label: labelOf(key),
        before: valueText(source[key]),
        after: valueText(output[key]),
        note: stockNote(key),
        ...(alt ? { alternative: alt } : {}),
        ...layoutOf(key, source[key], source, output[key], output),
      });
    }
    if (printerSettings > 0) {
      push("stock", {
        label: `${printerSettings} printer setting${printerSettings === 1 ? "" : "s"} (G-code, retraction, speed limits, bed size and others) use the U1's own`,
        before: null,
        after: null,
        note: "the full list is in all differences",
      });
    }
    for (const [reason, items] of this.extra) for (const item of items) push(reason, item);
    for (const items of groups.values()) items.sort((x, y) => (x.key === undefined ? 1 : 0) - (y.key === undefined ? 1 : 0) || x.label.localeCompare(y.label) || (x.key ?? "").localeCompare(y.key ?? ""));
    return groups;
  }
}

/** Puts the groups in their fixed order with their titles, leaving out empty ones. */
export function toWhatChanged(profile: WhatChanged["profile"], groups: ReadonlyMap<ChangeReason, ChangeItem[]>, diff?: SettingsDiff): WhatChanged {
  return {
    format: "any2orca-what-changed",
    version: 1,
    profile,
    catalog: { ...SETTINGS_CATALOG_SOURCE },
    groups: GROUPS.filter((g) => (groups.get(g.reason)?.length ?? 0) > 0).map((g) => ({ ...g, items: groups.get(g.reason) ?? [] })),
    ...(diff ? { diff } : {}),
  };
}

const MAX_CELL = 60;

function cell(value: string | null): string {
  if (value === null) return "(not set)";
  if (value.includes("\n")) return `(${value.split("\n").length} lines of G-code)`;
  const flat = value.replace(/\s+/g, " ");
  return flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 3)}...` : flat;
}

/**
 * The record as plain text: what `convert --explain` prints and the web
 * app's "Copy as text" copies. `cliHints` adds, to each value that can be
 * chosen differently, the `convert` flag that does it.
 */
export function formatWhatChanged(record: WhatChanged, options: { cliHints?: boolean } = {}): string {
  const how = { matched: "matched to the file", you: "chosen by you", preset: "from your preset" }[record.profile.chosenBy];
  const lines = [`Converted with ${record.profile.displayName} (${how}).`];
  if (record.groups.length === 0) lines.push("", "Nothing else changed.");
  for (const group of record.groups) {
    lines.push("", `${group.title} (${group.items.length})`);
    for (const note of valueLayoutNotes(group.items)) lines.push(`  ${note}`);
    for (const item of group.items) {
      const name = item.key && item.label !== item.key ? `${item.label} [${item.key}]` : item.label;
      const values = item.before === null && item.after === null ? "" : `: ${cell(item.before)} -> ${cell(item.after)}`;
      const hint =
        options.cliHints && item.alternative && item.key
          ? item.alternative === "stock"
            ? ` [for stock: --use-stock ${item.key}]`
            : ` [to keep it: --keep-higher ${item.key}]`
          : "";
      lines.push(`  ${name}${values}${item.note ? ` (${item.note})` : ""}${hint}`);
    }
  }
  return lines.join("\n");
}
