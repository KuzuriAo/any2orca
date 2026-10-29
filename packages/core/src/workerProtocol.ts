// SPDX-License-Identifier: MIT
/** Messages between `any2orca/worker` and the worker script. Internal; may change in any release. */
import type { DiffOptions } from "./diff/diffSettings.js";
import type { Any2orcaErrorCode } from "./errors.js";
import type { ConvertStage } from "./project.js";
import type { Preset } from "./presets/preset.js";

export type WorkerConvertOptions = {
  profileId?: string;
  highFlowHotends?: boolean | readonly boolean[];
  hardenedNozzles?: boolean;
  filamentComplianceMode?: "generic" | "snapmaker";
  stamp?: boolean;
  /** Also put every settings difference in `report.whatChanged.diff`. */
  explain?: boolean;
  /** For values above stock: settings to keep at the creator's value, and to set to stock (checked in the worker). */
  aboveStock?: { keep?: readonly string[]; stock?: readonly string[] };
  /** Convert onto the preset's base profile with its print settings (checked in the worker). Not with `profileId`. */
  preset?: Preset;
};

/** One side of a settings diff in the worker: an open project, a stock profile by id, or a preset. */
export type WorkerDiffSide = { handle: number; label: string } | { stock: string } | { preset: Preset };

export type WorkerRequest =
  | { id: number; op: "configure"; profilesUrl: string }
  | { id: number; op: "listProfiles"; filter?: { nozzleDiameter?: string } }
  | { id: number; op: "open"; bytes: ArrayBuffer | Uint8Array }
  | { id: number; op: "matchProfile"; handle: number }
  | { id: number; op: "convert"; handle: number; options: WorkerConvertOptions }
  | { id: number; op: "close"; handle: number }
  | { id: number; op: "unwrapBundle"; bytes: ArrayBuffer | Uint8Array }
  | { id: number; op: "diff"; a: WorkerDiffSide; b: WorkerDiffSide; options: DiffOptions }
  | { id: number; op: "extractPreset"; handle: number }
  | { id: number; op: "resolvePreset"; preset: Preset };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { code: Any2orcaErrorCode; message: string } }
  | { id: number; progress: ConvertStage };
