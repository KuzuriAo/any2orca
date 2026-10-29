// SPDX-License-Identifier: MIT
/**
 * The engine's internal request/response shapes. The request is built and
 * consumed in the same process. They are zod schemas because the request
 * is built from a file someone dropped in, which is untrusted:
 * validating it bounds how much work a crafted file can cause.
 */
import { z } from "zod";
import { APPLICATION_VALUE } from "./archive/setApplicationMetadata.js";

/** A single top-level object's plate assignment and computed bounding box. */
export const ConvertObjectSchema = z.object({
  id: z.string().max(128),
  name: z.string().max(500).optional(),
  sequence: z.number().int().optional(),
  isAssembly: z.boolean().optional(),
  /** Omitted for objects with no plate metadata. */
  plate: z.number().int().optional(),
  /** [minX, maxX, minY, maxY], or null when no mesh geometry was found for this object. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  /** The item transform's raw translation, set only when bbox is null. */
  fallbackXy: z.tuple([z.number(), z.number()]).optional(),
});
export type ConvertObject = z.infer<typeof ConvertObjectSchema>;

/**
 * A parsed Metadata/project_settings.config: hundreds of slicer settings,
 * so open-shaped by key, with a cap on its serialized size. A real one runs
 * tens to a few hundred KB.
 */
export const MAX_PROJECT_SETTINGS_BYTES = 2 * 1024 * 1024;
export const ProjectSettingsSchema = z.record(z.string(), z.unknown()).refine(
  (settings) => JSON.stringify(settings).length <= MAX_PROJECT_SETTINGS_BYTES,
  { message: `project_settings.config is over the ${MAX_PROJECT_SETTINGS_BYTES} byte limit` },
);
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/** Far past any real multi-plate project; bounds the work one file can cause. */
export const MAX_OBJECTS = 1000;

export const FilamentComplianceModeSchema = z.enum(["generic", "snapmaker"]);

/** `true` for every toolhead, or exactly one entry per U1 toolhead, T1 to T4. */
export const HighFlowHotendsSchema = z.union([z.boolean(), z.array(z.boolean()).length(4)]);
export type HighFlowHotends = z.infer<typeof HighFlowHotendsSchema>;

export const ConvertRequestSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  objects: z.array(ConvertObjectSchema).max(MAX_OBJECTS),
  profileId: z.string().optional(),
  /**
   * Relabels each filament's identity (name/filament_settings_id) to a real
   * Generic or Snapmaker-brand preset, for marketplaces that require one.
   * Identity only: never touches temperatures, retraction or flow.
   */
  filamentComplianceMode: FilamentComplianceModeSchema.optional(),
  /**
   * Which toolheads have the Snapmaker Liber High Flow Hotend:
   * `true` for all, or one entry per toolhead (the U1 has four, T1 first).
   * Only applies where the nozzle supports it (today 0.4mm); see
   * engine/applyHighFlowHotends.ts.
   */
  highFlowHotends: HighFlowHotendsSchema.optional(),
  /** The nozzles are hardened steel, not the stock stainless steel (0.4 nozzle profile only). */
  hardenedNozzles: z.boolean().optional(),
});
export type ConvertRequest = z.infer<typeof ConvertRequestSchema>;

/** Other Metadata/*.config files to write into the output 3MF, keyed by archive path. */
export const ConfigFilesSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
export type ConfigFiles = z.infer<typeof ConfigFilesSchema>;

/** objectId -> [dx, dy] shift to apply to that object's transform. */
export const ShiftsSchema = z.record(z.string(), z.tuple([z.number(), z.number()]));
export type Shifts = z.infer<typeof ShiftsSchema>;

export const MatchSourceSchema = z.enum(["auto-tier-name", "auto-exact", "auto-nearest", "default-fallback"]);
export type MatchSource = z.infer<typeof MatchSourceSchema>;

export const ProfileMatchSchema = z.object({
  profileId: z.string(),
  nozzleDiameter: z.string(),
  exact: z.boolean(),
  /** The pick came from the source file's own tier name (e.g. "Extra Fine"), not nearest layer height. */
  matchedByTierName: z.boolean(),
  /**
   * "auto-tier-name"/"auto-exact" are confident; "auto-nearest" is the
   * closest available layer height; "default-fallback" means no match at
   * all, so the profile is just the catalog default.
   */
  matchSource: MatchSourceSchema,
});
export type ProfileMatch = z.infer<typeof ProfileMatchSchema>;

export const ConvertResponseSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  configFiles: ConfigFilesSchema,
  shifts: ShiftsSchema,
  /** What the target slicer writes as its Application at the pinned release (e.g. "Snapmaker_Orca-2.4.0"); replaces the source's. */
  application: z.string().regex(APPLICATION_VALUE),
  /** Present when the profile was auto-matched rather than chosen. */
  profileMatch: ProfileMatchSchema.optional(),
  /** Product lines that use Generic under `filamentComplianceMode: "snapmaker"`, because Snapmaker makes no preset for them at this nozzle size. */
  filamentComplianceFallback: z.array(z.string()).optional(),
  /** Product lines (or materials) whose names stayed as the creator had them under `filamentComplianceMode`, because no Snapmaker or Generic preset fits at this nozzle size. */
  filamentComplianceUnchanged: z.array(z.string()).optional(),
  /** Notes worth showing the user (each contains "WARN"). */
  warnings: z.array(z.string()).optional(),
});
export type ConvertResponse = z.infer<typeof ConvertResponseSchema>;
