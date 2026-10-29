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
 * Catalog data is treated as untrusted input, since it can come from a URL
 * or folder the user points at: sizes are capped, every file is validated,
 * and a profile file is only ever requested by an id the index lists.
 */
import { z } from "zod";
import { Any2orcaError } from "./errors.js";
import { APPLICATION_VALUE } from "./archive/setApplicationMetadata.js";
import { parseTierName } from "./engine/parseTierName.js";
import type { ConvertProfile } from "./engine/runConvertPipeline.js";
import type { FilamentNameTable } from "./engine/filamentComplianceNames.js";
import { ALWAYS_TRANSFER_KEYS, BLOCKLIST, FILAMENT_KEY_BLOCKLIST, isMachineGcodeKey, MACHINE_SETTINGS_KEYS, MIN_COMPARISON_KEYS, U1_VALUE_KEYS } from "./engine/policy.js";

/** Raw access to a catalog. Both methods return parsed JSON; the core validates it. */
export interface ProfileSource {
  /** The catalog index (`index.json`). */
  readIndex(): Promise<unknown>;
  /** One profile file (`profiles/<id>.json`). Only called with an id the index lists. */
  readProfile(id: string): Promise<unknown>;
}

/** Largest index file accepted from any source. */
export const MAX_INDEX_BYTES = 1024 * 1024;
/** Largest single profile file accepted from any source. A real one is about 100 KB. */
export const MAX_PROFILE_BYTES = 8 * 1024 * 1024;

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
});
export type ProfileIndex = z.infer<typeof ProfileIndexSchema>;

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

/** A loaded profile: what the engine runs on, plus its catalog entry. */
export interface LoadedProfile {
  summary: ProfileSummary;
  convertProfile: ConvertProfile;
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

  constructor(index: ProfileIndex, source: ProfileSource) {
    this.index = index;
    this.source = source;
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

  /** The live profile that replaced a retired id, if `id` was retired. */
  retiredSuccessor(id: string): RetiredProfile | undefined {
    if (this.byId.has(id)) return undefined;
    return this.retired.get(id);
  }

  /** Loads and validates one profile. Throws for an id the catalog doesn't list. */
  load(id: string): Promise<LoadedProfile> {
    const summary = this.byId.get(id);
    if (!summary) return Promise.reject(new Any2orcaError("profile_not_found", `No profile found for id "${id}".`));
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.source.readProfile(id).then((raw) => toLoadedProfile(raw, summary, this.index.filamentNames));
      // A failed read isn't cached, so a transient fetch error can be retried.
      pending.catch(() => this.cache.delete(id));
      this.cache.set(id, pending);
    }
    return pending;
  }
}

function toLoadedProfile(raw: unknown, summary: ProfileSummary, filamentNames: FilamentNameTable | undefined): LoadedProfile {
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
        baselineProjectSettings: file.baselineProjectSettings,
        filamentShapeConfig: file.filamentShape,
        blocklist: new Set([
          ...BLOCKLIST,
          ...U1_VALUE_KEYS,
          ...MACHINE_SETTINGS_KEYS,
          ...Object.keys(file.baselineProjectSettings).filter(isMachineGcodeKey),
        ]),
        minComparisonKeys: new Set(MIN_COMPARISON_KEYS),
        alwaysTransferKeys: new Set(ALWAYS_TRANSFER_KEYS),
        filamentKeyBlocklist: new Set(FILAMENT_KEY_BLOCKLIST),
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

/** Lists a catalog's profiles; see {@link ProfileCatalog.list}. */
export async function listProfiles(source: ProfileSource | ProfileCatalog, filter: { nozzleDiameter?: string } = {}): Promise<ProfileSummary[]> {
  return (await loadCatalog(source)).list(filter);
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
  };
}

/** A catalog already in memory, e.g. for tests or a bundler that inlines the JSON. */
export function memoryProfileSource(data: { index: unknown; profiles: Record<string, unknown> }): ProfileSource {
  return {
    readIndex: async () => data.index,
    readProfile: async (id) => {
      if (!Object.hasOwn(data.profiles, id)) throw new ProfileDataError(`No profile file for id "${id}".`);
      return data.profiles[id];
    },
  };
}
