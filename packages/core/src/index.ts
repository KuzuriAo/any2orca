// SPDX-License-Identifier: MIT
/**
 * any2orca: convert Bambu Studio, Creality Print and Anycubic Slicer Next 3MF
 * projects for the Snapmaker U1 (Snapmaker Orca), entirely in the caller's own
 * process. The library makes no network requests of its own; profile data
 * comes from a {@link ProfileSource} the caller provides.
 *
 * Runs in browsers, Web Workers and Node. For Node file-based profile
 * sources see `any2orca/node`; for a ready-made Web Worker see
 * `any2orca/worker`.
 */

export { convert, inspect, openProject, matchProfile, unwrapBundle, cleanWarnings, Project } from "./project.js";
export type { ConvertOptions, ConvertReport, ConvertResult, ConvertStage, OpenOptions, ProfileChoice } from "./project.js";
export { DEFAULT_MAX_UNPACKED_BYTES, LARGE_PROJECT_BYTES, MAX_UNPACKED_BYTES_LIMIT } from "./archive/safeUnzip.js";

export type { FilamentSlotInfo, Inspection, SourceVendor } from "./inspect.js";

export {
  fetchProfileSource,
  listProfiles,
  loadCatalog,
  memoryProfileSource,
  ProfileCatalog,
  ProfileDataError,
  MAX_INDEX_BYTES,
  MAX_PROFILE_BYTES,
} from "./profiles.js";
export type { LoadedProfile, ProfileIndex, ProfileSource, ProfileSummary, RetiredProfile } from "./profiles.js";

export { parseTierName, normalizeTierName } from "./engine/parseTierName.js";
export { pickProfile } from "./engine/pickProfile.js";
export type { PickProfileResult, TierAwareProfileCandidate } from "./engine/pickProfile.js";
export { detectNozzleDiameter, SUPPORTED_NOZZLE_DIAMETERS } from "./engine/detectNozzleDiameter.js";
export { matchFilamentLine, resolveFilamentName } from "./engine/filamentComplianceNames.js";
export type {
  FilamentComplianceMode,
  FilamentLine,
  FilamentNameResult,
  FilamentNameTable,
  FilamentPresetEntry,
} from "./engine/filamentComplianceNames.js";
export { lookupFilamentColorName, parseFilamentType } from "./archive/lookupFilamentColorName.js";
export type { FilamentColorMatch } from "./archive/lookupFilamentColorName.js";
export type { BundleEntry } from "./archive/unwrapBundle.js";

export { Any2orcaError } from "./errors.js";
export type { Any2orcaErrorCode } from "./errors.js";

export { decodeStamp, OutputStampSchema, STAMP_PATH } from "./stamp.js";

export { diffSettings, labelOf, BOOKKEEPING_KEYS, MAX_DIFF_KEYS } from "./diff/diffSettings.js";
export { valueLayout, valueLayoutNotes, VALUE_LAYOUT_TEXT } from "./diff/valueLayout.js";
export type { ValueLayout } from "./diff/valueLayout.js";
export type { DiffAttention, DiffGroup, DiffGroupName, DiffOptions, DiffRow, DiffStatus, SettingsDiff, SettingsSide } from "./diff/diffSettings.js";
export { diffReference, presetDiffSide } from "./diff/reference.js";
export { SETTINGS_CATALOG, SETTINGS_CATALOG_SOURCE } from "./diff/settingsCatalog.js";
export type { SettingGroup, SettingInfo } from "./diff/settingsCatalog.js";

export { formatWhatChanged } from "./explain/whatChanged.js";
export type { ChangeGroup, ChangeItem, ChangeReason, WhatChanged } from "./explain/whatChanged.js";

export { extractPreset } from "./presets/extractPreset.js";
export {
  parsePresetFile,
  serializePresets,
  resolvePreset,
  presetFingerprint,
  withoutChanges,
  PresetSchema,
  PresetFileSchema,
  MAX_PRESET_NAME_LENGTH,
  MAX_PRESETS_PER_FILE,
  MAX_PRESETS_FILE_BYTES,
} from "./presets/preset.js";
export type { ExtractedPreset, Preset, PresetChange, PresetFile, PresetValue, ResolvedPreset } from "./presets/preset.js";
export { PRESET_KEYS, PRESET_EXCLUDED_KEYS } from "./presets/presetKeys.js";
export { ABOVE_STOCK_DEFAULTS } from "./engine/aboveStock.js";
export type { AboveStockChoice, AboveStockDefault } from "./engine/aboveStock.js";
export type { OutputStamp } from "./stamp.js";

export {
  buildStatsEvent,
  NEVER_SENT,
  NO_STATS_CHOICE,
  recordStatsChoice,
  REF_PATTERN,
  resolveStatsConsent,
  StatsEventSchema,
} from "./telemetry.js";
export type { StatsConsent, StatsConsentState, StatsEvent, StatsEventInput } from "./telemetry.js";

export type { ConvertObject, HighFlowHotends, MatchSource, ProfileMatch, Shifts } from "./schema.js";

export { plainText } from "./plainText.js";
export { VERSION } from "./version.js";
