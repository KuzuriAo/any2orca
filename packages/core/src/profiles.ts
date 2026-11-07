// SPDX-License-Identifier: MIT
/**
 * Profile catalogs: where conversion profiles come from, and how they are
 * checked before the engine uses them.
 *
 * The core never bundles profile data (that is the separate, AGPL-licensed
 * `any2orca-profiles` package). A caller hands it a {@link ProfileSource}:
 * {@link fetchProfileSource} for a browser, `dirProfileSource()` or
 * `bundledProfileSource()` from `any2orca/node`, or anything else with the
 * same two methods (a partner's own CDN, a database, an in-memory object).
 *
 * A catalog can hold several Snapmaker Orca releases: the newest at its top,
 * each older one in a folder of its own, listed in the index's `releases`.
 * {@link ProfileCatalog.forRelease} loads one of them.
 *
 * Catalog data is treated as untrusted input, since it can come from a URL
 * or folder the user points at: sizes are capped, every file is validated,
 * a profile file is only ever requested by an id the index lists, and a
 * release only from a path of the form `releases/<version>`.
 */
import "./zodSetup.js";
import { z } from "zod";
import { PrusaBundleSchema, type PrusaBundle } from "./sources/prusa/bundle.js";
import { Any2orcaError } from "./errors.js";
import { APPLICATION_VALUE } from "./archive/setApplicationMetadata.js";
import { parseTierName } from "./engine/parseTierName.js";
import type { ConvertProfile } from "./engine/runConvertPipeline.js";
import type { FilamentNameTable } from "./engine/filamentComplianceNames.js";
import { ALWAYS_TRANSFER_KEYS, BLOCKLIST, FILAMENT_KEY_BLOCKLIST, isGcodeKey, MACHINE_SETTINGS_KEYS, MIN_COMPARISON_KEYS, U1_VALUE_KEYS } from "./engine/policy.js";

/** Raw access to a catalog. Both methods return parsed JSON; the core validates it. */
export interface ProfileSource {
  /** The catalog index (`index.json`). */
  readIndex(): Promise<unknown>;
  /** One profile file (`profiles/<id>.json`). Only called with an id the index lists. */
  readProfile(id: string): Promise<unknown>;
  /**
   * The source for an older release this catalog holds, in the folder at
   * `path` (from index.json `releases`, always `releases/<version>`). Only
   * called with a path of the form `releases/<x.y.z>`. Leave it out for a
   * catalog with one release.
   */
  release?(path: string): ProfileSource;
  /**
   * One source-slicer data file (`sources/prusaslicer/<Vendor>.json`). Only
   * called with a path the index lists (`sources/prusaslicer/<Vendor>-<version>.json`).
   * Leave it out for a source without such data: a PrusaSlicer project is
   * then converted with every mapped setting treated as changed.
   */
  readSource?(path: string): Promise<unknown>;
  /**
   * The catalog's filament presets file (`filament-presets.json`, named by the index): the settings of every
   * filament preset Snapmaker Orca installs for each printer, which the Snapmaker and Generic filament options
   * write. Only called when a conversion uses one of those options. Leave it out for a source without the file:
   * those options then change filament names only.
   */
  readFilamentPresets?(): Promise<unknown>;
}

/** A release's folder inside a catalog: `releases/` and a plain version, nothing else. */
const RELEASE_PATH = /^releases\/(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

/** True for a path a {@link ProfileSource.release} may be asked for. */
export function isReleasePath(path: string): boolean {
  return RELEASE_PATH.test(path);
}

/** Largest index file accepted from any source. */
export const MAX_INDEX_BYTES = 1024 * 1024;
/** Largest single profile file accepted from any source. A real one is about 100 KB. */
export const MAX_PROFILE_BYTES = 8 * 1024 * 1024;
/** A source-slicer bundle file (a vendor's print presets, unresolved) is a few hundred KB; this bounds a hostile one. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** A filament presets file is a few hundred KB; this bounds a hostile one. */
export const MAX_FILAMENT_PRESETS_BYTES = 8 * 1024 * 1024;
/** The only name the index may give the filament presets file. */
export const FILAMENT_PRESETS_PATH = "filament-presets.json";
/** Where the index may point for source-slicer data: `sources/prusaslicer/<Vendor>.json` only. */
export const SOURCE_PATH = /^sources\/prusaslicer\/[A-Za-z0-9]{1,64}-\d+\.\d+\.\d+\.json$/;
export function isSourcePath(path: string): boolean {
  return SOURCE_PATH.test(path);
}

const ID = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "must be lowercase letters, digits, dots and dashes");
const VERSION = z.string().regex(/^\d+(\.\d+){1,3}([-+][0-9A-Za-z.-]{1,32})?$/);
const DIAMETER = z.string().regex(/^\d{1,2}(\.\d{1,3})?$/);
const settings = z.record(z.string().max(200), z.unknown());
/** Text the naming options write into a project and show to people: one line, no control or direction-override characters. */
const SAFE_TEXT = /^[^\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]*$/;
const presetText = (max: number) => z.string().min(1).max(max).regex(SAFE_TEXT, "must not contain control characters");
const NAME = presetText(200);

const FilamentNamesSchema = z.object({
  profileSet: z.object({ repository: presetText(200), version: presetText(64), commit: presetText(64) }),
  materialAliases: z.record(presetText(20), presetText(20)).refine((r) => Object.keys(r).length <= 200, "too many material aliases"),
  lines: z
    .array(
      z.object({
        id: ID,
        label: presetText(100),
        materials: z.array(presetText(20)).min(1).max(20),
        keywords: z.array(z.string().regex(/^[a-z0-9]+( [a-z0-9]+)*$/).max(40)).max(50),
        snapmaker: presetText(200).nullable(),
        generic: presetText(200).nullable(),
      }),
    )
    .max(500),
  printers: z.record(
    ID,
    z.object({
      nozzleDiameter: DIAMETER,
      presets: z
        .record(presetText(200), z.object({ family: presetText(200), id: z.string().max(64).regex(SAFE_TEXT), vendor: presetText(64) }))
        .refine((r) => Object.keys(r).length <= 2000, "too many presets"),
    }),
  ),
});

export const ProfileIndexSchema = z.object({
  schema: z.literal(1),
  dataVersion: VERSION,
  slicer: z
    .object({ name: NAME, version: VERSION, application: z.string().regex(APPLICATION_VALUE) })
    // The Application value names the pinned release, so it can't disagree with it.
    .refine((s) => s.application.endsWith(`-${s.version}`), "slicer.application must end with the slicer version"),
  /** Where the profiles come from: the target slicer's repository and the release tag and commit they were generated at. */
  source: z.object({ repository: presetText(200), tag: presetText(64), commit: presetText(64) }).optional(),
  defaultProfileId: ID,
  printers: z
    .array(z.object({ id: ID, displayName: NAME, nozzleDiameter: DIAMETER, highFlowSupported: z.boolean() }))
    .min(1)
    .max(500),
  profiles: z
    .array(
      z.object({
        id: ID,
        printerId: ID,
        displayName: NAME,
        nozzleDiameter: DIAMETER,
        layerHeight: z.number().positive().finite(),
        autoSelectable: z.boolean(),
        highFlowSpeeds: z.boolean(),
      }),
    )
    .min(1)
    .max(5000),
  retired: z.array(z.object({ id: ID, successorId: ID, displayName: NAME })).max(5000),
  /** Filament preset names for the Snapmaker/Generic naming options, per printer. */
  filamentNames: FilamentNamesSchema.optional(),
  /** The filament presets file, when the catalog has one: always `filament-presets.json`. */
  filamentPresets: z.literal(FILAMENT_PRESETS_PATH).optional(),
  /**
   * Every Snapmaker Orca release this catalog holds, newest first: this
   * index's own (`path` ".") and each older one's folder. Absent in a
   * catalog with one release.
   */
  releases: z
    .array(
      z.object({
        version: VERSION,
        application: z.string().regex(APPLICATION_VALUE),
        path: z.union([z.literal("."), z.string().regex(RELEASE_PATH)]),
      }),
    )
    .min(1)
    .max(50)
    .optional(),
  /**
   * Source-slicer data the catalog holds, independent of the Snapmaker Orca
   * release: PrusaSlicer's vendor preset bundles (print presets), used to
   * tell what a PrusaSlicer project's creator changed. Absent in older data.
   */
  sources: z
    .object({
      prusaslicer: z
        .array(z.object({ vendor: z.string().regex(/^[A-Za-z0-9]{1,64}$/), name: NAME, path: z.string().regex(SOURCE_PATH), slicerVersion: VERSION, configVersion: presetText(64), slicerTag: presetText(64) }))
        .max(50),
    })
    .optional(),
});
/** Keys that could reach an object's prototype when the shared values are merged into a preset. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const safeKey = (max: number, pattern: RegExp) => z.string().max(max).regex(pattern).refine((k) => !UNSAFE_KEYS.has(k), "not a usable key");
const presetSettings = z
  .record(safeKey(100, /^[A-Za-z0-9_]{1,100}$/), z.array(z.string().max(20_000)).max(64))
  .refine((r) => Object.keys(r).length <= 1000, "too many settings");
export const FilamentPresetsSchema = z.object({
  printers: z
    .record(
      ID.refine((k) => !UNSAFE_KEYS.has(k), "not a usable key"),
      z.object({
        shared: presetSettings,
        presets: z.record(presetText(200).refine((k) => !UNSAFE_KEYS.has(k), "not a usable key"), presetSettings).refine((r) => Object.keys(r).length <= 2000, "too many presets"),
      }),
    )
    .refine((r) => Object.keys(r).length <= 500, "too many printers"),
});
/** One printer's filament presets: the values they share, and each preset's own, by preset name. */
export interface PrinterFilamentPresets {
  shared: Record<string, string[]>;
  presets: Record<string, Record<string, string[]>>;
}

/** A printer the catalog has profiles for. */
export interface ProfileIndexPrinter {
  id: string;
  displayName: string;
  nozzleDiameter: string;
  highFlowSupported: boolean;
}
/** A profile as the index lists it. */
export interface ProfileIndexProfile {
  id: string;
  printerId: string;
  displayName: string;
  nozzleDiameter: string;
  layerHeight: number;
  autoSelectable: boolean;
  highFlowSpeeds: boolean;
}
/** A Snapmaker Orca release the catalog holds: this index's own (`path` ".") or an older one's folder. */
export interface ProfileIndexRelease {
  version: string;
  application: string;
  path: string;
}
/** A source-slicer data file the catalog holds (PrusaSlicer's vendor preset bundles). */
export interface ProfileIndexSource {
  vendor: string;
  name: string;
  path: string;
  slicerVersion: string;
  configVersion: string;
  slicerTag: string;
}
/** A catalog's `index.json`, as {@link loadCatalog} checks it. */
export interface ProfileIndex {
  schema: 1;
  dataVersion: string;
  slicer: { name: string; version: string; application: string };
  /** Where the profiles come from: the target slicer's repository and the release tag and commit they were generated at. */
  source?: { repository: string; tag: string; commit: string };
  defaultProfileId: string;
  printers: ProfileIndexPrinter[];
  profiles: ProfileIndexProfile[];
  retired: RetiredProfile[];
  /** Filament preset names for the Snapmaker/Generic naming options, per printer. */
  filamentNames?: FilamentNameTable;
  /** The filament presets file, when the catalog has one: always `filament-presets.json`. */
  filamentPresets?: "filament-presets.json";
  /** Every Snapmaker Orca release this catalog holds, newest first. Absent in a catalog with one release. */
  releases?: ProfileIndexRelease[];
  /** Source-slicer data the catalog holds, independent of the Snapmaker Orca release. Absent in older data. */
  sources?: { prusaslicer: ProfileIndexSource[] };
}

export const ProfileFileSchema = z.object({
  schema: z.literal(1),
  id: ID,
  displayName: NAME,
  printer: z.object({
    id: ID,
    printableArea: z.array(z.string().max(64)).min(3).max(64),
    extruderClearanceRadius: z.number().nonnegative().max(1000),
    highFlowSupported: z.boolean(),
    machineSettings: settings,
  }),
  baselineProjectSettings: settings,
  filamentShape: settings,
  highFlowOverrides: z.record(z.string().max(200), z.string().max(200)),
});
export type ProfileFile = z.infer<typeof ProfileFileSchema>;

/** One entry in a profile listing: enough to render a picker. */
export interface ProfileSummary {
  id: string;
  displayName: string;
  printerId: string;
  nozzleDiameter: string;
  layerHeight: number;
  /**
   * False for a tier that shares its layer height with another tier at the
   * same nozzle size (e.g. "0.20mm High Quality" next to "0.20mm Standard").
   * Auto-matching never picks these, since nothing in a source file says
   * which one was meant. Still listed for manual selection.
   */
  autoSelectable: boolean;
  /** The tier's own name parsed from displayName, e.g. "Standard" or "High Quality". */
  tierName: string;
  /** This profile's nozzle supports the Liber High Flow Hotend (in the current catalog, only 0.4mm). */
  highFlowSupported: boolean;
  /** This tier has its own high-flow speeds (in the current catalog, only 0.20mm Standard, 0.4mm). */
  highFlowSpeeds: boolean;
}

/** A retired profile id that still converts, with its successor. */
export interface RetiredProfile {
  id: string;
  successorId: string;
  displayName: string;
}

/** A Snapmaker Orca release a catalog holds. */
export interface SlicerRelease {
  /** The release, e.g. "2.4.1". */
  version: string;
  /** The `Application` value files converted for it carry, e.g. "Snapmaker_Orca-2.4.1". */
  application: string;
  /** True for the release a conversion uses when none is chosen: always the newest. */
  isDefault: boolean;
}

/** A loaded profile: what the engine runs on, plus its catalog entry. */
export interface LoadedProfile {
  summary: ProfileSummary;
  convertProfile: ConvertProfile;
}

/** The engine's side of a catalog: what a conversion runs on. Reached with {@link catalogEngine}; not part of the public API. */
export interface CatalogEngine {
  load(id: string): Promise<LoadedProfile>;
  prusaBundle(vendor: string, slicerVersion: string): Promise<PrusaBundle | null>;
  /** The filament presets, by printer id; null when the catalog or its source has none. */
  filamentPresets(): Promise<Record<string, PrinterFilamentPresets> | null>;
}
const ENGINES = new WeakMap<ProfileCatalog, CatalogEngine>();
/** For tests: gives a stand-in catalog an engine side. */
export function withCatalogEngine<T extends object>(catalog: T, engine: Partial<CatalogEngine>): T {
  ENGINES.set(catalog as unknown as ProfileCatalog, { load: () => Promise.reject(new ProfileDataError("No profiles in this stand-in.")), prusaBundle: () => Promise.resolve(null), filamentPresets: () => Promise.resolve(null), ...engine } as CatalogEngine);
  return catalog;
}
/** The engine's access to a catalog. Kept off the class, so the public API holds only what a UI needs. */
export function catalogEngine(catalog: ProfileCatalog): CatalogEngine {
  const engine = ENGINES.get(catalog);
  if (!engine) throw new ProfileDataError("Not a profile catalog.");
  return engine;
}

/** The catalog itself is missing or malformed (code `profile_data`). */
export class ProfileDataError extends Any2orcaError {
  constructor(message: string) {
    super("profile_data", message);
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * A validated catalog. Get one with {@link loadCatalog}; it caches loaded
 * profiles, so one instance can serve many conversions.
 */
export class ProfileCatalog {
  readonly index: ProfileIndex;
  private readonly source: ProfileSource;
  private readonly summaries: ProfileSummary[];
  private readonly byId: Map<string, ProfileSummary>;
  private readonly retired: Map<string, RetiredProfile>;
  private readonly cache = new Map<string, Promise<LoadedProfile>>();
  private readonly releaseCatalogs = new Map<string, Promise<ProfileCatalog>>();
  private readonly bundles = new Map<string, Promise<PrusaBundle | null>>();
  private filamentPresetsPending: Promise<Record<string, PrinterFilamentPresets> | null> | undefined;

  constructor(index: ProfileIndex, source: ProfileSource) {
    ENGINES.set(this, { load: (id) => this.load(id), prusaBundle: (vendor, slicerVersion) => this.prusaBundle(vendor, slicerVersion), filamentPresets: () => this.filamentPresets() });
    this.index = index;
    this.source = source;
    if (index.releases) {
      const own = index.releases.filter((r) => r.path === ".");
      if (own.length !== 1 || own[0]!.version !== index.slicer.version || own[0]!.application !== index.slicer.application) {
        throw new ProfileDataError("Profile catalog's releases must list its own release once, with path \".\", matching slicer.");
      }
      if (new Set(index.releases.map((r) => r.version)).size !== index.releases.length) {
        throw new ProfileDataError("Profile catalog lists the same release twice.");
      }
      for (const r of index.releases) {
        if (r.path !== "." && r.path !== `releases/${r.version}`) throw new ProfileDataError(`Profile catalog's release ${r.version} must be in releases/${r.version}.`);
        if (!r.application.endsWith(`-${r.version}`)) throw new ProfileDataError(`Profile catalog's release ${r.version} has an application value for another version.`);
      }
    }
    const printers = new Map(index.printers.map((p) => [p.id, p]));
    this.summaries = index.profiles.map((p) => {
      const printer = printers.get(p.printerId);
      if (!printer) throw new ProfileDataError(`Profile catalog: ${p.id} names unknown printer ${p.printerId}.`);
      const tierName = parseTierName(p.displayName);
      if (!tierName) throw new ProfileDataError(`Profile catalog: can't read a tier name from "${p.displayName}".`);
      return {
        id: p.id,
        displayName: p.displayName,
        printerId: p.printerId,
        nozzleDiameter: p.nozzleDiameter,
        layerHeight: p.layerHeight,
        autoSelectable: p.autoSelectable,
        tierName,
        highFlowSupported: printer.highFlowSupported,
        highFlowSpeeds: p.highFlowSpeeds,
      };
    });
    this.byId = new Map(this.summaries.map((s) => [s.id, s]));
    if (this.byId.size !== this.summaries.length) throw new ProfileDataError("Profile catalog lists the same profile id twice.");
    if (!this.byId.has(index.defaultProfileId)) {
      throw new ProfileDataError(`Profile catalog's default profile ${index.defaultProfileId} isn't in the catalog.`);
    }
    this.retired = new Map(index.retired.map((r) => [r.id, r]));
  }

  /** Every profile, or only one nozzle size's, sorted by nozzle size and then layer height (finest first). */
  list(filter: { nozzleDiameter?: string } = {}): ProfileSummary[] {
    const { nozzleDiameter } = filter;
    return this.summaries.filter((s) => nozzleDiameter === undefined || s.nozzleDiameter === nozzleDiameter).map((s) => ({ ...s }));
  }

  get(id: string): ProfileSummary | undefined {
    const summary = this.byId.get(id);
    return summary ? { ...summary } : undefined;
  }

  /** The PrusaSlicer vendor bundles this catalog holds, as the index lists them. */
  prusaBundles(): { vendor: string; name: string; slicerVersion: string; configVersion: string; slicerTag: string }[] {
    return (this.index.sources?.prusaslicer ?? []).map(({ vendor, name, slicerVersion, configVersion, slicerTag }) => ({ vendor, name, slicerVersion, configVersion, slicerTag }));
  }

  /**
   * One PrusaSlicer vendor bundle, loaded and checked once, or null when the
   * catalog doesn't list it or its source can't read source data.
   */
  private prusaBundle(vendor: string, slicerVersion: string): Promise<PrusaBundle | null> {
    const entry = this.index.sources?.prusaslicer.find((b) => b.vendor === vendor && b.slicerVersion === slicerVersion);
    if (!entry || !this.source.readSource || !isSourcePath(entry.path)) return Promise.resolve(null);
    const cacheKey = `${vendor}-${slicerVersion}`;
    let pending = this.bundles.get(cacheKey);
    if (!pending) {
      const path = entry.path;
      pending = this.source.readSource(path).then((raw) => {
        const parsed = PrusaBundleSchema.safeParse(raw);
        if (!parsed.success) throw new ProfileDataError(`Profile catalog's ${path} isn't a vendor bundle: ${describeIssues(parsed.error)}`);
        if (parsed.data.vendor !== vendor || parsed.data.slicer.version !== slicerVersion) throw new ProfileDataError(`Profile catalog's ${path} is the bundle for ${parsed.data.vendor} ${parsed.data.slicer.version}, not ${vendor} ${slicerVersion}.`);
        return parsed.data;
      });
      this.bundles.set(cacheKey, pending);
    }
    return pending;
  }

  /** The filament presets, loaded and checked once; null when the index names none or the source can't read it. */
  private filamentPresets(): Promise<Record<string, PrinterFilamentPresets> | null> {
    if (this.index.filamentPresets !== FILAMENT_PRESETS_PATH || !this.source.readFilamentPresets) return Promise.resolve(null);
    this.filamentPresetsPending ??= this.source.readFilamentPresets().then((raw) => {
      const parsed = FilamentPresetsSchema.safeParse(raw);
      if (!parsed.success) throw new ProfileDataError(`Profile catalog's ${FILAMENT_PRESETS_PATH} is malformed: ${describeIssues(parsed.error)}`);
      return parsed.data.printers;
    });
    // A failed read isn't kept, so a transient fetch error can be retried.
    this.filamentPresetsPending.catch(() => (this.filamentPresetsPending = undefined));
    return this.filamentPresetsPending;
  }

  /** The live profile that replaced a retired id, if `id` was retired. */
  retiredSuccessor(id: string): RetiredProfile | undefined {
    if (this.byId.has(id)) return undefined;
    return this.retired.get(id);
  }

  /** The Snapmaker Orca releases this catalog holds, newest first. The first is the default. */
  releases(): SlicerRelease[] {
    const listed = this.index.releases ?? [{ version: this.index.slicer.version, application: this.index.slicer.application, path: "." }];
    return listed.map((r, i) => ({ version: r.version, application: r.application, isDefault: i === 0 }));
  }

  /**
   * The catalog for one Snapmaker Orca release this catalog holds: itself for
   * its own release, or the older release's catalog, loaded once and checked
   * to be that release. Throws {@link Any2orcaError} `release_not_found` for
   * a release it doesn't hold.
   */
  forRelease(version: string): Promise<ProfileCatalog> {
    if (version === this.index.slicer.version) return Promise.resolve(this);
    const entry = this.index.releases?.find((r) => r.version === version);
    if (!entry) {
      const have = this.releases().map((r) => r.version).join(", ");
      return Promise.reject(new Any2orcaError("release_not_found", `Snapmaker Orca ${plainVersion(version)} isn't one of the releases this profile catalog holds (${have}).`));
    }
    let pending = this.releaseCatalogs.get(version);
    if (!pending) {
      const { source } = this;
      if (!source.release || !isReleasePath(entry.path)) {
        return Promise.reject(new ProfileDataError(`This profile source can't load Snapmaker Orca ${version}: it has no release() method.`));
      }
      pending = loadCatalog(source.release(entry.path)).then((catalog) => {
        if (catalog.index.slicer.version !== version || catalog.index.slicer.application !== entry.application) {
          throw new ProfileDataError(`Profile catalog at ${entry.path} is for Snapmaker Orca ${catalog.index.slicer.version}, not ${version}.`);
        }
        return catalog;
      });
      pending.catch(() => this.releaseCatalogs.delete(version));
      this.releaseCatalogs.set(version, pending);
    }
    return pending;
  }

  /** Loads and validates one profile. Throws for an id the catalog doesn't list. */
  private load(id: string): Promise<LoadedProfile> {
    const summary = this.byId.get(id);
    if (!summary) return Promise.reject(new Any2orcaError("profile_not_found", `No profile found for id "${id}".`));
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.source.readProfile(id).then((raw) => toLoadedProfile(raw, summary, this.index.filamentNames, this.index.slicer.version));
      // A failed read isn't cached, so a transient fetch error can be retried.
      pending.catch(() => this.cache.delete(id));
      this.cache.set(id, pending);
    }
    return pending;
  }
}

function toLoadedProfile(raw: unknown, summary: ProfileSummary, filamentNames: FilamentNameTable | undefined, release: string): LoadedProfile {
  const parsed = ProfileFileSchema.safeParse(raw);
  if (!parsed.success) throw new ProfileDataError(`Profile ${summary.id} is malformed: ${describeIssues(parsed.error)}`);
  const file = parsed.data;
  if (file.id !== summary.id) throw new ProfileDataError(`Profile file for ${summary.id} says it is ${file.id}.`);
  if (file.printer.id !== summary.printerId) {
    throw new ProfileDataError(`Profile ${summary.id} names printer ${file.printer.id}, but the index says ${summary.printerId}.`);
  }
  return {
    summary: { ...summary },
    convertProfile: {
      printer: {
        id: file.printer.id,
        printableArea: file.printer.printableArea,
        extruderClearanceRadius: file.printer.extruderClearanceRadius,
        machineSettingsConfig: file.printer.machineSettings,
        highFlowSupported: file.printer.highFlowSupported,
        ...(filamentNames ? { filamentNames } : {}),
      },
      profile: {
        id: file.id,
        release,
        baselineProjectSettings: file.baselineProjectSettings,
        filamentShapeConfig: file.filamentShape,
        blocklist: new Set([
          ...BLOCKLIST,
          ...U1_VALUE_KEYS,
          ...MACHINE_SETTINGS_KEYS,
          ...Object.keys(file.baselineProjectSettings).filter(isGcodeKey),
        ]),
        minComparisonKeys: new Set(MIN_COMPARISON_KEYS),
        alwaysTransferKeys: new Set(ALWAYS_TRANSFER_KEYS),
        filamentKeyBlocklist: new Set([
          ...FILAMENT_KEY_BLOCKLIST,
          ...Object.keys(file.filamentShape).filter(isGcodeKey),
          ...Object.keys(file.baselineProjectSettings).filter(isGcodeKey),
        ]),
        highFlowOverrides: file.highFlowOverrides,
      },
    },
  };
}

const catalogs = new WeakMap<ProfileSource, Promise<ProfileCatalog>>();

/** Reads and validates a source's index. Cached per source object. */
export function loadCatalog(source: ProfileSource | ProfileCatalog): Promise<ProfileCatalog> {
  if (source instanceof ProfileCatalog) return Promise.resolve(source);
  let pending = catalogs.get(source);
  if (!pending) {
    pending = source.readIndex().then((raw) => {
      const parsed = ProfileIndexSchema.safeParse(raw);
      if (!parsed.success) throw new ProfileDataError(`Profile catalog index is malformed: ${describeIssues(parsed.error)}`);
      return new ProfileCatalog(parsed.data, source);
    });
    pending.catch(() => catalogs.delete(source));
    catalogs.set(source, pending);
  }
  return pending;
}

/** Lists a catalog's profiles, for the newest release or the one given; see {@link ProfileCatalog.list}. */
export async function listProfiles(
  source: ProfileSource | ProfileCatalog,
  filter: { nozzleDiameter?: string; snapmakerOrcaVersion?: string } = {},
): Promise<ProfileSummary[]> {
  const catalog = await loadCatalog(source);
  const { snapmakerOrcaVersion, ...rest } = filter;
  return (snapmakerOrcaVersion === undefined ? catalog : await catalog.forRelease(snapmakerOrcaVersion)).list(rest);
}

/** A version for an error message: what the caller passed, shortened and on one line. */
function plainVersion(version: string): string {
  return JSON.stringify(String(version).slice(0, 40));
}

/** Parses JSON text after checking its size; shared by every source that reads text. */
export function parseCatalogJson(text: string, maxBytes: number, what: string): unknown {
  // String length counts UTF-16 units, at most the UTF-8 byte count for this data; close enough for a cap.
  if (text.length > maxBytes) throw new ProfileDataError(`${what} is larger than the ${maxBytes} byte limit.`);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ProfileDataError(`${what} isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Reads a response body, stopping as soon as it passes `maxBytes` (a missing or false Content-Length can't make it read more). */
async function readBoundedText(response: Response, maxBytes: number, what: string): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ProfileDataError(`${what} is larger than the ${maxBytes} byte limit.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * A catalog served over HTTP(S), e.g. `any2orca-profiles`' `data/` folder
 * copied into a site's static files. Fetches `index.json` once, then only
 * the profile files actually used. Makes no request until first used.
 */
export function fetchProfileSource(
  baseUrl: string | URL,
  options: { fetch?: typeof fetch; init?: RequestInit } = {},
): ProfileSource {
  const base = new URL(String(baseUrl).endsWith("/") ? String(baseUrl) : `${String(baseUrl)}/`, globalThis.location?.href);
  const doFetch = options.fetch ?? fetch;
  async function read(path: string, maxBytes: number): Promise<unknown> {
    const url = new URL(path, base);
    const response = await doFetch(url, options.init);
    if (!response.ok) throw new ProfileDataError(`Couldn't load ${url.href}: HTTP ${response.status}.`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new ProfileDataError(`${url.href} is larger than the ${maxBytes} byte limit.`);
    return parseCatalogJson(await readBoundedText(response, maxBytes, url.href), maxBytes, url.href);
  }
  return {
    readIndex: () => read("index.json", MAX_INDEX_BYTES),
    readProfile: (id) => read(`profiles/${encodeURIComponent(id)}.json`, MAX_PROFILE_BYTES),
    release: (path) => {
      if (!isReleasePath(path)) throw new ProfileDataError(`Not a release folder: ${plainVersion(path)}.`);
      return fetchProfileSource(new URL(`${path}/`, base), options);
    },
    readSource: (path) => {
      if (!isSourcePath(path)) throw new ProfileDataError(`Not a source data file: ${JSON.stringify(path.slice(0, 60))}.`);
      return read(path, MAX_SOURCE_BYTES);
    },
    readFilamentPresets: () => read(FILAMENT_PRESETS_PATH, MAX_FILAMENT_PRESETS_BYTES),
  };
}

/** Catalog data for {@link memoryProfileSource}: an index, its profile files, and any older releases' data by path. */
export interface MemoryCatalogData {
  index: unknown;
  profiles: Record<string, unknown>;
  releases?: Record<string, MemoryCatalogData>;
  /** Source-slicer data files by their index path (`sources/prusaslicer/<Vendor>.json`). */
  sources?: Record<string, unknown>;
  /** The filament presets file's contents, when the index names one. */
  filamentPresets?: unknown;
}

/** A catalog already in memory, e.g. for tests or a bundler that inlines the JSON. */
export function memoryProfileSource(data: MemoryCatalogData): ProfileSource {
  return {
    readIndex: async () => data.index,
    readProfile: async (id) => {
      if (!Object.hasOwn(data.profiles, id)) throw new ProfileDataError(`No profile file for id "${id}".`);
      return data.profiles[id];
    },
    ...(data.sources
      ? {
          readSource: async (path: string) => {
            if (!isSourcePath(path) || !Object.hasOwn(data.sources!, path)) throw new ProfileDataError(`No source data at ${JSON.stringify(path.slice(0, 60))}.`);
            return data.sources![path];
          },
        }
      : {}),
    ...(data.filamentPresets !== undefined ? { readFilamentPresets: async () => data.filamentPresets } : {}),
    release: (path) => {
      if (!isReleasePath(path) || !data.releases || !Object.hasOwn(data.releases, path)) throw new ProfileDataError(`No catalog data for ${plainVersion(path)}.`);
      return memoryProfileSource(data.releases[path]!);
    },
  };
}
