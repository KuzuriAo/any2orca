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

let catalogPromise: Promise<ProfileCatalog> | null = null;

export function fetchProfileCatalog(): Promise<ProfileCatalog> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog(getProfileSource());
  }
  return catalogPromise;
}

let cachedProfiles: ProfileSummary[] | null = null;

export async function fetchProfiles(diameter?: string): Promise<ProfileSummary[]> {
  if (!cachedProfiles) {
    try {
      const listing = await getConverter().listProfiles();
      cachedProfiles = listing.profiles;
    } catch {
      cachedProfiles = await listProfiles(getProfileSource());
    }
  }
  const norm = diameter ? diameter.trim() : undefined;
  if (!norm) return cachedProfiles;
  return cachedProfiles.filter((p) => p.nozzleDiameter === norm);
}

export function isHighFlowSupported(diameter?: string | null): boolean {
  const norm = (diameter || "0.4").trim();
  if (cachedProfiles && cachedProfiles.length > 0) {
    return cachedProfiles.some((p) => p.nozzleDiameter === norm && p.highFlowSupported === true);
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
};
