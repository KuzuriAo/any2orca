// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  fetchProfileSource,
  loadCatalog,
  type ProfileCatalog,
  listProfiles,
  type ProfileSummary,
  type ProfileSource,
  type Inspection,
} from "any2orca";
import {
  createConverterWorker,
  type ConverterWorker,
  type WorkerProject,
  type WorkerConvertResult,
  type WorkerConvertOptions,
  type WorkerReleaseOption,
  type SlicerRelease,
} from "any2orca/worker";
// Worker is instantiated via standard new Worker(new URL(..., import.meta.url))

let profileSource: ProfileSource | null = null;

/**
 * The profile catalog this site serves itself, from public/profiles/
 * (copied from any2orca-profiles by scripts/copy-profiles.mjs). Resolved
 * against Vite's base URL, so a copy hosted under a subpath still finds it.
 */
function getProfileSource(): ProfileSource {
  if (!profileSource) {
    const baseUrl = typeof window !== "undefined"
      ? new URL(`${import.meta.env.BASE_URL}profiles/`, window.location.href)
      : "/profiles/";
    profileSource = fetchProfileSource(baseUrl);
  }
  return profileSource;
}

let converter: ConverterWorker | null = null;

export function getConverter(): ConverterWorker {
  if (!converter) {
    const profilesUrl = typeof window !== "undefined"
      ? new URL(`${import.meta.env.BASE_URL}profiles/`, window.location.href)
      : "/profiles/";
    let worker: Worker;
    try {
      worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
    } catch {
      throw new Error("This browser is too old for any2orca: use a current Chrome, Edge, Firefox (114 or newer) or Safari (16 or newer).");
    }
    converter = createConverterWorker(worker, {
      profilesUrl,
    });
  }
  return converter;
}

/**
 * The Snapmaker Orca release worker calls are for: empty for the newest the
 * catalog holds. snapmakerOrcaReleaseStore sets it whenever the choice
 * changes; spread it into every call that reads profiles.
 */
let releaseOption: WorkerReleaseOption = {};

export function setReleaseOption(option: WorkerReleaseOption): void {
  releaseOption = option.snapmakerOrcaVersion === undefined ? {} : { snapmakerOrcaVersion: option.snapmakerOrcaVersion };
}

export function currentReleaseOption(): WorkerReleaseOption {
  return { ...releaseOption };
}

let catalogPromise: Promise<ProfileCatalog> | null = null;

/** The profile catalog for a Snapmaker Orca release: the current one unless another is given, null for the newest. */
export function fetchProfileCatalog(version: string | null = releaseOption.snapmakerOrcaVersion ?? null): Promise<ProfileCatalog> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog(getProfileSource());
  }
  return version === null ? catalogPromise : catalogPromise.then((catalog) => catalog.forRelease(version));
}

let releasesPromise: Promise<SlicerRelease[]> | null = null;

/** Every Snapmaker Orca release the catalog holds, newest (the default) first: for the version picker. */
export function fetchReleases(): Promise<SlicerRelease[]> {
  if (!releasesPromise) {
    releasesPromise = getConverter()
      .listProfiles()
      .then((listing) => listing.releases ?? [])
      .catch(() => fetchProfileCatalog(null).then((catalog) => catalog.releases()));
    releasesPromise.catch(() => (releasesPromise = null));
  }
  return releasesPromise;
}

/** Profile listings per release ("" for the newest). */
const cachedProfiles = new Map<string, ProfileSummary[]>();

/** The profiles for a Snapmaker Orca release (default: the current one), one nozzle size's if given. */
export async function fetchProfiles(diameter?: string, version: string | null = releaseOption.snapmakerOrcaVersion ?? null): Promise<ProfileSummary[]> {
  const key = version ?? "";
  let profiles = cachedProfiles.get(key);
  if (!profiles) {
    const release = version === null ? {} : { snapmakerOrcaVersion: version };
    try {
      profiles = (await getConverter().listProfiles(release)).profiles;
    } catch {
      profiles = await listProfiles(getProfileSource(), release);
    }
    cachedProfiles.set(key, profiles);
  }
  const norm = diameter ? diameter.trim() : undefined;
  if (!norm) return profiles;
  return profiles.filter((p) => p.nozzleDiameter === norm);
}

export function isHighFlowSupported(diameter?: string | null): boolean {
  const norm = (diameter || "0.4").trim();
  const profiles = cachedProfiles.get(releaseOption.snapmakerOrcaVersion ?? "") ?? cachedProfiles.get("");
  if (profiles && profiles.length > 0) {
    return profiles.some((p) => p.nozzleDiameter === norm && p.highFlowSupported === true);
  }
  return norm === "0.4";
}

export function isHardenedNozzleSupported(diameter?: string | null): boolean {
  const norm = (diameter || "0.4").trim();
  return norm === "0.4";
}

export type {
  ProfileSummary,
  ProfileCatalog,
  Inspection,
  ConverterWorker,
  WorkerProject,
  WorkerConvertResult,
  WorkerConvertOptions,
  WorkerReleaseOption,
  SlicerRelease,
};
