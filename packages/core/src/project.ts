// SPDX-License-Identifier: MIT
/**
 * The two-step API: open a file once, inspect it, convert it (as many
 * times as needed, e.g. with a different profile picked in a UI).
 *
 * `convert()` runs in the caller's own process: read the 3MF, match a
 * profile, merge settings, recenter objects, write the output. The request
 * and response pass through JSON, so numbers serialize the same way every
 * time (e.g. -0 becomes 0) and output is reproducible byte for byte.
 */
import { applyConvertResponse, prepareConvertRequest, type ParsedBambuProject } from "./archive/zip.js";
import { unwrapIfBundle, type BundleEntry } from "./archive/unwrapBundle.js";
import { detectNozzleDiameter } from "./engine/detectNozzleDiameter.js";
import { parseTierName } from "./engine/parseTierName.js";
import { pickProfile } from "./engine/pickProfile.js";
import { runConvertPipeline } from "./engine/runConvertPipeline.js";
import { diffSettings } from "./diff/diffSettings.js";
import { Any2orcaError } from "./errors.js";
import { toWhatChanged, type WhatChanged } from "./explain/whatChanged.js";
import { inspectProject, type Inspection } from "./inspect.js";
import { loadCatalog, ProfileCatalog, type ProfileSource, type ProfileSummary, type RetiredProfile } from "./profiles.js";
import {
  ConvertRequestSchema,
  ConvertResponseSchema,
  HighFlowHotendsSchema,
  type ConvertRequest,
  type ConvertResponse,
  type ProfileMatch,
  type Shifts,
} from "./schema.js";
import { resolveAboveStockChoice, type AboveStockChoice } from "./engine/aboveStock.js";
import { presetFingerprint, resolvePreset, type Preset, type PresetChange } from "./presets/preset.js";
import { encodeStamp, STAMP_PATH, type OutputStamp } from "./stamp.js";
import { plainText } from "./plainText.js";
import { VERSION } from "./version.js";

/** Options for reading a .3mf. */
export interface OpenOptions {
  /**
   * The most the project may unpack to, in bytes: 2 GB by default, which a browser tab can hold, and at most
   * 16 GB. Raise it in Node for a larger project; a project over the limit throws `too_large`.
   */
  maxUnpackedBytes?: number;
}

export interface ConvertOptions {
  /** Where profiles come from. Pass the same catalog for every conversion so profiles load once. */
  profiles: ProfileSource | ProfileCatalog;
  /**
   * The Snapmaker Orca release to convert for, e.g. "2.4.0": its profiles,
   * its stock values and the `Application` line the file carries. Pick the
   * release the user has installed; Snapmaker Orca's command line refuses a
   * value an older release doesn't accept. Default: the newest release the
   * catalog holds. `ProfileCatalog.releases()` lists them; one it doesn't
   * hold throws {@link Any2orcaError} `release_not_found`.
   */
  snapmakerOrcaVersion?: string;
  /** Use this profile instead of matching one. A retired id converts with its successor, with a warning. */
  profileId?: string;
  /**
   * Convert onto the preset's base profile and write its print settings over
   * the creator's. Can't be combined with `profileId`. Speeds above the U1's
   * machine limits are still capped; check `report.preset.changes` for
   * values above stock and show them to the user.
   */
  preset?: Preset;
  /**
   * For speeds, accelerations and filament max volumetric speed above
   * Snapmaker's stock values: settings to keep at the creator's value
   * (accelerations and travel speed above stock, uncapped max volumetric
   * speed) and settings to set to Snapmaker's stock value (print speeds).
   * The U1's machine limits still cap everything. Each "What changed?" item
   * that can be chosen differently has an `alternative`. Default: none.
   */
  aboveStock?: AboveStockChoice;
  /**
   * Which toolheads have the Liber High Flow Hotend: `true` for all, or one
   * entry per toolhead, T1 first (the U1 has four), e.g. `[true, false, false, false]`.
   * Ignored, with a warning, where the nozzle has no high-flow option.
   */
  highFlowHotends?: boolean | readonly boolean[];
  /**
   * The U1's nozzles are hardened steel rather than the stock stainless
   * steel. Changes the 0.4 nozzle profile only (Snapmaker makes the other
   * sizes only in hardened steel). Snapmaker Orca uses it to warn when a
   * filament is too abrasive for the nozzle. Default false.
   */
  hardenedNozzles?: boolean;
  /** Relabel filament identity to Generic or Snapmaker presets (identity only, never tuning). */
  filamentComplianceMode?: "generic" | "snapmaker";
  /** Add the output stamp (Metadata/any2orca.json). Default true. */
  stamp?: boolean;
  /**
   * Also put every difference between the original and converted settings
   * in `report.whatChanged.diff` (for "What changed?" > all differences, and
   * its export). The grouped record is always in the report. Default false.
   */
  explain?: boolean;
  /** Called as the conversion moves through its steps, for a progress display. */
  onProgress?: (stage: ConvertStage) => void;
}

export type ConvertStage = "matching" | "loading-profile" | "merging" | "writing";

export interface ConvertReport {
  /** The profile the file was converted with. */
  profile: ProfileSummary;
  /** How the profile was matched; absent when `profileId` was given. */
  profileMatch?: ProfileMatch;
  /** Set when `profileId` named a retired profile and its successor was used. */
  retiredProfile?: RetiredProfile;
  /** Notes worth showing the user, cleaned up for display. */
  warnings: string[];
  /** Every note the conversion produced, including routine ones, for logs and bug reports. */
  log: string[];
  /** Product lines that use Generic under `filamentComplianceMode: "snapmaker"`, because Snapmaker makes no preset for them at this nozzle size. */
  filamentComplianceFallback?: string[];
  /** Product lines (or materials) whose names stayed as the creator had them under `filamentComplianceMode`, because no Snapmaker or Generic preset fits. */
  filamentComplianceUnchanged?: string[];
  /** How far each object was moved, by object id. */
  shifts: Shifts;
  plates: number;
  objects: number;
  filamentSlots: number;
  /** The stamp written into the output, or null if `stamp: false`. */
  stamp: OutputStamp | null;
  /** What the conversion changed, grouped by why. */
  whatChanged: WhatChanged;
  /** Set when a preset was used: the settings it set (with values above stock marked) and anything it left out. */
  preset?: { base: string; changes: PresetChange[]; notes: string[] };
}

export interface ConvertResult {
  /** The converted .3mf. */
  output: Uint8Array;
  report: ConvertReport;
}

export interface ProfileChoice {
  profileId: string;
  profileMatch: ProfileMatch;
  /** Keep the source file's own layer height (auto-matched to a tier that isn't an exact layer height match). */
  carrySourceLayerHeight: boolean;
  /** Why the match may not be what the file asked for (an unusable layer height or a nozzle size with no U1 profile), as sentences. */
  notes: string[];
}

function numericLayerHeight(projectSettings: Record<string, unknown>): number | null {
  const raw = projectSettings.layer_height;
  const value = typeof raw === "string" ? Number(raw.trim()) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function rawNozzleDiameter(projectSettings: Record<string, unknown>): number | null {
  const raw = projectSettings.nozzle_diameter;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value = typeof first === "string" ? Number(first.trim()) : typeof first === "number" ? first : NaN;
  return Number.isFinite(value) ? value : null;
}

/**
 * Picks a profile for a file's settings, the same way every UI should (never
 * re-implement this): the source's own tier name first (from its
 * print_settings_id, e.g. "Extra Fine"), then the nearest layer height for
 * its nozzle size, then the catalog default.
 */
export async function matchProfile(projectSettings: Record<string, unknown>, profiles: ProfileSource | ProfileCatalog): Promise<ProfileChoice> {
  const catalog = await loadCatalog(profiles);
  const detectedDiameter = detectNozzleDiameter(projectSettings);
  const sourceLayerHeight = numericLayerHeight(projectSettings);
  const printSettingsId = projectSettings.print_settings_id;
  const picked = detectedDiameter
    ? pickProfile(catalog.list({ nozzleDiameter: detectedDiameter }), {
        layerHeight: sourceLayerHeight,
        tierName: typeof printSettingsId === "string" ? parseTierName(printSettingsId) : null,
      })
    : null;
  const profileId = picked?.profileId ?? catalog.index.defaultProfileId;
  const notes: string[] = [];
  const sourceNozzle = rawNozzleDiameter(projectSettings);
  if (sourceNozzle === null) {
    notes.push("the source file doesn't give a usable nozzle size, so the default profile is used");
  } else if (detectedDiameter && Math.abs(sourceNozzle - Number(detectedDiameter)) > 1e-6) {
    notes.push(`the source file is set up for a ${sourceNozzle}mm nozzle, which has no U1 profile; the ${detectedDiameter}mm profile is used`);
  }
  if (Object.hasOwn(projectSettings, "layer_height") && sourceLayerHeight === null) {
    notes.push(`the source file's layer height (${plainText(String(projectSettings.layer_height)).slice(0, 40)}) isn't a usable number, so it isn't used to choose the profile`);
  }
  return {
    profileId,
    profileMatch: {
      profileId,
      nozzleDiameter: detectedDiameter ?? "",
      exact: picked?.exact ?? false,
      matchedByTierName: picked?.matchedByTierName ?? false,
      matchSource: picked ? (picked.matchedByTierName ? "auto-tier-name" : picked.exact ? "auto-exact" : "auto-nearest") : "default-fallback",
    },
    carrySourceLayerHeight: Boolean(picked && !picked.exact && sourceLayerHeight !== null),
    notes,
  };
}

/**
 * Same cleanup every UI applies before showing warnings: drop routine
 * bookkeeping lines, strip the internal "WARN" prefix and internal file
 * names.
 */
export function cleanWarnings(warnings: readonly string[]): string[] {
  return warnings
    .map((w) => w.trim())
    .filter((w) => {
      if (!w) return false;
      if (w.includes("SKIP filament_colour: list length mismatch")) return false;
      if (w.includes("left unchanged")) return false;
      if (w.includes("ignored") && w.includes("trailing non-JSON")) return false;
      return true;
    })
    .map((w) =>
      w
        .replace(/^WARN:\s*/i, "")
        .replace(/^WARN\s+/i, "")
        .replace(/\s+in\s+model_settings\.config\.?/i, "")
        .replace(/\s+in\s+3D\/3dmodel\.model\.?/i, "")
        .replace(/\s+in\s+[A-Za-z0-9_./-]+\.(config|model|xml)\.?/i, "")
        .replace(/\.$/, ""),
    )
    // Warnings can quote names from the file; they're prose for people, so they never carry control characters.
    .map(plainText);
}

/** JSON round trip, as the request and response took over HTTP. */
function viaJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

const BOOLEAN_OPTIONS = ["hardenedNozzles", "stamp", "explain"] as const;

/**
 * Checks what a caller passed before anything uses it. These are programming
 * mistakes rather than problems with a file, so they're a TypeError with a
 * sentence (the worker forwards whatever a page posts, so this is where they're caught).
 */
function checkConvertOptions(options: ConvertOptions | undefined): void {
  const o = (options ?? {}) as unknown as Record<string, unknown>;
  const profiles = o.profiles as { readIndex?: unknown; readProfile?: unknown } | undefined;
  if (!(profiles instanceof ProfileCatalog) && (typeof profiles !== "object" || profiles === null || typeof profiles.readIndex !== "function" || typeof profiles.readProfile !== "function")) {
    throw new TypeError("convert() needs a `profiles` option: a ProfileSource or a ProfileCatalog.");
  }
  if (o.filamentComplianceMode !== undefined && o.filamentComplianceMode !== "generic" && o.filamentComplianceMode !== "snapmaker") {
    throw new TypeError('The `filamentComplianceMode` option must be "generic" or "snapmaker", or left out.');
  }
  for (const key of BOOLEAN_OPTIONS) {
    if (o[key] !== undefined && typeof o[key] !== "boolean") throw new TypeError(`The \`${key}\` option must be true or false.`);
  }
  if (o.profileId !== undefined && typeof o.profileId !== "string") throw new TypeError("The `profileId` option must be a string.");
  if (o.snapmakerOrcaVersion !== undefined && typeof o.snapmakerOrcaVersion !== "string") {
    throw new TypeError('The `snapmakerOrcaVersion` option must be a version string, for example "2.4.0", or left out.');
  }
  const hf = o.highFlowHotends;
  // A list's length and entries are checked where it's read (normalizeHighFlowOption).
  if (hf !== undefined && typeof hf !== "boolean" && !Array.isArray(hf)) {
    throw new TypeError("The `highFlowHotends` option must be true, false or a list of true/false, one per toolhead.");
  }
  const above = o.aboveStock as { keep?: unknown; stock?: unknown } | undefined;
  const stringList = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string"));
  if (above !== undefined && (typeof above !== "object" || above === null || !stringList(above.keep) || !stringList(above.stock))) {
    throw new TypeError("The `aboveStock` option must be { keep?: string[], stock?: string[] }.");
  }
  if (o.onProgress !== undefined && typeof o.onProgress !== "function") throw new TypeError("The `onProgress` option must be a function.");
}

function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** An opened source file. Reading it again is the expensive part, so keep one per file. */
export class Project {
  private readonly parsed: ParsedBambuProject;
  private readonly request: ConvertRequest;

  private constructor(parsed: ParsedBambuProject, request: ConvertRequest) {
    this.parsed = parsed;
    this.request = request;
  }

  /** Reads a .3mf. Throws {@link Any2orcaError} (`invalid_file`, `too_large` or `invalid_project`) if it can't be used. */
  static open(bytes: Uint8Array, options: OpenOptions = {}): Project {
    let parsed: ParsedBambuProject;
    try {
      parsed = prepareConvertRequest(bytes, options.maxUnpackedBytes);
    } catch (err) {
      if (err instanceof Any2orcaError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      // The zip reader's own errors ("invalid zip data", "unexpected EOF") mean a damaged or partial download.
      const damaged = /invalid zip data|unexpected EOF|invalid (block type|length|distance)|unknown compression/i.test(reason);
      const text = damaged ? "it isn't a complete zip archive (a .3mf is one). It may be damaged or only partly downloaded; download it again." : reason;
      throw new Any2orcaError("invalid_file", `This file can't be read as a 3MF project: ${text}`, {
        cause: err,
      });
    }
    const checked = ConvertRequestSchema.safeParse(viaJson(parsed.request));
    if (!checked.success) {
      throw new Any2orcaError("invalid_project", `This project's settings can't be converted: ${describeIssues(checked.error.issues)}`);
    }
    return new Project(parsed, checked.data);
  }

  /** The project's own settings (Metadata/project_settings.config), as a copy: for a settings diff. */
  settings(): Record<string, unknown> {
    return structuredClone(this.request.projectSettings);
  }

  inspect(): Inspection {
    return inspectProject(this.request.projectSettings, this.request.objects, this.parsed.warnings, this.parsed.unpackedBytes);
  }

  /** The profile auto-matching would pick for this file. */
  matchProfile(profiles: ProfileSource | ProfileCatalog): Promise<ProfileChoice> {
    return matchProfile(this.request.projectSettings, profiles);
  }

  async convert(options: ConvertOptions): Promise<ConvertResult> {
    checkConvertOptions(options);
    const progress = options.onProgress ?? (() => {});
    progress("matching");
    const top = await loadCatalog(options.profiles);
    const catalog = options.snapmakerOrcaVersion === undefined ? top : await top.forRelease(options.snapmakerOrcaVersion);
    const routeWarnings: string[] = [];

    let profileId: string;
    let profileMatch: ProfileMatch | undefined;
    let carrySourceLayerHeight = false;
    let retiredProfile: RetiredProfile | undefined;
    if (options.preset && options.profileId) {
      throw new Any2orcaError("invalid_preset", "A preset sets its own profile, so it can't be combined with a profile id.");
    }
    const preset = options.preset ? await resolvePreset(options.preset, catalog) : null;
    const aboveStock = resolveAboveStockChoice(options.aboveStock);
    if (preset) {
      profileId = preset.profileId;
      routeWarnings.push(...preset.notes.map((note) => `  WARN: ${note}`));
    } else if (options.profileId) {
      profileId = options.profileId;
      retiredProfile = catalog.retiredSuccessor(profileId);
      if (retiredProfile) {
        routeWarnings.push(
          `  WARN: profile "${profileId}" (${retiredProfile.displayName}) has been retired; converted with "${retiredProfile.successorId}" instead. Run "any2orca profiles" for the current list.`,
        );
        profileId = retiredProfile.successorId;
      }
    } else {
      const choice = await matchProfile(this.request.projectSettings, catalog);
      profileId = choice.profileId;
      profileMatch = choice.profileMatch;
      carrySourceLayerHeight = choice.carrySourceLayerHeight;
      routeWarnings.push(...choice.notes.map((note) => `  WARN: ${note}`));
    }
    progress("loading-profile");
    const loaded = await catalog.load(profileId);
    progress("merging");
    if (preset) {
      const sourceNozzle = detectNozzleDiameter(this.request.projectSettings);
      if (sourceNozzle && sourceNozzle !== loaded.summary.nozzleDiameter) {
        routeWarnings.push(`  WARN: converted with your ${loaded.summary.nozzleDiameter}mm nozzle preset; the original project was set up for a ${sourceNozzle}mm nozzle.`);
      }
    }

    const highFlowHotends = normalizeHighFlowOption(options.highFlowHotends);
    const request: ConvertRequest = {
      ...this.request,
      ...(options.filamentComplianceMode ? { filamentComplianceMode: options.filamentComplianceMode } : {}),
      ...(highFlowHotends !== false ? { highFlowHotends } : {}),
      ...(options.hardenedNozzles === true ? { hardenedNozzles: true } : {}),
    };
    const pipeline = runConvertPipeline(loaded.convertProfile, request, catalog.index.slicer.application, {
      carrySourceLayerHeight,
      ...(preset ? { presetChanges: preset.changes } : {}),
      ...(aboveStock.keep.size + aboveStock.stock.size > 0 ? { aboveStock } : {}),
    });
    const checked = ConvertResponseSchema.safeParse(
      viaJson({
        ...pipeline.response,
        ...(routeWarnings.length > 0 ? { warnings: [...routeWarnings, ...(pipeline.response.warnings ?? [])] } : {}),
        ...(profileMatch ? { profileMatch } : {}),
      }),
    );
    // Numbers that don't survive JSON (an object placed absurdly far away, say) end up here.
    if (!checked.success) {
      throw new Any2orcaError("invalid_project", `This project can't be converted: ${describeIssues(checked.error.issues)}.`);
    }
    const response: ConvertResponse = checked.data;

    const stamp: OutputStamp | null =
      options.stamp === false
        ? null
        : {
            stamp: 1,
            generator: "any2orca",
            version: VERSION,
            profiles: { version: catalog.index.dataVersion, tracks: `${catalog.index.slicer.name} ${catalog.index.slicer.version}` },
            profileId,
            options: {
              highFlowHotends,
              hardenedNozzles: options.hardenedNozzles === true,
              filamentComplianceMode: options.filamentComplianceMode ?? null,
              ...(preset ? { preset: { base: preset.profileId, keys: Object.keys(preset.changes).sort(), sha256: await presetFingerprint(preset.changes) } } : {}),
              ...(aboveStock.keep.size + aboveStock.stock.size > 0 ? { aboveStock: { keep: [...aboveStock.keep].sort(), stock: [...aboveStock.stock].sort() } } : {}),
            },
          };

    // applyConvertResponse appends its own notes to the project's warning
    // list; give it a copy so converting twice doesn't repeat them.
    progress("writing");
    const applyWarnings: string[] = [];
    const output = applyConvertResponse({ ...this.parsed, warnings: applyWarnings }, response, stamp ? { [STAMP_PATH]: encodeStamp(stamp) } : {});

    const inspection = this.inspect();
    return {
      output,
      report: {
        profile: loaded.summary,
        ...(profileMatch ? { profileMatch } : {}),
        ...(retiredProfile ? { retiredProfile } : {}),
        warnings: cleanWarnings([...this.parsed.warnings, ...(response.warnings ?? []), ...applyWarnings.filter((w) => w.includes("WARN"))]),
        log: [...this.parsed.warnings, ...routeWarnings, ...pipeline.warnings, ...applyWarnings].map((w) => w.trim()).filter(Boolean),
        ...(response.filamentComplianceFallback ? { filamentComplianceFallback: response.filamentComplianceFallback } : {}),
        ...(response.filamentComplianceUnchanged ? { filamentComplianceUnchanged: response.filamentComplianceUnchanged } : {}),
        shifts: response.shifts,
        plates: Math.max(1, inspection.plates.length),
        objects: inspection.objects.length,
        filamentSlots: inspection.filaments.length,
        stamp,
        whatChanged: toWhatChanged(
          { id: loaded.summary.id, displayName: loaded.summary.displayName, chosenBy: preset ? "preset" : options.profileId ? "you" : "matched" },
          pipeline.changes,
          options.explain
            ? diffSettings({ label: "Original file", settings: this.request.projectSettings }, { label: "Converted file", settings: response.projectSettings })
            : undefined,
        ),
        ...(preset ? { preset: { base: preset.profileId, changes: preset.described, notes: preset.notes } } : {}),
      },
    };
  }
}

/** Opens a .3mf; see {@link Project}. */
export function openProject(bytes: Uint8Array, options: OpenOptions = {}): Project {
  return Project.open(bytes, options);
}

/** Reads a .3mf and describes it, without converting. */
export function inspect(bytes: Uint8Array, options: OpenOptions = {}): Inspection {
  return Project.open(bytes, options).inspect();
}

/** Reads and converts a .3mf in one step. `maxUnpackedBytes` applies to reading it. */
export function convert(bytes: Uint8Array, options: ConvertOptions & OpenOptions): Promise<ConvertResult> {
  const { maxUnpackedBytes, ...convertOptions } = options;
  return Project.open(bytes, { maxUnpackedBytes }).convert(convertOptions);
}

/**
 * A zip bundling several .3mf files (e.g. a "download all variants"
 * archive) returns each one; a plain .3mf, or anything else, returns null.
 */
export function unwrapBundle(bytes: Uint8Array, options: OpenOptions = {}): BundleEntry[] | null {
  return unwrapIfBundle(bytes, options.maxUnpackedBytes);
}

/**
 * The high-flow option as recorded in the request and the stamp: `false`
 * for none, or one entry per toolhead. `true` becomes all four. Rejects any
 * other shape instead of guessing, since a wrong hotend choice changes the
 * speeds a toolhead prints at.
 */
function normalizeHighFlowOption(value: boolean | readonly boolean[] | undefined): false | boolean[] {
  if (value === undefined || value === false) return false;
  if (value === true) return [true, true, true, true];
  const parsed = HighFlowHotendsSchema.safeParse(value);
  if (!parsed.success || typeof parsed.data === "boolean") {
    throw new TypeError("highFlowHotends must be true, false, or a list of exactly 4 booleans (one per toolhead, T1 first).");
  }
  return parsed.data.some(Boolean) ? [...parsed.data] : false;
}
