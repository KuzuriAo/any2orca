// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Presets & Compare engine adapter.
 * Backed by the any2orca worker and localStorage.
 */
import {
  parsePresetFile,
  serializePresets,
  MAX_PRESET_NAME_LENGTH,
  MAX_PRESETS_PER_FILE,
  MAX_PRESETS_FILE_BYTES,
  Any2orcaError,
  type Preset,
  type PresetChange,
  type ExtractedPreset,
  type ResolvedPreset,
  type SettingsDiff,
  type DiffRow,
  type DiffGroup,
  type DiffOptions,
  type DiffAttention,
} from "any2orca";
import { currentReleaseOption, getConverter, type ConverterWorker, type WorkerProject, type WorkerReleaseOption } from "./api";

export type DiffResult = SettingsDiff;
export type {
  Preset,
  PresetChange,
  ExtractedPreset,
  ResolvedPreset,
  SettingsDiff,
  DiffRow,
  DiffGroup,
  DiffOptions,
  DiffAttention,
};

export interface PresetsEngine {
  extractPreset(file: File): Promise<ExtractedPreset>;
  listPresets(): Preset[];
  savePreset(p: Preset): void;
  deletePreset(name: string): void;
  exportPresets(names?: string[]): string;
  resolvePreset(preset: Preset): Promise<ResolvedPreset>;
  isAboveStock(preset: Preset): Promise<boolean>;
  diff(
    a: File | { stock: string } | { preset: string },
    b: File | { stock: string } | { preset: string },
    options?: DiffOptions
  ): Promise<SettingsDiff>;
  stockProfiles(): Promise<Array<{ id: string; displayName: string }>>;
  getStorageError(): string | null;
  getRawStorage(): string | null;
  clearStorage(): void;
  matchProfileForFile(file: File): Promise<string | null>;
}

export const PRESETS_STORAGE_KEY = "any2orca_presets";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function toPlain<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class RealPresetsEngine implements PresetsEngine {
  private storage: Storage | null;
  private workerProvider: () => ConverterWorker;
  private storageError: string | null = null;
  private aboveStockCache = new Map<string, boolean>();
  private releaseProvider: () => WorkerReleaseOption;
  private cachedStockProfiles = new Map<string, Array<{ id: string; displayName: string }>>();

  /** `releaseProvider` names the Snapmaker Orca release each worker call is for (empty: the newest). */
  constructor(
    storage: Storage | null = getStorage(),
    workerProvider: () => ConverterWorker = getConverter,
    releaseProvider: () => WorkerReleaseOption = currentReleaseOption
  ) {
    this.storage = storage;
    this.workerProvider = workerProvider;
    this.releaseProvider = releaseProvider;
  }

  getStorageError(): string | null {
    return this.storageError;
  }

  listPresets(): Preset[] {
    if (!this.storage) return [];
    const raw = this.storage.getItem(PRESETS_STORAGE_KEY);
    if (!raw || !raw.trim()) {
      this.storageError = null;
      return [];
    }

    try {
      const file = parsePresetFile(raw);
      this.storageError = null;
      return file.presets;
    } catch {
      // Do not overwrite or lose existing stored text
      this.storageError = "Your saved presets couldn't be read and were not loaded.";
      return [];
    }
  }

  savePreset(p: Preset): void {
    if (!p) throw new Any2orcaError("invalid_preset", "Invalid preset payload.");
    // Verify existing storage before modifying
    this.listPresets();
    if (this.storageError) {
      throw new Any2orcaError(
        "invalid_preset",
        "Your saved presets couldn't be read. Export or clear them before saving new ones."
      );
    }
    const name = (p.name || "").trim();
    if (!name) {
      throw new Any2orcaError("invalid_preset", "Preset name cannot be empty.");
    }
    if (name.length > MAX_PRESET_NAME_LENGTH) {
      throw new Any2orcaError(
        "invalid_preset",
        `Preset name must be at most ${MAX_PRESET_NAME_LENGTH} characters.`
      );
    }
    if (name.includes("\n") || name.includes("\r")) {
      throw new Any2orcaError("invalid_preset", "Preset name cannot contain line breaks.");
    }

    const updatedPreset: Preset = {
      ...p,
      name,
    };

    const existing = this.listPresets();
    const idx = existing.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());

    if (idx >= 0) {
      existing[idx] = updatedPreset;
    } else {
      if (existing.length >= MAX_PRESETS_PER_FILE) {
        throw new Any2orcaError(
          "invalid_preset",
          `A presets file holds at most ${MAX_PRESETS_PER_FILE} presets.`
        );
      }
      existing.push(updatedPreset);
    }

    if (this.storage) {
      try {
        const text = serializePresets(existing);
        this.storage.setItem(PRESETS_STORAGE_KEY, text);
        this.storageError = null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to persist presets to storage.";
        throw new Any2orcaError("invalid_preset", msg);
      }
    }

    this.aboveStockCache.delete(name.toLowerCase());
  }

  deletePreset(name: string): void {
    const target = (name || "").trim().toLowerCase();
    if (!target) return;

    const existing = this.listPresets();
    if (this.storageError) {
      throw new Any2orcaError(
        "invalid_preset",
        "Your saved presets couldn't be read. Export or clear them before deleting."
      );
    }
    const filtered = existing.filter((item) => item.name.toLowerCase() !== target);

    if (this.storage) {
      try {
        const text = serializePresets(filtered);
        this.storage.setItem(PRESETS_STORAGE_KEY, text);
        this.storageError = null;
      } catch {
        // Storage access restriction
      }
    }

    this.aboveStockCache.delete(target);
  }

  getRawStorage(): string | null {
    if (!this.storage) return null;
    return this.storage.getItem(PRESETS_STORAGE_KEY);
  }

  clearStorage(): void {
    if (!this.storage) return;
    this.storage.removeItem(PRESETS_STORAGE_KEY);
    this.storageError = null;
    this.aboveStockCache.clear();
  }

  exportPresets(names?: string[]): string {
    const list = this.listPresets();
    let exportList = list;
    if (Array.isArray(names) && names.length > 0) {
      const set = new Set(names.map((n) => n.trim().toLowerCase()));
      exportList = list.filter((p) => set.has(p.name.toLowerCase()));
    }
    return serializePresets(exportList);
  }

  async resolvePreset(preset: Preset): Promise<ResolvedPreset> {
    return this.workerProvider().resolvePreset(toPlain(preset), this.releaseProvider());
  }

  async isAboveStock(preset: Preset): Promise<boolean> {
    // Stock differs between releases, so the answer is kept per release.
    const key = preset.name ? `${this.releaseProvider().snapmakerOrcaVersion ?? ""}\u0000${preset.name.toLowerCase()}` : "";
    if (key && this.aboveStockCache.has(key)) {
      return this.aboveStockCache.get(key)!;
    }

    try {
      const resolved = await this.resolvePreset(toPlain(preset));
      const above = resolved.described.some((c) => c.aboveStock);
      if (key) {
        this.aboveStockCache.set(key, above);
      }
      return above;
    } catch {
      // Do not cache failure as false: show nothing and do not cache
      return false;
    }
  }

  async matchProfileForFile(file: File): Promise<string | null> {
    if (!file || !(file instanceof File)) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { project } = await this.workerProvider().open(bytes);
    try {
      const choice = await project.matchProfile(this.releaseProvider());
      return choice?.profileId ?? null;
    } catch {
      return null;
    } finally {
      await project.close();
    }
  }

  async extractPreset(file: File): Promise<ExtractedPreset> {
    if (!file || !(file instanceof File)) {
      throw new Any2orcaError("invalid_file", "A valid 3MF file must be provided.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { project } = await this.workerProvider().open(bytes);
    try {
      return await project.extractPreset(this.releaseProvider());
    } finally {
      await project.close();
    }
  }

  async diff(
    a: File | { stock: string } | { preset: string },
    b: File | { stock: string } | { preset: string },
    options?: DiffOptions
  ): Promise<SettingsDiff> {
    const toClose: WorkerProject[] = [];

    const resolveSide = async (
      side: File | { stock: string } | { preset: string }
    ) => {
      if (side instanceof File) {
        const bytes = new Uint8Array(await side.arrayBuffer());
        const { project } = await this.workerProvider().open(bytes);
        toClose.push(project);
        return { project, label: side.name };
      }
      if ("stock" in side && typeof side.stock === "string") {
        return { stock: side.stock };
      }
      if ("preset" in side) {
        if (typeof side.preset === "string") {
          const found = this.listPresets().find(
            (p) => p.name.toLowerCase() === side.preset.trim().toLowerCase()
          );
          if (!found) {
            throw new Any2orcaError("invalid_preset", `Preset "${side.preset}" not found.`);
          }
          return { preset: toPlain(found) };
        } else if (side.preset && typeof side.preset === "object") {
          return { preset: toPlain(side.preset as Preset) };
        }
      }
      throw new Any2orcaError("invalid_file", "Unknown diff target.");
    };

    try {
      const sideA = await resolveSide(a);
      const sideB = await resolveSide(b);
      return await this.workerProvider().diff(sideA, sideB, { ...options, ...this.releaseProvider() });
    } finally {
      for (const p of toClose) {
        try {
          await p.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  async stockProfiles(): Promise<Array<{ id: string; displayName: string }>> {
    const release = this.releaseProvider();
    const key = release.snapmakerOrcaVersion ?? "";
    const cached = this.cachedStockProfiles.get(key);
    if (cached) {
      return cached;
    }
    const listing = await this.workerProvider().listProfiles(release);
    const profiles = listing.profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
    }));
    this.cachedStockProfiles.set(key, profiles);
    return profiles;
  }
}

export const presetsEngine: PresetsEngine = new RealPresetsEngine();
