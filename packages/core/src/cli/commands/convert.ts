// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Any2orcaError } from "../../errors.js";
import type { MatchSource } from "../../schema.js";
import { formatWhatChanged } from "../../explain/whatChanged.js";
import { openProject, unwrapBundle, type ConvertReport } from "../../project.js";
import type { ProfileCatalog } from "../../profiles.js";
import type { Preset } from "../../presets/preset.js";
import type { AboveStockChoice } from "../../engine/aboveStock.js";
import { archiveOriginal } from "../archiveMove.js";
import { describeFsError, isSamePath } from "../sameFile.js";
import type { Logger } from "../logger.js";
import { computeFingerprint, loadStateFile, saveStateFile, type StateFile } from "../watchState.js";
import type { StatsReporter } from "../stats.js";

export interface ConvertOptions {
  catalog: ProfileCatalog;
  profile?: string;
  /** Convert onto this preset's base profile with its settings (--preset). */
  preset?: Preset;
  /** --use-stock / --keep-higher: the choice for values above stock. */
  aboveStock?: AboveStockChoice;
  filamentCompliance?: "generic" | "snapmaker";
  /** --high-flow: all four toolheads have the Liber High Flow Hotend. */
  /** All toolheads have the Liber hotend (true), or exactly these ones, T1 first. */
  highFlow?: boolean | boolean[];
  hardenedNozzle?: boolean;
  /** Leave the version note (Metadata/any2orca.json) out of the converted file. */
  noStamp?: boolean;
  /** --max-unpacked: the most a project may unpack to, in bytes (default 2 GB). */
  maxUnpackedBytes?: number;
  /** --explain: print what the conversion changed, grouped by why. */
  explain?: boolean;
  /** --explain-json: also write it, with every settings difference, as <output>.what-changed.json. */
  explainJson?: boolean;
  outDir?: string;
  archiveDir?: string;
  suffix: string;
  dryRun: boolean;
  verbose: boolean;
  skipExisting: boolean;
  /** True under `convert --watch`; only affects whether state tracking is on (see {@link runConvert}). */
  watch: boolean;
  logger: Logger;
  stats?: StatsReporter;
}

export interface ConvertRunSummary {
  converted: number;
  failed: number;
}

/** An error as the CLI prints it. A project over the size limit gets the CLI's own way to raise it, not the library's. */
function errorText(err: unknown): string {
  if (err instanceof Any2orcaError && err.code === "too_large") {
    return `${err.message.split(". ")[0].replace(/\.$/, "")}. Raise the limit with --max-unpacked, for example --max-unpacked 4GB; it needs about twice that much memory.`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * The output path for one converted entry: the entry's own name (a
 * bundle's nested name, or the input file name) with `suffix` added, next
 * to the input unless `--out-dir` is set.
 */
export function computeOutputPath(entryName: string, defaultDir: string, suffix: string, outDir: string | undefined): string {
  const dir = resolveWorkDir(defaultDir, outDir);
  const base = basename(entryName, extname(entryName));
  return join(dir, `${base}${suffix}.3mf`);
}

/** Where outputs and the state file go: `--out-dir` if set, otherwise alongside the input. */
function resolveWorkDir(defaultDir: string, outDir: string | undefined): string {
  return outDir ? resolve(outDir) : resolve(defaultDir);
}

/**
 * --skip-existing's check. Opt-in on purpose: an output is a re-derivable
 * build artifact, so overwriting is the right default; this is for
 * resuming an interrupted batch.
 */
export function shouldSkipExisting(outPath: string, skipExisting: boolean): boolean {
  return skipExisting && existsSync(outPath);
}

/**
 * A line for the two match outcomes worth printing: no match at all
 * (fell back to the default) and closest-but-not-exact. A confident match
 * gets nothing here.
 */
export function matchWarningLine(matchSource: MatchSource, profileIdLabel: string): string | null {
  if (matchSource === "default-fallback") {
    return (
      `    WARNING: no confident profile match found for this file (neither its layer height nor its quality name, such as Standard or Fine, matched a U1 profile), ` +
      `so it falls back to ${profileIdLabel}. Consider passing --profile <id> explicitly (see "any2orca profiles").`
    );
  }
  if (matchSource === "auto-nearest") {
    return `    note: ${profileIdLabel} is the closest available layer height, not an exact match.`;
  }
  return null;
}

function logReport(report: ConvertReport, verbose: boolean, logger: Logger): void {
  if (report.profileMatch) {
    const line = matchWarningLine(report.profileMatch.matchSource, report.profile.id);
    if (line) logger.log(line);
    else if (verbose) logger.log(`    matched profile: ${report.profile.id} (${report.profileMatch.matchSource})`);
  } else if (verbose) {
    logger.log(`    profile: ${report.profile.id}`);
  }
  if (report.preset) {
    const above = report.preset.changes.filter((c) => c.aboveStock).length;
    logger.log(`    preset: ${report.preset.changes.length} setting${report.preset.changes.length === 1 ? "" : "s"} set${above > 0 ? `, ${above} above stock` : ""}`);
    if (verbose) for (const c of report.preset.changes) logger.log(`    preset: ${c.key} ${c.stock} -> ${c.yours}${c.aboveStock ? " (above stock)" : ""}`);
  }
  const fallback = report.filamentComplianceFallback ?? [];
  if (fallback.length > 0) {
    logger.log(
      `    note: Snapmaker makes no preset for ${fallback.join(", ")} at this nozzle size, so ${fallback.length === 1 ? "it uses" : "those use"} Generic.`,
    );
  }
  const unchanged = report.filamentComplianceUnchanged ?? [];
  if (unchanged.length > 0) {
    logger.log(
      `    note: no Snapmaker or Generic preset fits ${unchanged.join(", ")} at this nozzle size, so ${unchanged.length === 1 ? "its name stays" : "those names stay"} as the creator had ${unchanged.length === 1 ? "it" : "them"}.`,
    );
  }
  for (const w of report.warnings) logger.log(`    warning: ${w}`);
  if (verbose) for (const line of report.log) logger.log(`    log: ${line}`);
}

/**
 * Whether retrying this exact file could give a different result. A
 * conversion is deterministic, so a problem with the file itself is
 * permanent; a filesystem hiccup (disk full, file locked) or an unreadable
 * profile catalog is not.
 */
export function isPermanentFailure(err: unknown): boolean {
  if (err instanceof Any2orcaError) return err.code === "invalid_file" || err.code === "too_large" || err.code === "invalid_project" || err.code === "profile_not_found" || err.code === "invalid_preset";
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^E[A-Z]+$/.test(code)) return false;
  return true;
}

async function convertOne(
  entryName: string,
  bytes: Uint8Array,
  defaultDir: string,
  originalInputPath: string,
  options: ConvertOptions,
  written: Map<string, string>,
): Promise<void> {
  const { logger } = options;
  const outPath = computeOutputPath(entryName, defaultDir, options.suffix, options.outDir);

  // Compared by file identity too, so a case-only difference or a symlink to the input is caught.
  if (resolve(outPath) === resolve(originalInputPath) || isSamePath(outPath, originalInputPath)) {
    throw new Error(
      `Refusing to run: the output path for "${entryName}" (${outPath}) is the input file itself. Use --out-dir to write somewhere else, or a non-empty --suffix.`,
    );
  }
  for (const [earlier, from] of written) {
    if (resolve(earlier) === resolve(outPath) || isSamePath(earlier, outPath)) {
      throw new Error(`Not converted: its output, ${outPath}, was already written in this run from ${from}. Give the inputs different names or convert them separately.`);
    }
  }
  if (shouldSkipExisting(outPath, options.skipExisting)) {
    logger.log(`${options.dryRun ? "[dry-run] " : ""}${entryName}: skipped (already exists at ${outPath})`);
    return;
  }

  const project = openProject(bytes, { maxUnpackedBytes: options.maxUnpackedBytes });

  if (options.dryRun) {
    logger.log(`[dry-run] ${entryName}`);
    if (options.preset) {
      logger.log(`    profile: ${options.preset.base} (from preset ${options.preset.name}, ${Object.keys(options.preset.changes).length} changes)`);
    } else if (options.profile) {
      logger.log(`    profile: ${options.profile}`);
    } else {
      const choice = await project.matchProfile(options.catalog);
      const shown = options.catalog.get(choice.profileId)?.displayName ?? choice.profileId;
      logger.log(`    predicted profile: ${shown} (${choice.profileId})`);
      const line = matchWarningLine(choice.profileMatch.matchSource, choice.profileId);
      if (line) logger.log(line);
    }
    logger.log(`    would write: ${outPath}`);
    written.set(outPath, originalInputPath);
    return;
  }

  const { output, report } = await project.convert({
    profiles: options.catalog,
    ...(options.profile ? { profileId: options.profile } : {}),
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.aboveStock ? { aboveStock: options.aboveStock } : {}),
    ...(options.filamentCompliance ? { filamentComplianceMode: options.filamentCompliance } : {}),
    ...(options.highFlow ? { highFlowHotends: options.highFlow } : {}),
    ...(options.hardenedNozzle ? { hardenedNozzles: true } : {}),
    ...(options.noStamp ? { stamp: false } : {}),
    ...(options.explainJson ? { explain: true } : {}),
  });
  // The result line comes first, so in a batch each file's notes sit under its own name.
  const replaced = existsSync(outPath);
  writeFileSync(outPath, output);
  written.set(outPath, originalInputPath);
  logger.log(`${entryName} -> ${outPath}${replaced ? " (replaced)" : ""}`);
  logReport(report, options.verbose, logger);
  if (options.explain) for (const line of formatWhatChanged(report.whatChanged, { cliHints: true }).split("\n")) logger.log(`    ${line}`.trimEnd());
  if (options.explainJson) {
    const jsonPath = outPath.replace(/\.3mf$/i, ".what-changed.json");
    writeFileSync(jsonPath, `${JSON.stringify(report.whatChanged, null, 2)}\n`);
    logger.log(`    what changed: ${jsonPath}`);
  }
  await options.stats?.afterConversion(report, project.inspect());
}

/** State tracking is on for repeated or resumable runs (--watch, --archive-dir, --skip-existing), never for --dry-run. */
function isStateTrackingActive(options: ConvertOptions): boolean {
  return !options.dryRun && (options.watch || Boolean(options.archiveDir) || options.skipExisting);
}

/**
 * Converts each input in turn. One bad file (or one bad entry in a bundle)
 * doesn't stop the rest. With state tracking on, records each input's
 * outcome so an unchanged file isn't redone, and with --archive-dir moves
 * a fully converted input out of the way.
 */
export async function runConvert(inputPaths: string[], options: ConvertOptions): Promise<ConvertRunSummary> {
  const { logger } = options;
  const tracking = isStateTrackingActive(options);
  const summary: ConvertRunSummary = { converted: 0, failed: 0 };
  const written = new Map<string, string>();

  for (const inputPath of inputPaths) {
    const name = basename(inputPath);
    const defaultDir = dirname(resolve(inputPath));
    const workDir = resolveWorkDir(defaultDir, options.outDir);

    if (tracking) {
      let fingerprint: string;
      try {
        fingerprint = computeFingerprint(inputPath);
      } catch (err) {
        logger.error(`Could not read ${name}: ${describeFsError(err)}`);
        summary.failed++;
        continue;
      }
      const record = loadStateFile(workDir)[name];
      if (record && record.fingerprint === fingerprint && record.outcome !== "failed-once") {
        if (record.outcome === "succeeded") logger.log(`${name}: already converted (unchanged since last run), skipping`);
        else logger.log(`${name}: skipping, it failed last time with an error retrying won't fix (unchanged since). Fix or replace the file to retry.`);
        continue;
      }
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(inputPath));
    } catch (err) {
      logger.error(`Error reading ${name}: ${describeFsError(err)}`);
      summary.failed++;
      continue;
    }
    const entries = unwrapBundle(bytes, { maxUnpackedBytes: options.maxUnpackedBytes }) ?? [{ name, bytes }];

    let anyFailed = false;
    let allFailuresPermanent = true;
    for (const entry of entries) {
      try {
        await convertOne(entry.name, entry.bytes, defaultDir, inputPath, options, written);
        summary.converted++;
      } catch (err) {
        anyFailed = true;
        summary.failed++;
        if (!isPermanentFailure(err)) allFailuresPermanent = false;
        logger.error(`Error converting ${entry.name}: ${errorText(err)}`);
      }
    }

    if (tracking) recordOutcome(workDir, name, inputPath, anyFailed, allFailuresPermanent);

    if (!anyFailed && options.archiveDir && !options.dryRun) {
      try {
        logger.log(`${name}: archived to ${archiveOriginal(inputPath, options.archiveDir)}`);
      } catch (err) {
        logger.error(`Could not archive ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return summary;
}

/**
 * Records "succeeded", or for a failure retrying won't fix, "failed-once"
 * the first time and "permanently-failed" when the same unchanged file
 * fails again. The one retry is for a file still being copied in: some
 * copies set the final size and time before every byte has arrived, so a
 * half-written file can look settled. A transient failure records nothing.
 */
function recordOutcome(workDir: string, name: string, inputPath: string, anyFailed: boolean, allFailuresPermanent: boolean): void {
  if (anyFailed && !allFailuresPermanent) return;
  const state: StateFile = loadStateFile(workDir);
  const fingerprint = computeFingerprint(inputPath);
  const failedBefore = state[name]?.outcome === "failed-once" && state[name]?.fingerprint === fingerprint;
  state[name] = { fingerprint, outcome: !anyFailed ? "succeeded" : failedBefore ? "permanently-failed" : "failed-once" };
  saveStateFile(workDir, state);
}

const WATCH_POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function isConvertibleFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return ext === ".3mf" || ext === ".zip";
}

/** Per-file state a watch session keeps between polls. Exported for tests. */
export interface WatchState {
  /** The fingerprint last seen per file name, to tell when a file has stopped changing. */
  lastFingerprint: Map<string, string>;
  /** "name:fingerprint" already handed to runConvert this session; an edited file gets a new key. */
  reported: Set<string>;
}

export function createWatchState(): WatchState {
  return { lastFingerprint: new Map(), reported: new Set() };
}

/**
 * One poll over `folder`: converts each file whose fingerprint is unchanged
 * since the previous poll (so a file still being copied in isn't read
 * half-written) and that hasn't been handled this session.
 */
export async function watchPollOnce(folder: string, options: ConvertOptions, state: WatchState): Promise<void> {
  for (const name of readdirSync(folder).filter(isConvertibleFile)) {
    const fullPath = join(folder, name);
    let fingerprint: string;
    try {
      fingerprint = computeFingerprint(fullPath);
    } catch {
      continue; // vanished between readdir and stat; reconsider next poll
    }
    const key = `${name}:${fingerprint}`;
    if (state.reported.has(key)) continue;
    const previous = state.lastFingerprint.get(name);
    state.lastFingerprint.set(name, fingerprint);
    if (previous !== fingerprint) continue; // still being written, or just appeared
    state.reported.add(key);
    try {
      await runConvert([fullPath], options);
    } catch (err) {
      options.logger.error(`Error converting ${name}: ${errorText(err)}`);
    }
    // Failed once: let it settle again and retry, in case it was still being written.
    if (loadStateFile(resolveWorkDir(folder, options.outDir))[name]?.outcome === "failed-once") {
      state.reported.delete(key);
      state.lastFingerprint.delete(name);
    }
  }
}

/** Watches `folder` and converts each new .3mf/.zip as it settles, until interrupted. */
export async function runWatch(folder: string, options: ConvertOptions): Promise<never> {
  const state = createWatchState();
  options.logger.log(`Watching ${folder} for new .3mf/.zip files (Ctrl+C to stop)...`);
  for (;;) {
    await watchPollOnce(folder, options, state);
    await sleep(WATCH_POLL_INTERVAL_MS);
  }
}
