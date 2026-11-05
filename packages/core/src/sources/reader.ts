// SPDX-License-Identifier: MIT
/**
 * A source reader turns one slicer family's project files into the one shape
 * the rest of the converter works on: the conversion request (the project's
 * settings in Snapmaker Orca's keys, plus every top-level object's bounding
 * box, plate and name) and the zip entries laid out the way the writer expects
 * (the Bambu Studio family's layout: `Metadata/project_settings.config`,
 * `Metadata/model_settings.config`, `3D/3dmodel.model`). Everything after a
 * reader, the pipeline and the writer, is the same for every source.
 *
 * Readers are tried in order; the first whose `detect` says yes reads the file.
 */
import type { ConvertRequest } from "../schema.js";

/** The slicer family a project came from. */
export type SourceFormat = "bambu-family" | "prusaslicer";

/**
 * What a PrusaSlicer project keeps for the step that needs profile data
 * (`convert()`, once the catalog is loaded): the project's settings in
 * PrusaSlicer's own keys and value forms, which Snapmaker Orca keys each
 * wrote, and the preset names it recorded.
 */
export interface PrusaProjectInfo {
  /** The PrusaSlicer version that saved the project ("2.9.6"), from the settings file's first line; null when unreadable. */
  version: string | null;
  settings: ReadonlyMap<string, string>;
  targets: ReadonlyMap<string, readonly string[]>;
  presets: { print: string; printer: string; filaments: readonly string[] };
  /** The vendor keyword from `printer_notes` ("PRUSA3D"), when the printer profile names one. */
  vendorKeyword: string | null;
}

export interface ParsedProject {
  /** Which reader read the file. */
  source: SourceFormat;
  /** Present for a PrusaSlicer project. */
  prusa?: PrusaProjectInfo;
  /** The full decompressed source zip, kept for applyConvertResponse's final reassembly. */
  zipEntries: Record<string, Uint8Array>;
  /** The conversion request payload. */
  request: ConvertRequest;
  /** Non-fatal notes collected while parsing (e.g. tolerantJsonParse's trailing-content note), for surfacing in the UI. */
  warnings: string[];
  /** The project's unpacked size, every entry together. */
  unpackedBytes: number;
}

export interface ReadContext {
  /** The project's unpacked size, every entry together (already checked against the cap). */
  unpackedBytes: number;
  /** Where the reader appends its non-fatal notes; may already hold the size warning. */
  warnings: string[];
}

export interface SourceReader {
  readonly format: SourceFormat;
  /** Whether these zip entries are this reader's format. Cheap: a look at which files exist. */
  detect(entries: Record<string, Uint8Array>): boolean;
  /**
   * Reads the project. Throws an `Any2orcaError` (`invalid_file`, `invalid_project`) for a file of this format
   * that can't be read; never for a file of another format, which `detect` has already said no to.
   */
  read(entries: Record<string, Uint8Array>, context: ReadContext): ParsedProject;
}
