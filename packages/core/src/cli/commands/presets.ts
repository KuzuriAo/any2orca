// SPDX-License-Identifier: MIT
/**
 * `any2orca presets`: save, list, show, remove, export and import presets,
 * and find the one `convert --preset` names.
 *
 * Saved presets live in the CLI's config folder, under presets/, one file
 * per preset in the same any2orca-presets format the web app exports. The
 * file name is a slug of the preset's name; the name itself stays inside the
 * file. A preset only enters this folder through `add` or `import`, which
 * list any speeds above stock and need a choice for them (keep them all, put
 * them all back to stock, or keep only some), so a saved preset is one the
 * user has already agreed to.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Any2orcaError } from "../../errors.js";
import type { ProfileCatalog } from "../../profiles.js";
import { Project } from "../../project.js";
import { extractPreset } from "../../presets/extractPreset.js";
import {
  MAX_PRESETS_FILE_BYTES,
  MAX_PRESETS_PER_FILE,
  parsePresetFile,
  PresetSchema,
  resolvePreset,
  serializePresets,
  withoutChanges,
  type Preset,
  type PresetChange,
} from "../../presets/preset.js";
import { configDir, type Env } from "../config.js";
import { formatTable } from "../table.js";

/** The largest source file these commands read (the web app's hand-off limit). */
const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_CELL = 40;

export function presetsDir(env: Env): string {
  return join(configDir(env), "presets");
}

/** A file name for a preset name: lowercase letters, digits and dashes. */
export function presetSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!slug) throw new Error(`A preset name needs at least one letter or digit, got "${name.slice(0, 40)}".`);
  return slug;
}

interface SavedPreset {
  preset: Preset;
  path: string;
}

/** Every saved preset. A file that isn't a valid preset is reported and skipped, never used. */
export function loadSavedPresets(env: Env, warn: (line: string) => void = () => {}): SavedPreset[] {
  const dir = presetsDir(env);
  if (!existsSync(dir)) return [];
  const saved: SavedPreset[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort().slice(0, MAX_PRESETS_PER_FILE * 2)) {
    const path = join(dir, file);
    try {
      if (statSync(path).size > MAX_PRESETS_FILE_BYTES) throw new Error("too large");
      const parsed = parsePresetFile(new Uint8Array(readFileSync(path)));
      if (parsed.presets.length !== 1) throw new Error("holds more than one preset");
      saved.push({ preset: parsed.presets[0], path });
    } catch (err) {
      warn(`Skipping ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return saved;
}

function findSaved(env: Env, name: string): SavedPreset | undefined {
  const wanted = name.trim().toLowerCase();
  return loadSavedPresets(env).find((s) => s.preset.name.toLowerCase() === wanted);
}

/** Writes atomically (temp file + rename), so a crash never leaves a half-written preset. */
function savePreset(env: Env, preset: Preset, replace: boolean): string {
  const dir = presetsDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const existing = findSaved(env, preset.name);
  const path = join(dir, `${presetSlug(preset.name)}.json`);
  if (existing && !replace) throw new Error(`A preset named "${existing.preset.name}" already exists. Add --force to replace it.`);
  if (!existing && existsSync(path)) throw new Error(`A preset with a name too similar to "${preset.name}" already exists (${path}). Choose another name.`);
  if (loadSavedPresets(env).length >= MAX_PRESETS_PER_FILE && !existing) throw new Error(`You can save at most ${MAX_PRESETS_PER_FILE} presets. Remove one first.`);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, serializePresets([preset]), { mode: 0o600 });
  renameSync(temp, existing?.path ?? path);
  return existing?.path ?? path;
}

function cell(value: string): string {
  if (value.includes("\n")) return `(${value.split("\n").length} lines)`;
  return value.length > MAX_CELL ? `${value.slice(0, MAX_CELL - 3)}...` : value;
}

export function formatChanges(changes: readonly PresetChange[]): string {
  if (changes.length === 0) return "  No changes: converts exactly like choosing the base profile.";
  return formatTable([
    ["  SETTING", "STOCK", "YOURS", ""],
    ...changes.map((c) => [`  ${c.label === c.key ? c.key : `${c.label} [${c.key}]`}`, cell(c.stock), cell(c.yours), c.cappedAt !== undefined ? `above stock, capped at ${c.cappedAt}` : c.aboveStock ? "above stock" : ""]),
  ]);
}

function aboveStockText(above: readonly PresetChange[], verb: "save" | "use"): string {
  return [
    `${above.length === 1 ? "This setting is" : "These settings are"} faster than Snapmaker's stock profile:`,
    ...above.map((c) => `  ${c.label} [${c.key}]: ${c.yours} (stock ${c.stock}${c.cappedAt !== undefined ? `; the U1's limit caps it at ${c.cappedAt}` : ""})`),
    "The U1's machine limits still apply, but faster isn't safe for every filament or model. Check them with a test print.",
    `To ${verb} the preset, choose: --above-stock keep (keep them all), --above-stock stock (use Snapmaker's stock value for all), or --keep <setting,...> (keep only these, stock for the rest).`,
  ].join("\n");
}

/** What to do with a preset's values above stock: keep them all, use stock for all, or keep only the listed settings. */
export interface AboveStockPresetChoice {
  mode?: "keep" | "stock";
  keep?: readonly string[];
}

/**
 * Applies the choice to a preset: "use stock" leaves a setting out, since a
 * preset only holds what differs from stock. Throws, listing the values and
 * the flags, when the preset has values above stock and nothing was chosen.
 */
function decideAboveStock<T extends Preset>(preset: T, described: readonly PresetChange[], choice: AboveStockPresetChoice, verb: "save" | "use"): { preset: T; reverted: PresetChange[] } {
  const above = described.filter((c) => c.aboveStock);
  if (above.length === 0) return { preset, reverted: [] };
  if (choice.keep) {
    const unknown = choice.keep.filter((key) => !above.some((c) => c.key === key));
    if (unknown.length > 0) {
      throw new Error(`--keep: ${unknown.map((k) => k.slice(0, 60)).join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} above stock in this preset. Above stock: ${above.map((c) => c.key).join(", ")}.`);
    }
    const reverted = above.filter((c) => !choice.keep?.includes(c.key));
    return { preset: withoutChanges(preset, reverted.map((c) => c.key)), reverted };
  }
  if (choice.mode === "keep") return { preset, reverted: [] };
  if (choice.mode === "stock") return { preset: withoutChanges(preset, above.map((c) => c.key)), reverted: above };
  throw new Error(aboveStockText(above, verb));
}

function revertedText(reverted: readonly PresetChange[]): string {
  return `  Snapmaker's stock value for: ${reverted.map((c) => `${c.label} (${c.stock})`).join(", ")}`;
}

function openMaster(path: string): Project {
  if (!path.toLowerCase().endsWith(".3mf")) throw new Error(`${path} isn't a .3mf project; a preset is made from one project you tuned in Snapmaker Orca.`);
  if (statSync(path).size > MAX_INPUT_BYTES) throw new Error(`${path} is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB, the most a preset can be made from.`);
  return Project.open(new Uint8Array(readFileSync(path)));
}

export interface PresetsCommandOptions {
  env: Env;
  catalog: ProfileCatalog;
  aboveStock: AboveStockPresetChoice;
  force: boolean;
  json: boolean;
  out?: string;
}

/** `presets add <name> <master.3mf>` */
export async function runPresetsAdd(name: string, masterPath: string, options: PresetsCommandOptions, out: (line: string) => void): Promise<number> {
  const extracted = await extractPreset(openMaster(masterPath), { profiles: options.catalog });
  const checked = PresetSchema.safeParse({ ...extracted.preset, name });
  if (!checked.success) throw new Error(`A preset name must be 1 to 40 characters of plain text on one line.`);
  const preset = checked.data;
  const base = options.catalog.get(preset.base);
  out(`${preset.name}: ${extracted.changes.length} change${extracted.changes.length === 1 ? "" : "s"} on ${base?.displayName ?? preset.base}${preset.baseInferred ? " (matched from nozzle and layer height)" : ""}`);
  out(formatChanges(extracted.changes));
  for (const note of extracted.notes) out(`  note: ${note}`);
  let decided: { preset: Preset; reverted: PresetChange[] };
  try {
    decided = decideAboveStock(preset, extracted.changes, options.aboveStock, "save");
  } catch (err) {
    throw new Error(`Not saved.\n${err instanceof Error ? err.message : String(err)}`);
  }
  if (decided.reverted.length > 0) out(revertedText(decided.reverted));
  out(`Saved to ${savePreset(options.env, decided.preset, options.force)}`);
  return 0;
}

/** `presets list` */
export function runPresetsList(options: PresetsCommandOptions, out: (line: string) => void, err: (line: string) => void): number {
  const saved = loadSavedPresets(options.env, err);
  if (options.json) {
    out(serializePresets(saved.map((s) => s.preset)).trimEnd());
    return 0;
  }
  if (saved.length === 0) {
    out('No saved presets. Make one with "any2orca presets add <name> <tuned.3mf>".');
    return 0;
  }
  out(formatTable([["NAME", "BASE PROFILE", "CHANGES", "CREATED"], ...saved.map((s) => [s.preset.name, s.preset.base, String(Object.keys(s.preset.changes).length), s.preset.created])]));
  return 0;
}

/** `presets show <name>` */
export async function runPresetsShow(name: string, options: PresetsCommandOptions, out: (line: string) => void): Promise<number> {
  const saved = findSaved(options.env, name);
  if (!saved) throw new Error(`No saved preset named "${name.slice(0, 40)}". Run "any2orca presets list".`);
  const resolved = await resolvePreset(saved.preset, options.catalog);
  if (options.json) {
    out(JSON.stringify({ preset: saved.preset, changes: resolved.described, notes: resolved.notes }, null, 2));
    return 0;
  }
  out(`${saved.preset.name}: on ${options.catalog.get(resolved.profileId)?.displayName ?? resolved.profileId}, made ${saved.preset.created} with profiles ${saved.preset.catalog.version}`);
  out(formatChanges(resolved.described));
  for (const note of resolved.notes) out(`  note: ${note}`);
  return 0;
}

/** `presets remove <name>` */
export function runPresetsRemove(name: string, options: PresetsCommandOptions, out: (line: string) => void): number {
  const saved = findSaved(options.env, name);
  if (!saved) throw new Error(`No saved preset named "${name.slice(0, 40)}". Run "any2orca presets list".`);
  rmSync(saved.path);
  out(`Removed ${saved.preset.name}.`);
  return 0;
}

/** `presets export [names...] [--out <file>]` */
export function runPresetsExport(names: string[], options: PresetsCommandOptions, out: (line: string) => void): number {
  const saved = loadSavedPresets(options.env);
  const chosen = names.length === 0 ? saved : names.map((n) => saved.find((s) => s.preset.name.toLowerCase() === n.trim().toLowerCase()) ?? n);
  const missing = chosen.filter((c): c is string => typeof c === "string");
  if (missing.length > 0) throw new Error(`No saved preset named ${missing.map((m) => `"${m.slice(0, 40)}"`).join(", ")}. Run "any2orca presets list".`);
  const text = serializePresets((chosen as SavedPreset[]).map((s) => s.preset));
  if (options.out) {
    if (existsSync(options.out) && !options.force) throw new Error(`${options.out} already exists. Add --force to replace it.`);
    writeFileSync(options.out, text);
    out(`Exported ${chosen.length} preset${chosen.length === 1 ? "" : "s"} to ${options.out}`);
  } else {
    out(text.trimEnd());
  }
  return 0;
}

/** `presets import <file>`: saves each preset in the file. One that can't be saved is skipped with the reason. */
export async function runPresetsImport(file: string, options: PresetsCommandOptions, out: (line: string) => void): Promise<number> {
  if (statSync(file).size > MAX_PRESETS_FILE_BYTES) throw new Any2orcaError("invalid_preset", `${file} is larger than the ${MAX_PRESETS_FILE_BYTES / 1024 / 1024} MB a presets file can be.`);
  const parsed = parsePresetFile(new Uint8Array(readFileSync(file)));
  let added = 0;
  let skipped = 0;
  for (const preset of parsed.presets) {
    try {
      const resolved = await resolvePreset(preset, options.catalog);
      const decided = decideAboveStock(preset, resolved.described, options.aboveStock, "save");
      savePreset(options.env, decided.preset, options.force);
      if (decided.reverted.length > 0) out(`  ${preset.name}: ${revertedText(decided.reverted).trim()}`);
      for (const note of resolved.notes) out(`  ${preset.name}: note: ${note}`);
      out(`Imported ${preset.name}`);
      added++;
    } catch (err) {
      out(`Skipped ${preset.name}: ${err instanceof Error ? err.message : String(err)}`);
      skipped++;
    }
  }
  out(`${added} imported, ${skipped} skipped.`);
  return skipped > 0 ? 1 : 0;
}

/**
 * The preset `convert --preset` names: a saved preset's name, or a presets
 * file holding exactly one preset. A preset from a file hasn't been agreed
 * to, so speeds above stock need a choice (--above-stock or --keep).
 */
export async function presetForConvert(nameOrPath: string, env: Env, catalog: ProfileCatalog, choice: AboveStockPresetChoice): Promise<Preset> {
  const { preset, saved } = namedPreset(nameOrPath, env, "--preset");
  if (saved) return preset;
  const resolved = await resolvePreset(preset, catalog);
  return decideAboveStock(preset, resolved.described, choice, "use").preset;
}

/**
 * The preset `diff --against-preset` names, found the same way as for
 * convert. A comparison only shows the preset's values, so a presets file
 * needs no choice about speeds above stock.
 */
export function presetForDiff(nameOrPath: string, env: Env): Preset {
  return namedPreset(nameOrPath, env, "--against-preset").preset;
}

/** A saved preset by name, or the one preset in a presets file at that path. */
function namedPreset(nameOrPath: string, env: Env, flag: string): { preset: Preset; saved: boolean } {
  const saved = findSaved(env, nameOrPath);
  if (saved) return { preset: saved.preset, saved: true };
  if (!nameOrPath.toLowerCase().endsWith(".json") || !existsSync(nameOrPath)) {
    throw new Error(`No saved preset named "${nameOrPath.slice(0, 40)}", and no presets file at that path. Run "any2orca presets list".`);
  }
  if (statSync(nameOrPath).size > MAX_PRESETS_FILE_BYTES) throw new Any2orcaError("invalid_preset", `${nameOrPath} is larger than a presets file can be.`);
  const parsed = parsePresetFile(new Uint8Array(readFileSync(nameOrPath)));
  if (parsed.presets.length !== 1) throw new Error(`${nameOrPath} holds ${parsed.presets.length} presets; ${flag} takes a file with exactly one. Import it with "any2orca presets import" and name one instead.`);
  return { preset: parsed.presets[0], saved: false };
}
