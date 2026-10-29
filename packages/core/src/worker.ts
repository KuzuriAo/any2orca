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
import type { ProfileSummary } from "./profiles.js";
import type { ConvertReport, ConvertStage, ProfileChoice } from "./project.js";
import type { DiffOptions, SettingsDiff } from "./diff/diffSettings.js";
import type { ExtractedPreset, Preset, ResolvedPreset } from "./presets/preset.js";
import type { WorkerConvertOptions, WorkerRequest, WorkerResponse } from "./workerProtocol.js";

/** The parts of a Worker this needs, so tests and other runtimes can supply their own. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  terminate(): void;
}

export interface WorkerConvertResult {
  output: Uint8Array;
  report: ConvertReport;
}

export interface WorkerProject {
  readonly inspection: Inspection;
  /** The profile auto-matching would pick. */
  matchProfile(): Promise<ProfileChoice>;
  convert(options?: WorkerConvertOptions & { onProgress?: (stage: ConvertStage) => void }): Promise<WorkerConvertResult>;
  /** Makes a preset from this file, as a file the user tuned in Snapmaker Orca (see `extractPreset`). */
  extractPreset(): Promise<ExtractedPreset>;
  /** Frees the worker's copy of the file. */
  close(): Promise<void>;
}

/** One side of a settings diff: an open project (with the name to show for it), Snapmaker's stock profile by id, or a preset as it converts. */
export type DiffSide = { project: WorkerProject; label: string } | { stock: string } | { preset: Preset };

export interface ProfileListing {
  profiles: ProfileSummary[];
  /** The catalog's version, e.g. "0.1.0". */
  dataVersion: string;
  /** The upstream release the catalog tracks. */
  slicer: { name: string; version: string };
  defaultProfileId: string;
}

export interface ConverterWorker {
  /**
   * Opens a file in the worker. Pass `transfer: true` to move the bytes
   * instead of copying them (faster for large files, but the caller's
   * buffer becomes unusable).
   */
  open(bytes: Uint8Array, options?: { transfer?: boolean }): Promise<{ project: WorkerProject; inspection: Inspection }>;
  listProfiles(filter?: { nozzleDiameter?: string }): Promise<ProfileListing>;
  /** Compares the settings of two sides (open projects or stock profiles), in the worker. */
  diff(a: DiffSide, b: DiffSide, options?: DiffOptions): Promise<SettingsDiff>;
  /**
   * Checks a saved or imported preset against the current profiles: the
   * profile it converts with, the changes it would apply (with values above
   * stock marked, for a badge) and notes on anything it would leave out.
   */
  resolvePreset(preset: Preset): Promise<ResolvedPreset>;
  /** Each .3mf inside a bundle zip, or null for a plain .3mf. */
  unwrapBundle(bytes: Uint8Array): Promise<Array<{ name: string; bytes: Uint8Array }> | null>;
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

  worker.addEventListener("message", (event) => {
    const message = event.data as WorkerResponse;
    const entry = pending.get(message?.id);
    if (!entry) return;
    if ("progress" in message) {
      entry.onProgress?.(message.progress);
      return;
    }
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Any2orcaError(message.error.code as Any2orcaErrorCode, message.error.message));
  });

  function call<T>(body: RequestBody, transfer: Transferable[] = [], onProgress?: (stage: ConvertStage) => void): Promise<T> {
    if (terminated) return Promise.reject(new Error("The converter worker has been terminated."));
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
      worker.postMessage({ ...body, id }, transfer);
    });
  }

  // Resolved against the page, since a relative URL means something else inside the worker.
  const profilesUrl = new URL(String(options.profilesUrl), globalThis.location?.href).href;
  void call({ op: "configure", profilesUrl });

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
      matchProfile: () => call<ProfileChoice>({ op: "matchProfile", handle }),
      async convert(convertOptions = {}) {
        const { onProgress, ...rest } = convertOptions;
        const result = await call<{ output: ArrayBuffer; byteOffset: number; byteLength: number; report: ConvertReport }>(
          { op: "convert", handle, options: rest },
          [],
          onProgress,
        );
        return { output: new Uint8Array(result.output, result.byteOffset, result.byteLength), report: result.report };
      },
      extractPreset: () => call<ExtractedPreset>({ op: "extractPreset", handle }),
      close: () => call<void>({ op: "close", handle }),
    };
    handles.set(opened, handle);
    return opened;
  }

  return {
    async open(bytes, openOptions = {}) {
      // Either way only one buffer crosses: the caller's own (transfer) or a fresh copy.
      const ownsWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
      const payload = openOptions.transfer && ownsWholeBuffer ? bytes : bytes.slice();
      const { handle, inspection } = await call<{ handle: number; inspection: Inspection }>({ op: "open", bytes: payload }, [payload.buffer as ArrayBuffer]);
      return { project: project(handle, inspection), inspection };
    },
    async diff(a, b, diffOptions = {}) {
      return call<SettingsDiff>({ op: "diff", a: toWire(a), b: toWire(b), options: diffOptions });
    },
    resolvePreset: (preset) => call<ResolvedPreset>({ op: "resolvePreset", preset }),
    listProfiles: (filter) => call<ProfileListing>({ op: "listProfiles", ...(filter ? { filter } : {}) }),
    unwrapBundle: (bytes) => call<Array<{ name: string; bytes: Uint8Array }> | null>({ op: "unwrapBundle", bytes }),
    terminate() {
      terminated = true;
      worker.terminate();
      for (const entry of pending.values()) entry.reject(new Error("The converter worker was terminated."));
      pending.clear();
    },
  };
}

export type { WorkerConvertOptions } from "./workerProtocol.js";
export type { DiffOptions, SettingsDiff } from "./diff/diffSettings.js";
export type { ExtractedPreset, Preset, PresetChange, ResolvedPreset } from "./presets/preset.js";
