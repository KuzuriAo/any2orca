// SPDX-License-Identifier: MIT
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { diffSettings, type DiffGroupName, type DiffRow, type SettingsDiff } from "../../diff/diffSettings.js";
import { diffReference, presetDiffSide } from "../../diff/reference.js";
import { valueLayoutNotes } from "../../diff/valueLayout.js";
import type { Preset } from "../../presets/preset.js";
import type { ProfileCatalog } from "../../profiles.js";
import { Project } from "../../project.js";
import { formatTable } from "../table.js";

/** The largest source file these commands read (the web app's hand-off limit). */
const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_CELL = 48;

export interface DiffCommandOptions {
  files: string[];
  /** Compare the one file with Snapmaker's stock profile: true for the profile auto-matching picks, or a profile id. */
  againstStock?: true | string;
  /** Compare the one file with a preset as it converts: its base profile's stock settings with its changes. */
  againstPreset?: Preset;
  groups?: DiffGroupName[];
  json: boolean;
  all: boolean;
  /** Row order within each group: values needing attention first (default), Snapmaker Orca's page order, or by status. */
  sort?: DiffSort;
  catalog: ProfileCatalog;
}

export type DiffSort = "attention" | "setting" | "status";

function openFile(path: string): Project {
  const lower = path.toLowerCase();
  if (!lower.endsWith(".3mf")) throw new Error(`${path} isn't a .3mf project; diff compares one project file with another (a .zip of several isn't supported).`);
  const size = statSync(path).size;
  if (size > MAX_INPUT_BYTES) throw new Error(`${path} is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB, the most diff reads.`);
  return Project.open(new Uint8Array(readFileSync(path)));
}

/** One table cell: G-code and other long text is summarized, so the table stays readable. */
function cell(value: string | null): string {
  if (value === null) return "(not set)";
  if (value.includes("\n")) return `(${value.split("\n").length} lines)`;
  const flat = value.replace(/\s+/g, " ");
  return flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 3)}...` : flat;
}

const STATUS_TEXT: Record<DiffRow["status"], string> = {
  same: "same",
  changed: "changed",
  "only-a": "only in source (A)",
  "only-b": "only in target (B)",
  unmatched: "not a Snapmaker Orca setting",
};

function groupTitle(group: DiffGroupName, slot?: number): string {
  if (group === "filament") return slot === undefined ? "Filament settings" : `Filament ${slot}`;
  if (group === "other") return "Other (not in Snapmaker Orca's settings)";
  return `${group === "print" ? "Print" : "Machine"} settings`;
}

const ATTENTION_TEXT: Record<NonNullable<DiffRow["attention"]>, string> = {
  "above-limit": "above the U1's limit (capped)",
  "above-stock": "above stock",
};
const ATTENTION_RANK = { "above-limit": 0, "above-stock": 1 } as const;
const STATUS_RANK: Record<DiffRow["status"], number> = { changed: 0, "only-a": 1, "only-b": 2, unmatched: 3, same: 4 };

/** Rows in the chosen order. The diff's own order (Snapmaker Orca's page order) breaks ties. */
function ordered(rows: readonly DiffRow[], sort: DiffSort): DiffRow[] {
  const position = new Map(rows.map((r, i) => [r, i]));
  const rank = (r: DiffRow) => (sort === "attention" ? (r.attention ? ATTENTION_RANK[r.attention] : 2) : sort === "status" ? STATUS_RANK[r.status] : 0);
  return [...rows].sort((x, y) => rank(x) - rank(y) || (position.get(x) ?? 0) - (position.get(y) ?? 0));
}

/** The text report: a heading per group, then setting, first value, second value, status, and a note on values above stock or the U1's limits. */
export function formatDiff(diff: SettingsDiff, sort: DiffSort = "attention"): string {
  const lines = [`Source (A): ${diff.aLabel}`, `Target (B): ${diff.bLabel}`, ""];
  if (diff.groups.length === 0) {
    lines.push(diff.identical ? "No differences." : "No differences in the settings compared.");
    return lines.join("\n");
  }
  for (const g of diff.groups) {
    lines.push(`${groupTitle(g.group, g.slot)} (${g.rows.length})`);
    for (const note of valueLayoutNotes(g.rows)) lines.push(`  ${note}`);
    lines.push(
      formatTable(ordered(g.rows, sort).map((r) => [`  ${r.label === r.key ? r.key : `${r.label} [${r.key}]`}`, cell(r.a), cell(r.b), STATUS_TEXT[r.status], r.attention ? ATTENTION_TEXT[r.attention] : ""])),
    );
    lines.push("");
  }
  const changed = diff.groups.reduce((n, g) => n + g.rows.filter((r) => r.status !== "same").length, 0);
  lines.push(`${changed} difference${changed === 1 ? "" : "s"}. Use --json for full values (including G-code).`);
  return lines.join("\n");
}

/** `any2orca diff`: returns the exit code (0 no differences, 1 differences). Errors throw and exit 2. */
export async function runDiff(options: DiffCommandOptions, out: (line: string) => void): Promise<number> {
  let diff: SettingsDiff;
  if (options.againstStock !== undefined && options.againstPreset) {
    throw new Error("Use --against-stock or --against-preset, not both.");
  }
  if (options.againstPreset) {
    if (options.files.length !== 1) throw new Error("--against-preset compares one .3mf with a preset; give exactly one file.");
    const [file] = options.files;
    const project = openFile(file);
    const side = await presetDiffSide(options.againstPreset, options.catalog);
    diff = diffSettings(
      { label: basename(file), settings: project.settings() },
      { label: side.label, settings: side.settings },
      // A preset holds print settings only, so that's what's compared unless asked otherwise.
      { groups: options.groups ?? ["print"], includeUnchanged: options.all, reference: await diffReference(options.catalog, side.profileId) },
    );
  } else if (options.againstStock !== undefined) {
    if (options.files.length !== 1) throw new Error("--against-stock compares one .3mf with Snapmaker's stock profile; give exactly one file.");
    const [file] = options.files;
    const project = openFile(file);
    const profileId = options.againstStock === true ? (await project.matchProfile(options.catalog)).profileId : options.againstStock;
    const loaded = await options.catalog.load(profileId);
    diff = diffSettings(
      { label: basename(file), settings: project.settings() },
      { label: `Snapmaker's stock ${loaded.summary.displayName} profile`, settings: loaded.convertProfile.profile.baselineProjectSettings },
      // Filament settings come from the creator, not the stock profile, so they're only compared when asked for.
      { groups: options.groups ?? ["print", "machine"], includeUnchanged: options.all, reference: await diffReference(options.catalog, profileId) },
    );
  } else {
    if (options.files.length !== 2) throw new Error("diff compares two .3mf files (or one with --against-stock or --against-preset).");
    const [first, second] = options.files;
    const a = openFile(first);
    // Values are measured against the profile the first file would convert with.
    const reference = await diffReference(options.catalog, (await a.matchProfile(options.catalog)).profileId);
    diff = diffSettings(
      { label: basename(first), settings: a.settings() },
      { label: basename(second), settings: openFile(second).settings() },
      { ...(options.groups ? { groups: options.groups } : {}), includeUnchanged: options.all, reference },
    );
  }
  out(options.json ? JSON.stringify(diff, null, 2) : formatDiff(diff, options.sort));
  return diff.identical ? 0 : 1;
}
