// SPDX-License-Identifier: MIT
/**
 * Presets: a user's own tuned print settings, made from a 3MF they tuned in
 * Snapmaker Orca, applied to other files when converting.
 *
 * A preset is a base profile (the U1 tier it was tuned on) plus only the
 * print settings that differ from that tier's stock values. Converting with
 * a preset converts onto its base, then writes its values over the
 * creator's. Machine settings, G-code, filaments and the model's layout are
 * never part of a preset (see presetKeys.ts).
 *
 * Masters and presets files come from anyone (a forum post, a shared link),
 * so everything here is hostile input: keys are checked against the
 * allowlist, values against the type, limits and choices Snapmaker Orca
 * declares for the setting, and files against size and count limits, before
 * anything is used.
 */
import { z } from "zod";
import { labelOf } from "../diff/diffSettings.js";
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { machineLimitFor } from "../engine/aboveStock.js";
import { VARIANT_PROCESS_KEYS } from "../engine/applyHighFlowHotends.js";
import type { JsonRecord } from "../engine/types.js";
import { Any2orcaError } from "../errors.js";
import type { ProfileCatalog } from "../profiles.js";
import { isPresetKey, PRESET_EXCLUDED_KEYS, PRESET_KEYS } from "./presetKeys.js";

export const MAX_PRESET_NAME_LENGTH = 40;
export const MAX_PRESETS_PER_FILE = 100;
export const MAX_PRESETS_FILE_BYTES = 1024 * 1024;
const MAX_VALUE_LENGTH = 4000;
const MAX_LIST_ENTRIES = 64;

/** A setting value as Snapmaker Orca writes it: text, or a list of text for a list setting. */
export type PresetValue = string | string[];

export interface Preset {
  /** The user's name for it. Shown as plain text only; never written into a converted file. */
  name: string;
  /** The catalog profile id the changes were made on, e.g. "snapmaker-u1-0.4-0.16hq". */
  base: string;
  /** True when the master didn't name its profile and the base was matched from its nozzle and layer height. */
  baseInferred: boolean;
  /** The profile catalog the preset was made with. */
  catalog: { version: string; tracks: string };
  /** Only the print settings that differ from the base profile's stock values. */
  changes: Record<string, PresetValue>;
  /** The date it was made, YYYY-MM-DD. */
  created: string;
}

/** One setting of a preset, for showing before saving or applying. */
export interface PresetChange {
  key: string;
  /** Where Snapmaker Orca shows the setting, e.g. "Speed > Other layers speed > Outer wall". */
  label: string;
  /** The base profile's stock value (the standard entry for a setting stored per hotend type). */
  stock: string;
  yours: string;
  /** A speed or acceleration above the base profile's stock value. */
  aboveStock: boolean;
  /** Set when the value is above the U1's machine limit: the conversion caps it at this. */
  cappedAt?: number;
}

export interface ExtractedPreset {
  /** The preset, without a name: the caller asks the user for one. */
  preset: Omit<Preset, "name">;
  changes: PresetChange[];
  /** Settings the master changed that the preset leaves out, and why; and how the base was found. */
  notes: string[];
}

const VARIANT_KEYS: ReadonlySet<string> = new Set(VARIANT_PROCESS_KEYS);
const LIST_TYPES: ReadonlySet<string> = new Set(["coFloats", "coBools", "coPercents", "coFloatsOrPercents", "coInts", "coStrings", "coEnums", "coPoints"]);
const NUMBER = /^-?(?:\d{1,12}(?:\.\d{0,12})?|\.\d{1,12})$/;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
/** Text shown to people: no control characters and no line breaks. */
const plainLine = (s: string): boolean => !UNSAFE_TEXT.test(s) && !/[\n\t]/.test(s);

/** Checks one entry against the setting's type and limits; returns why it's invalid, or null. */
function entryProblem(key: string, entry: string): string | null {
  const info = SETTINGS_CATALOG[key];
  if (entry === "nil") return "has no value";
  if (entry.length > MAX_VALUE_LENGTH || UNSAFE_TEXT.test(entry)) return "isn't plain text of a sensible length";
  const type = (info.type ?? "").replace(/s$/, "");
  const numeric = (allowPercent: boolean): string | null => {
    const text = allowPercent && entry.endsWith("%") ? entry.slice(0, -1) : entry;
    if (!NUMBER.test(text)) return `isn't a number ("${entry}")`;
    const n = Number(text);
    if (info.min !== null && n < info.min) return `is below Snapmaker Orca's minimum of ${info.min} ("${entry}")`;
    if (info.max !== null && n > info.max) return `is above Snapmaker Orca's maximum of ${info.max} ("${entry}")`;
    return null;
  };
  switch (type) {
    case "coBool":
      return entry === "0" || entry === "1" ? null : `isn't on or off ("${entry}")`;
    case "coInt":
      return /^-?\d{1,12}$/.test(entry) ? numeric(false) : `isn't a whole number ("${entry}")`;
    case "coFloat":
      return numeric(false);
    case "coPercent":
    case "coFloatOrPercent":
      return numeric(true);
    case "coEnum":
      if (info.choices) return info.choices.includes(entry) ? null : `isn't one of Snapmaker Orca's choices ("${entry}")`;
      return /^[A-Za-z0-9_-]{1,64}$/.test(entry) ? null : `isn't a valid choice ("${entry}")`;
    default:
      return null;
  }
}

/**
 * The value a preset stores for a setting, from a project's raw value, or
 * why it can't be stored. A setting Snapmaker Orca keeps per hotend type
 * (`[standard, high_flow]`) stores only the standard entry.
 */
function presetValue(key: string, raw: unknown): { value: PresetValue } | { problem: string } {
  const info = SETTINGS_CATALOG[key];
  const isList = LIST_TYPES.has(info.type ?? "") && !VARIANT_KEYS.has(key);
  const source = VARIANT_KEYS.has(key) && Array.isArray(raw) ? raw[0] : raw;
  if (isList) {
    // An empty list is a real value (Snapmaker Orca writes one for "none").
    if (!Array.isArray(source) || source.length > MAX_LIST_ENTRIES || !source.every((e) => typeof e === "string")) {
      return { problem: "isn't a list of values" };
    }
    for (const entry of source) {
      const problem = entryProblem(key, entry);
      if (problem) return { problem };
    }
    return { value: [...source] };
  }
  if (typeof source !== "string") return { problem: "isn't a single value" };
  const problem = entryProblem(key, source);
  return problem ? { problem } : { value: source };
}

/** The stock value a preset value is compared with: the standard entry for a per-hotend-type setting. */
export function stockValue(key: string, stock: unknown): unknown {
  return VARIANT_KEYS.has(key) && Array.isArray(stock) ? stock[0] : stock;
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value === undefined || value === null ? "" : String(value);
}

/** Describes each change: its label, stock and new value, and whether it's above stock or above the machine limit. */
export function describeChanges(changes: Readonly<Record<string, PresetValue>>, stock: JsonRecord, machine: JsonRecord): PresetChange[] {
  return Object.keys(changes)
    .sort()
    .map((key) => {
      const value = changes[key];
      const base = stockValue(key, stock[key]);
      const change: PresetChange = { key, label: labelOf(key), stock: text(base), yours: text(value), aboveStock: false };
      const limit = machineLimitFor(key, machine);
      if (limit !== null && typeof value === "string" && !value.endsWith("%")) {
        const n = Number(value);
        const stockN = Number(text(base));
        if (Number.isFinite(n) && Number.isFinite(stockN) && n > stockN) change.aboveStock = true;
        if (Number.isFinite(n) && n > limit) change.cappedAt = limit;
      }
      return change;
    });
}

/** The changes a preset can apply on a base profile: allowed keys the profile has, with valid values. Notes say what was left out. */
export function checkedChanges(changes: Readonly<Record<string, unknown>>, stock: JsonRecord, notes: string[]): Record<string, PresetValue> {
  const out: Record<string, PresetValue> = {};
  for (const key of Object.keys(changes).sort()) {
    if (!isPresetKey(key)) {
      const reason = Object.hasOwn(PRESET_EXCLUDED_KEYS, key) ? PRESET_EXCLUDED_KEYS[key] : "isn't a print setting a preset can change";
      notes.push(`Left out ${labelOf(key)}: it ${reason}.`);
      continue;
    }
    if (!Object.hasOwn(stock, key)) {
      notes.push(`Left out ${labelOf(key)}: the base profile doesn't have this setting.`);
      continue;
    }
    const checked = presetValue(key, changes[key]);
    if ("problem" in checked) {
      notes.push(`Left out ${labelOf(key)}: the value ${checked.problem}.`);
      continue;
    }
    Object.defineProperty(out, key, { value: checked.value, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** A preset ready to apply: its profile (a retired base is replaced by its successor) and the changes that are valid for it. */
export interface ResolvedPreset {
  profileId: string;
  changes: Record<string, PresetValue>;
  described: PresetChange[];
  notes: string[];
}

/**
 * Checks a preset against the current catalog before applying it: the base
 * must exist (a retired one converts with its successor), and every change
 * must still be an allowed setting with a valid value. Anything else is left
 * out with a note, never applied.
 */
export async function resolvePreset(preset: Preset, catalog: ProfileCatalog): Promise<ResolvedPreset> {
  const parsed = PresetSchema.safeParse(preset);
  if (!parsed.success) throw new Any2orcaError("invalid_preset", `This preset can't be used: ${describeIssues(parsed.error)}`);
  const notes: string[] = [];
  let profileId = parsed.data.base;
  const retired = catalog.retiredSuccessor(profileId);
  if (retired) {
    notes.push(`The preset's base profile has been retired; it's applied on ${retired.displayName} instead.`);
    profileId = retired.successorId;
  }
  if (!catalog.get(profileId)) throw new Any2orcaError("invalid_preset", `The preset's base profile "${profileId}" isn't in the profile catalog.`);
  const loaded = await catalog.load(profileId);
  const stock = loaded.convertProfile.profile.baselineProjectSettings;
  const changes = checkedChanges(parsed.data.changes, stock, notes);
  return { profileId, changes, described: describeChanges(changes, stock, loaded.convertProfile.printer.machineSettingsConfig), notes };
}

/**
 * The preset with some settings put back to the base profile's stock value,
 * which for a preset means leaving them out (a preset only holds what
 * differs from stock). For "use stock" choices on values above stock.
 */
export function withoutChanges<T extends Pick<Preset, "changes">>(preset: T, keys: readonly string[]): T {
  const drop = new Set(keys);
  const changes: Record<string, PresetValue> = {};
  for (const key of Object.keys(preset.changes)) {
    if (!drop.has(key)) Object.defineProperty(changes, key, { value: preset.changes[key], enumerable: true, writable: true, configurable: true });
  }
  return { ...preset, changes };
}

/** A fingerprint of a preset's changes (SHA-256 of the sorted changes as JSON), for the output stamp. */
export async function presetFingerprint(changes: Readonly<Record<string, PresetValue>>): Promise<string> {
  const canonical = JSON.stringify(Object.keys(changes).sort().map((key) => [key, changes[key]]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The file format, shared by the web app's export, the CLI's saved presets and imports.

const PresetValueSchema = z.union([z.string().max(MAX_VALUE_LENGTH), z.array(z.string().max(MAX_VALUE_LENGTH)).max(MAX_LIST_ENTRIES)]);

export const PresetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_PRESET_NAME_LENGTH)
      .refine((s) => !UNSAFE_TEXT.test(s) && !/[\n\t]/.test(s), "must be plain text on one line"),
    base: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "must be a profile id"),
    baseInferred: z.boolean(),
    catalog: z
      .object({
        version: z.string().max(64).refine(plainLine, "must be plain text on one line"),
        tracks: z.string().max(200).refine(plainLine, "must be plain text on one line"),
      })
      .strict(),
    changes: z
      .record(
        z
          .string()
          .regex(/^[a-z0-9_]{1,100}$/)
          .refine((k) => !FORBIDDEN_KEYS.has(k), "isn't a setting"),
        PresetValueSchema,
      )
      .refine((c) => Object.keys(c).length <= PRESET_KEYS.length, "has more changes than there are print settings"),
    created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const PresetFileSchema = z
  .object({
    format: z.literal("any2orca-presets"),
    version: z.literal(1),
    presets: z.array(PresetSchema).max(MAX_PRESETS_PER_FILE),
  })
  .strict();

export interface PresetFile {
  format: "any2orca-presets";
  version: 1;
  presets: Preset[];
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Rejects keys that could reach an object's prototype, and nesting deeper than the format has. */
function assertPlainJson(value: unknown, depth: number): void {
  if (depth > 6) throw new Any2orcaError("invalid_preset", "This presets file is nested deeper than the format allows.");
  if (Array.isArray(value)) {
    for (const item of value) assertPlainJson(item, depth + 1);
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Any2orcaError("invalid_preset", `This presets file has a key named "${key}", which no preset has.`);
      assertPlainJson((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

/** Reads a presets file (any2orca-presets.json). Throws `invalid_preset` for anything that isn't one, or is over a limit. */
export function parsePresetFile(input: string | Uint8Array): PresetFile {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input).length : input.length;
  if (bytes > MAX_PRESETS_FILE_BYTES) throw new Any2orcaError("invalid_preset", `This presets file is larger than the ${MAX_PRESETS_FILE_BYTES / 1024 / 1024} MB a presets file can be.`);
  let raw: unknown;
  try {
    raw = JSON.parse(typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input));
  } catch {
    throw new Any2orcaError("invalid_preset", "This isn't a presets file: it isn't valid JSON.");
  }
  assertPlainJson(raw, 0);
  const parsed = PresetFileSchema.safeParse(raw);
  if (!parsed.success) throw new Any2orcaError("invalid_preset", `This isn't a valid presets file: ${describeIssues(parsed.error)}`);
  const names = new Set<string>();
  for (const preset of parsed.data.presets) {
    const key = preset.name.toLowerCase();
    if (names.has(key)) throw new Any2orcaError("invalid_preset", `This presets file has two presets named "${preset.name}".`);
    names.add(key);
  }
  return parsed.data;
}

/** Writes presets in the file format, ready to save as any2orca-presets.json. */
export function serializePresets(presets: readonly Preset[]): string {
  if (presets.length > MAX_PRESETS_PER_FILE) throw new Any2orcaError("invalid_preset", `A presets file holds at most ${MAX_PRESETS_PER_FILE} presets.`);
  // Same error contract as the readers: an invalid preset is an Any2orcaError with a stable code, never a raw schema error.
  const checked = presets.map((p) => {
    const parsed = PresetSchema.safeParse(p);
    if (!parsed.success) throw new Any2orcaError("invalid_preset", `This preset can't be saved: ${describeIssues(parsed.error)}`);
    return parsed.data;
  });
  const file: PresetFile = { format: "any2orca-presets", version: 1, presets: checked };
  return `${JSON.stringify(file, null, 2)}\n`;
}
