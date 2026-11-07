// SPDX-License-Identifier: MIT
/**
 * any2orca: convert Bambu Studio, Creality Print, Anycubic Slicer Next,
 * ElegooSlicer, Flash Studio, QIDI Studio and PrusaSlicer 3MF projects for the Snapmaker U1
 * (Snapmaker Orca), entirely in the caller's own process. The library makes no network
 * requests of its own; profile data comes from a {@link ProfileSource} the
 * caller provides.
 *
 * Runs in browsers, Web Workers and Node. For Node file-based profile
 * sources see `any2orca/node`; for a ready-made Web Worker see
 * `any2orca/worker`.
 */

export { convert, inspect, openProject, matchProfile, unwrapBundle, Project, CONVERT_STAGES } from "./project.js";
export type { ConvertOptions, ConvertReport, ConvertResult, ConvertStage, KnownConvertStage, OpenOptions, ProfileChoice, ReportFilament, ReportFilamentPreset } from "./project.js";
export { DEFAULT_MAX_UNPACKED_BYTES, LARGE_PROJECT_BYTES, MAX_UNPACKED_BYTES_LIMIT } from "./archive/safeUnzip.js";

export { SOURCE_VENDORS } from "./inspect.js";
export type { FilamentSlotInfo, Inspection, KnownSourceVendor, SourceVendor } from "./inspect.js";
export { SOURCE_FORMATS } from "./sources/reader.js";
export type { KnownSourceFormat, SourceFormat } from "./sources/reader.js";
export { SUPPORTED_NOZZLE_DIAMETERS } from "./engine/detectNozzleDiameter.js";
export type { KnownNozzleDiameter, SupportedNozzleDiameter } from "./engine/detectNozzleDiameter.js";

export { fetchProfileSource, listProfiles, loadCatalog, memoryProfileSource, ProfileCatalog, ProfileDataError } from "./profiles.js";
export type {
  MemoryCatalogData,
  ProfileIndex,
  ProfileIndexPrinter,
  ProfileIndexProfile,
  ProfileIndexRelease,
  ProfileIndexSource,
  ProfileSource,
  ProfileSummary,
  RetiredProfile,
  SlicerRelease,
} from "./profiles.js";

export { resolveFilamentName } from "./engine/filamentComplianceNames.js";
export type {
  FilamentComplianceMode,
  FilamentLine,
  FilamentNameResult,
  FilamentNameTable,
  FilamentPresetEntry,
} from "./engine/filamentComplianceNames.js";
export type { FilamentColorMatch, FilamentColorVendor } from "./archive/lookupFilamentColorName.js";
export type { BundleEntry } from "./archive/unwrapBundle.js";

export { Any2orcaError, ANY2ORCA_ERROR_CODES } from "./errors.js";
export type { Any2orcaErrorCode, KnownAny2orcaErrorCode } from "./errors.js";

export { decodeStamp, STAMP_PATH } from "./stamp.js";
export type { OutputStampAboveStock, OutputStampPreset } from "./stamp.js";

export { diffSettings, DIFF_ATTENTIONS, DIFF_STATUSES } from "./diff/diffSettings.js";
export { valueLayoutNotes, VALUE_LAYOUTS } from "./diff/valueLayout.js";
export type { KnownValueLayout, ValueLayout } from "./diff/valueLayout.js";
export type {
  DiffAttention,
  DiffGroup,
  DiffGroupName,
  DiffOptions,
  DiffRow,
  DiffStatus,
  KnownDiffAttention,
  KnownDiffStatus,
  SettingsDiff,
  SettingsSide,
} from "./diff/diffSettings.js";
export { diffReference, presetDiffSide, stockDiffSide } from "./diff/reference.js";
export type { SettingGroup, SettingInfo } from "./diff/settingsCatalog.js";

export { formatWhatChanged, CHANGE_REASONS } from "./explain/whatChanged.js";
export { filamentNotes } from "./explain/filamentNotes.js";
export type { ChangeGroup, ChangeItem, ChangeReason, KnownChangeReason, WhatChanged } from "./explain/whatChanged.js";

export { extractPreset } from "./presets/extractPreset.js";
export { parsePresetFile, serializePresets, resolvePreset, withoutChanges, MAX_PRESET_NAME_LENGTH, MAX_PRESETS_PER_FILE, MAX_PRESETS_FILE_BYTES } from "./presets/preset.js";
export type { ExtractedPreset, Preset, PresetChange, PresetFile, PresetValue, ResolvedPreset } from "./presets/preset.js";
export type { AboveStockChoice, AboveStockDefault } from "./engine/aboveStock.js";
export type { OutputStamp } from "./stamp.js";

export { buildStatsEvent, parseStatsEvent, receiveStatsEvent, resolveStatsConsent, STATS_MATCH_SOURCES } from "./telemetry.js";
export type { KnownStatsMatchSource, StatsConsent, StatsConsentState, StatsEvent, StatsEventInput, StatsMatchSource } from "./telemetry.js";

export { MATCH_SOURCES } from "./schema.js";
export type { ConvertObject, HighFlowHotends, KnownMatchSource, MatchSource, ProfileMatch, Shifts } from "./schema.js";

export { plainText } from "./plainText.js";
export { VERSION } from "./version.js";
