// SPDX-License-Identifier: MIT
/**
 * The script that runs inside the Web Worker. Load it with your bundler's
 * worker support and hand the Worker to `createConverterWorker()` from
 * `any2orca/worker`; don't post messages to it directly, the protocol
 * isn't a public API.
 *
 *   Vite:     import ConverterWorker from "any2orca/worker-entry?worker";
 *   Others:   new Worker(new URL("any2orca/worker-entry", import.meta.url), { type: "module" })
 *
 * Opened projects stay in the worker's memory until closed. At most
 * MAX_OPEN_PROJECTS are kept; opening more closes the oldest.
 */
import { diffSettings, type DiffOptions } from "./diff/diffSettings.js";
import { diffReference, presetDiffSide } from "./diff/reference.js";
import { Any2orcaError } from "./errors.js";
import { extractPreset } from "./presets/extractPreset.js";
import { resolvePreset, type Preset } from "./presets/preset.js";
import { fetchProfileSource, loadCatalog, type ProfileSource } from "./profiles.js";
import { Project, unwrapBundle } from "./project.js";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol.js";

const MAX_OPEN_PROJECTS = 16;

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = globalThis as unknown as WorkerScope;

let profiles: ProfileSource | null = null;
const projects = new Map<number, Project>();
let nextHandle = 1;

function requireProfiles(): ProfileSource {
  if (!profiles) throw new Any2orcaError("profile_data", "The worker has no profile catalog configured.");
  return profiles;
}

function requireProject(handle: unknown): Project {
  const project = typeof handle === "number" ? projects.get(handle) : undefined;
  if (!project) throw new Any2orcaError("invalid_file", "This file is no longer open in the worker; open it again.");
  return project;
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  throw new Any2orcaError("invalid_file", "Expected file bytes.");
}

function isRequest(data: unknown): data is WorkerRequest {
  return typeof data === "object" && data !== null && typeof (data as { id?: unknown }).id === "number" && typeof (data as { op?: unknown }).op === "string";
}

async function handle(request: WorkerRequest): Promise<{ result: unknown; transfer: Transferable[] }> {
  switch (request.op) {
    case "configure": {
      profiles = fetchProfileSource(request.profilesUrl);
      return { result: null, transfer: [] };
    }
    case "listProfiles": {
      const catalog = await loadCatalog(requireProfiles());
      const { dataVersion, slicer, defaultProfileId } = catalog.index;
      return { result: { profiles: catalog.list(request.filter ?? {}), dataVersion, slicer, defaultProfileId }, transfer: [] };
    }
    case "open": {
      const project = Project.open(toBytes(request.bytes));
      const handle = nextHandle++;
      projects.set(handle, project);
      while (projects.size > MAX_OPEN_PROJECTS) projects.delete(projects.keys().next().value as number);
      return { result: { handle, inspection: project.inspect() }, transfer: [] };
    }
    case "matchProfile": {
      return { result: await requireProject(request.handle).matchProfile(requireProfiles()), transfer: [] };
    }
    case "convert": {
      const project = requireProject(request.handle);
      const { output, report } = await project.convert({
        ...request.options,
        profiles: requireProfiles(),
        onProgress: (stage) => scope.postMessage({ id: request.id, progress: stage }),
      });
      const buffer = output.buffer as ArrayBuffer;
      return { result: { output: buffer, byteOffset: output.byteOffset, byteLength: output.byteLength, report }, transfer: [buffer] };
    }
    case "close": {
      projects.delete(request.handle);
      return { result: null, transfer: [] };
    }
    case "diff": {
      const side = async (s: unknown) => {
        if (typeof s === "object" && s !== null && "preset" in s) {
          // A preset as it converts: its base profile's stock settings with its changes written over them.
          return presetDiffSide((s as { preset: Preset }).preset, await loadCatalog(requireProfiles()));
        }
        if (typeof s === "object" && s !== null && "stock" in s && typeof (s as { stock: unknown }).stock === "string") {
          const loaded = await loadCatalog(requireProfiles()).then((c) => c.load((s as { stock: string }).stock));
          return { label: `Snapmaker's stock ${loaded.summary.displayName} profile`, settings: loaded.convertProfile.profile.baselineProjectSettings, profileId: loaded.summary.id };
        }
        const { handle: h, label } = (s ?? {}) as { handle?: unknown; label?: unknown };
        const project = requireProject(h);
        return { label: typeof label === "string" ? label.slice(0, 256) : "project", settings: project.settings(), project };
      };
      const options = (request.options ?? {}) as DiffOptions;
      const safe: DiffOptions = {
        ...(Array.isArray(options.groups) ? { groups: options.groups.filter((g) => ["print", "filament", "machine", "other"].includes(g)) } : {}),
        includeUnchanged: options.includeUnchanged === true,
        includeBookkeeping: options.includeBookkeeping === true,
      };
      const a = await side(request.a);
      const b = await side(request.b);
      // Values are measured against the stock or preset side's profile, else the profile the first file would convert with.
      const catalog = await loadCatalog(requireProfiles());
      const known = "profileId" in b ? b.profileId : "profileId" in a ? a.profileId : undefined;
      const project = "project" in a ? a.project : "project" in b ? b.project : undefined;
      const profileId = known ?? (project ? (await project.matchProfile(catalog)).profileId : catalog.index.defaultProfileId);
      return { result: diffSettings(a, b, { ...safe, reference: await diffReference(catalog, profileId) }), transfer: [] };
    }
    case "extractPreset": {
      return { result: await extractPreset(requireProject(request.handle), { profiles: requireProfiles() }), transfer: [] };
    }
    case "resolvePreset": {
      return { result: await resolvePreset(request.preset, await loadCatalog(requireProfiles())), transfer: [] };
    }
    case "unwrapBundle": {
      const entries = unwrapBundle(toBytes(request.bytes));
      if (!entries) return { result: null, transfer: [] };
      // Copy each entry into its own buffer so it can be transferred alone.
      const copies = entries.map((e) => ({ name: e.name, bytes: e.bytes.slice() }));
      return { result: copies, transfer: copies.map((c) => c.bytes.buffer as ArrayBuffer) };
    }
    default:
      throw new Any2orcaError("invalid_file", "Unknown worker request.");
  }
}

scope.onmessage = (event) => {
  const data = event.data;
  if (!isRequest(data)) return;
  handle(data).then(
    ({ result, transfer }) => scope.postMessage({ id: data.id, ok: true, result }, transfer),
    (err: unknown) =>
      scope.postMessage({
        id: data.id,
        ok: false,
        error: {
          code: err instanceof Any2orcaError ? err.code : "invalid_file",
          message: err instanceof Error ? err.message : String(err),
        },
      }),
  );
};
