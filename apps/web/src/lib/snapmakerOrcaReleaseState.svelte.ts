// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SlicerRelease, WorkerReleaseOption } from "any2orca/worker";
import { setReleaseOption } from "./api";
import { getStorage } from "./storage.svelte";

export const STORAGE_KEY = "any2orca_snapmaker_orca_version";

/** A plain x.y.z version; anything else read from storage is ignored. */
const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

function parseVersionParts(version: string): [number, number, number] | null {
  const m = VERSION.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Compares two x.y.z versions numerically, newest first (so 2.10 comes before 2.9). */
export function compareReleaseVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
}

/**
 * Splits the catalog's releases into the short list shown by default and the
 * older list behind "Show older versions", newest first:
 * - `shown`: every release with the newest's major and minor number, plus the
 *   newest release of the next minor number down.
 * - `older`: everything else, newest first.
 */
export function splitReleases<T extends { version: string }>(
  releases: readonly T[],
): { shown: T[]; older: T[] } {
  const valid = releases
    .filter((r) => VERSION.test(r.version))
    .slice()
    .sort((a, b) => compareReleaseVersions(a.version, b.version));

  if (valid.length === 0) {
    return { shown: [], older: [] };
  }

  const [newestMajor, newestMinor] = parseVersionParts(valid[0]!.version)!;
  const shown: T[] = [];
  const remaining: T[] = [];

  for (const r of valid) {
    const [maj, min] = parseVersionParts(r.version)!;
    if (maj === newestMajor && min === newestMinor) {
      shown.push(r);
    } else {
      remaining.push(r);
    }
  }

  if (remaining.length > 0) {
    shown.push(remaining[0]!);
  }

  return {
    shown,
    older: remaining.slice(1),
  };
}

/**
 * Computes whether the older versions `<optgroup>` is open and whether the
 * "Show older versions" button is visible. Once the older list is open (either
 * because the button was pressed or because the saved choice is in `older`),
 * the button goes away.
 */
export function resolveOlderVersionsUi(
  olderCount: number,
  expandedByClick: boolean,
  isOlderSelected: boolean,
): { olderOpen: boolean; showOlderButton: boolean } {
  if (olderCount <= 0) {
    return { olderOpen: false, showOlderButton: false };
  }
  const olderOpen = expandedByClick || isOlderSelected;
  return {
    olderOpen,
    showOlderButton: !olderOpen,
  };
}

/**
 * The Snapmaker Orca release files are converted for: null for the newest
 * the catalog holds (the default), or an older one the user picked. Saved
 * for the session only, like the hardware options, so updating Snapmaker
 * Orca never leaves an old choice behind.
 */
export class SnapmakerOrcaReleaseState {
  /** The release picked, or null for the default. */
  version = $state<string | null>(null);
  /** Every release the catalog holds, newest (the default) first; empty until loaded. */
  releases = $state<SlicerRelease[]>([]);
  private storage: Storage | null;

  private publish: (option: WorkerReleaseOption) => void;

  /** `publish` receives every change, for the worker calls (api.ts's setReleaseOption by default). */
  constructor(storage: Storage | null = getStorage("session"), publish: (option: WorkerReleaseOption) => void = setReleaseOption) {
    this.storage = storage;
    this.publish = publish;
    try {
      const stored = storage?.getItem(STORAGE_KEY) ?? null;
      this.version = stored !== null && VERSION.test(stored) ? stored : null;
    } catch {
      this.version = null;
    }
    this.publish(this.option);
  }

  /** Sets the releases the catalog holds, and drops a saved choice that isn't one of them or is the default. */
  setReleases(releases: readonly SlicerRelease[]): void {
    this.releases = releases
      .filter((r) => VERSION.test(r.version))
      .map((r) => ({ ...r }))
      .sort((a, b) => compareReleaseVersions(a.version, b.version));
    if (this.version !== null && !this.isPickable(this.version)) this.setVersion(null);
  }

  /** Picks a release; null, the default's own version, or one the catalog doesn't hold all mean the default. */
  setVersion(version: string | null): void {
    this.version = version !== null && this.isPickable(version) ? version : null;
    this.publish(this.option);
    try {
      if (this.version === null) this.storage?.removeItem(STORAGE_KEY);
      else this.storage?.setItem(STORAGE_KEY, this.version);
    } catch {
      // Keep the in-memory choice when storage is blocked.
    }
  }

  /** The release conversions use: the one picked, else the default. */
  get current(): SlicerRelease | null {
    return this.releases.find((r) => r.version === this.version) ?? this.releases.find((r) => r.isDefault) ?? null;
  }

  /** The releases shown directly in the picker, newest first. */
  get shown(): SlicerRelease[] {
    return splitReleases(this.releases).shown;
  }

  /** The older releases behind "Show older versions", newest first. */
  get older(): SlicerRelease[] {
    return splitReleases(this.releases).older;
  }

  /** Whether the currently picked release is in the older list, so the older list starts open. */
  get isOlderSelected(): boolean {
    return this.version !== null && this.older.some((r) => r.version === this.version);
  }

  /** Spread into every worker call that reads profiles. Empty for the default, so the worker picks the newest itself. */
  get option(): WorkerReleaseOption {
    return this.version === null ? {} : { snapmakerOrcaVersion: this.version };
  }

  private isPickable(version: string): boolean {
    if (!VERSION.test(version)) return false;
    const release = this.releases.find((r) => r.version === version);
    // Before the list loads, a well-formed saved choice is kept; the worker refuses it if the catalog lacks it.
    return this.releases.length === 0 ? true : Boolean(release && !release.isDefault);
  }
}

export const snapmakerOrcaReleaseStore = new SnapmakerOrcaReleaseState();
