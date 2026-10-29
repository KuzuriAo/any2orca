// SPDX-License-Identifier: MIT

/**
 * What went wrong, as a stable code a UI can branch on:
 * - `invalid_file`: not a readable 3MF (corrupt zip, missing project files, unsafe entries).
 * - `too_large`: a project that unpacks to more than the size limit (2 GB by default; `maxUnpackedBytes` changes it).
 * - `invalid_project`: a readable 3MF whose settings or objects are malformed or over a limit.
 * - `profile_not_found`: the requested profile id isn't in the catalog and wasn't retired.
 * - `profile_data`: the profile catalog itself is missing or malformed.
 * - `invalid_preset`: a preset or presets file that is malformed, over a limit, or can't be used with the given options.
 * - `preset_base_unknown`: a file a preset can't be made from, because it isn't set up for a profile in the catalog.
 */
export type Any2orcaErrorCode = "invalid_file" | "too_large" | "invalid_project" | "profile_not_found" | "profile_data" | "invalid_preset" | "preset_base_unknown";

export class Any2orcaError extends Error {
  override name = "Any2orcaError";
  readonly code: Any2orcaErrorCode;

  constructor(code: Any2orcaErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}
