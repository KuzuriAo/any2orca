// SPDX-License-Identifier: MIT
/**
 * any2orca/worker: run conversions in a Web Worker behind a promise API,
 * so a large file never blocks the page.
 *
 *   import { createConverterWorker } from "any2orca/worker";
 *   import ConverterWorker from "any2orca/worker-entry?worker"; // Vite
 *
 *   const converter = createConverterWorker(new ConverterWorker(), { profilesUrl: "/profiles/" });
 *   const { project, inspection } = await converter.open(fileBytes);
 *   const { output, report } = await project.convert({ highFlowHotends: false });
 *
 * `profilesUrl` points at a copy of `any2orca-profiles`' `data/` folder,
 * normally served by the same site. The worker fetches `index.json` and
 * only the profile files it needs; it makes no other request.
 */
import { Any2orcaError, type Any2orcaErrorCode } from "./errors.js";
import type { Inspection } from "./inspect.js";
import type { ProfileSummary, SlicerRelease } from "./profiles.js";
import type { ConvertReport, ConvertStage, ProfileChoice } from "./project.js";
import type { DiffOptions, SettingsDiff } from "./diff/diffSettings.js";
import type { ExtractedPreset, Preset, ResolvedPreset } from "./presets/preset.js";
import type { WorkerConvertOptions, WorkerReleaseOption, WorkerRequest, WorkerResponse } from "./workerProtocol.js";

/**
 * The parts of a Worker this needs, so tests and other runtimes can supply
 * their own. Besides `message`, a real Worker's `error` and `messageerror`
 * events are listened to: when the worker fails to load or stops (out of
 * memory, say), every pending call is rejected instead of waiting forever.
 * An implementation that has no such events can ignore those listeners.
 */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: (event: { data?: unknown; type?: string; message?: string }) => void): void;
  terminate(): void;
}

export interface WorkerConvertResult {
  output: Uint8Array;
  report: ConvertReport;
}

export interface WorkerProject {
  readonly inspection: Inspection;
  /** The profile auto-matching would pick, for the newest release or the one given. */
  matchProfile(options?: WorkerReleaseOption): Promise<ProfileChoice>;
  convert(options?: WorkerConvertOptions & { onProgress?: (stage: ConvertStage) => void }): Promise<WorkerConvertResult>;
  /** Makes a preset from this file, as a file the user tuned in Snapmaker Orca (see `extractPreset`). */
  extractPreset(options?: WorkerReleaseOption): Promise<ExtractedPreset>;
  /** Frees the worker's copy of the file. */
  close(): Promise<void>;
}

/** One side of a settings diff: an open project (with the name to show for it), Snapmaker's stock profile by id, or a preset as it converts. */
export type DiffSide = { project: WorkerProject; label: string } | { stock: string } | { preset: Preset };

export interface ProfileListing {
  profiles: ProfileSummary[];
  /** The catalog's version, e.g. "0.1.0". */
  dataVersion: string;
  /** The Snapmaker Orca release these profiles are for. */
  slicer: { name: string; version: string };
  defaultProfileId: string;
  /** Every Snapmaker Orca release the catalog holds, newest (the default) first: for a version picker. */
  releases: SlicerRelease[];
}

export interface ConverterWorker {
  /**
   * Opens a file in the worker. Pass `transfer: true` to move the bytes
   * instead of copying them (faster for large files, but the caller's
   * buffer becomes unusable).
   */
  open(bytes: Uint8Array, options?: { transfer?: boolean }): Promise<{ project: WorkerProject; inspection: Inspection }>;
  /** The profiles for the newest release or the one given, and every release the catalog holds. */
  listProfiles(filter?: { nozzleDiameter?: string } & WorkerReleaseOption): Promise<ProfileListing>;
  /** Compares the settings of two sides (open projects or stock profiles, for the release given), in the worker. */
  diff(a: DiffSide, b: DiffSide, options?: DiffOptions & WorkerReleaseOption): Promise<SettingsDiff>;
  /**
   * Checks a saved or imported preset against the current profiles: the
   * profile it converts with, the changes it would apply (with values above
   * stock marked, for a badge) and notes on anything it would leave out.
   */
  resolvePreset(preset: Preset, options?: WorkerReleaseOption): Promise<ResolvedPreset>;
  /**
   * Each .3mf inside a bundle zip, or null for a plain .3mf. Pass `transfer: true`
   * to move the bytes instead of copying them, as for `open`.
   */
  unwrapBundle(bytes: Uint8Array, options?: { transfer?: boolean }): Promise<Array<{ name: string; bytes: Uint8Array }> | null>;
  terminate(): void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (stage: ConvertStage) => void;
};

type RequestBody = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

export function createConverterWorker(worker: WorkerLike, options: { profilesUrl: string | URL }): ConverterWorker {
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let terminated = false;
  /** Set once the worker has failed: every later call is refused with this. */
  let failure: Error | null = null;

  // A worker that fails to load, or stops, answers nothing more: settle every pending call now.
  const onFailure = (event: { type?: string; message?: string }) => {
    if (event?.type !== "error" && event?.type !== "messageerror") return;
    const detail = typeof event.message === "string" && event.message ? ` (${event.message.slice(0, 200)})` : "";
    failure = new Error(
      event.type === "messageerror"
        ? `The converter couldn't read a reply from its worker${detail}. Reload the page to try again.`
        : `The converter stopped working${detail}. Reload the page to try again; a very large file may need more memory than the browser allows.`,
    );
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
  };
  worker.addEventListener("error", onFailure);
  worker.addEventListener("messageerror", onFailure);

  worker.addEventListener("message", (event) => {
    const message = event.data as WorkerResponse;
    const entry = pending.get(message?.id);
    if (!entry) return;
    if ("progress" in message) {
      entry.onProgress?.(message.progress);
      return;
    }
    pending.delete(message.id);
    if (message.ok === true) {
      entry.resolve(message.result);
      return;
    }
    // Read defensively: a reply without a usable error would otherwise throw here, after the entry is gone, and the
    // call would never settle.
    const error = (message as { error?: unknown }).error as { code?: unknown; message?: unknown; slicer?: unknown } | undefined;
    const code = typeof error?.code === "string" ? (error.code as Any2orcaErrorCode) : "invalid_file";
    const text = typeof error?.message === "string" ? error.message : "The converter's worker sent a reply it couldn't read.";
    entry.reject(new Any2orcaError(code, text, typeof error?.slicer === "string" ? { slicer: error.slicer } : undefined));
  });

  function call<T>(body: RequestBody, transfer: Transferable[] = [], onProgress?: (stage: ConvertStage) => void): Promise<T> {
    if (terminated) return Promise.reject(new Error("The converter worker has been terminated."));
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
      worker.postMessage({ ...body, id }, transfer);
    });
  }

  // Resolved against the page, since a relative URL means something else inside the worker.
  const profilesUrl = new URL(String(options.profilesUrl), globalThis.location?.href).href;
  // If the worker fails, the next call reports it; this one has no caller to tell.
  call({ op: "configure", profilesUrl }).catch(() => {});

  const handles = new WeakMap<WorkerProject, number>();
  const toWire = (side: DiffSide) => {
    if ("stock" in side) return { stock: side.stock };
    if ("preset" in side) return { preset: side.preset };
    const handle = handles.get(side.project);
    if (handle === undefined) throw new Any2orcaError("invalid_file", "That project wasn't opened by this converter.");
    return { handle, label: side.label };
  };

  function project(handle: number, inspection: Inspection): WorkerProject {
    const opened: WorkerProject = {
      inspection,
      matchProfile: (release) => call<ProfileChoice>({ op: "matchProfile", handle, ...releaseField(release) }),
      async convert(convertOptions = {}) {
        const { onProgress, ...rest } = convertOptions;
        const result = await call<{ output: ArrayBuffer; byteOffset: number; byteLength: number; report: ConvertReport }>(
          { op: "convert", handle, options: rest },
          [],
          onProgress,
        );
        return { output: new Uint8Array(result.output, result.byteOffset, result.byteLength), report: result.report };
      },
      extractPreset: (release) => call<ExtractedPreset>({ op: "extractPreset", handle, ...releaseField(release) }),
      close: () => call<void>({ op: "close", handle }),
    };
    handles.set(opened, handle);
    return opened;
  }

  return {
    async open(bytes, openOptions = {}) {
      const payload = outgoing(bytes, openOptions.transfer);
      const { handle, inspection } = await call<{ handle: number; inspection: Inspection }>({ op: "open", bytes: payload }, [payload.buffer as ArrayBuffer]);
      return { project: project(handle, inspection), inspection };
    },
    async diff(a, b, diffOptions = {}) {
      const { snapmakerOrcaVersion, ...options } = diffOptions;
      return call<SettingsDiff>({ op: "diff", a: toWire(a), b: toWire(b), options, ...releaseField({ snapmakerOrcaVersion }) });
    },
    resolvePreset: (preset, release) => call<ResolvedPreset>({ op: "resolvePreset", preset, ...releaseField(release) }),
    listProfiles: (filter) => call<ProfileListing>({ op: "listProfiles", ...(filter ? { filter } : {}) }),
    unwrapBundle(bytes, bundleOptions = {}) {
      const payload = outgoing(bytes, bundleOptions.transfer);
      return call<Array<{ name: string; bytes: Uint8Array }> | null>({ op: "unwrapBundle", bytes: payload }, [payload.buffer as ArrayBuffer]);
    },
    terminate() {
      terminated = true;
      worker.terminate();
      for (const entry of pending.values()) entry.reject(new Error("The converter worker was terminated."));
      pending.clear();
    },
  };
}

/**
 * The bytes to post: the caller's own buffer when it may be moved and the
 * view covers all of it, otherwise a fresh copy. Either way only one buffer
 * crosses to the worker.
 */
function outgoing(bytes: Uint8Array, transfer: boolean | undefined): Uint8Array {
  const ownsWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return transfer && ownsWholeBuffer ? bytes : bytes.slice();
}

/** The release field for a request, left out when no release is named. */
function releaseField(release: WorkerReleaseOption | undefined): { release?: WorkerReleaseOption } {
  return release?.snapmakerOrcaVersion === undefined ? {} : { release: { snapmakerOrcaVersion: release.snapmakerOrcaVersion } };
}

export type { WorkerConvertOptions, WorkerReleaseOption } from "./workerProtocol.js";
export type { SlicerRelease } from "./profiles.js";
export type { DiffOptions, SettingsDiff } from "./diff/diffSettings.js";
export type { ExtractedPreset, Preset, PresetChange, ResolvedPreset } from "./presets/preset.js";
