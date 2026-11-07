// SPDX-License-Identifier: MIT

/**
 * What went wrong, as a stable code a UI can branch on:
 * - `invalid_file`: not a readable 3MF (corrupt zip, missing project files, unsafe entries).
 * - `unsupported_slicer`: a readable project from a slicer this doesn't convert (SuperSlicer, say, or an older AnycubicSlicer, both built on PrusaSlicer); `slicer` names it.
 * - `too_large`: a project that unpacks to more than the size limit (2 GB by default; `maxUnpackedBytes` changes it).
 * - `invalid_project`: a readable 3MF whose settings or objects are malformed or over a limit.
 * - `profile_not_found`: the requested profile id isn't in the catalog and wasn't retired.
 * - `release_not_found`: the requested Snapmaker Orca release isn't one the profile catalog holds.
 * - `profile_data`: the profile catalog itself is missing or malformed.
 * - `invalid_preset`: a preset or presets file that is malformed, over a limit, or can't be used with the given options.
 * - `preset_base_unknown`: a file a preset can't be made from, because it isn't set up for a profile in the catalog.
 */
export const ANY2ORCA_ERROR_CODES = [
  "invalid_file",
  "unsupported_slicer",
  "too_large",
  "invalid_project",
  "profile_not_found",
  "release_not_found",
  "profile_data",
  "invalid_preset",
  "preset_base_unknown",
] as const;
export type KnownAny2orcaErrorCode = (typeof ANY2ORCA_ERROR_CODES)[number];
/** One of {@link ANY2ORCA_ERROR_CODES}, or a code a later any2orca release added: treat one you don't recognize as a failure of the same kind as `invalid_file`. */
export type Any2orcaErrorCode = KnownAny2orcaErrorCode | (string & {});

export class Any2orcaError extends Error {
  override name = "Any2orcaError";
  readonly code: Any2orcaErrorCode;
  /** With `unsupported_slicer`: the slicer the project names, as the message shows it. */
  readonly slicer?: string;

  constructor(code: Any2orcaErrorCode, message: string, options?: { cause?: unknown; slicer?: string }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    if (options?.slicer !== undefined) this.slicer = options.slicer;
  }
}
