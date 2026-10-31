// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SlicerRelease, WorkerReleaseOption } from "any2orca/worker";
import { setReleaseOption } from "./api";
import { getStorage } from "./storage.svelte";

export const STORAGE_KEY = "any2orca_snapmaker_orca_version";

/** A plain x.y.z version; anything else read from storage is ignored. */
const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

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
    this.releases = releases.filter((r) => VERSION.test(r.version)).map((r) => ({ ...r }));
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
