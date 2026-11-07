// SPDX-License-Identifier: MIT
/**
 * The engine's internal request/response shapes. The request is built and
 * consumed in the same process. They are zod schemas because the request
 * is built from a file someone dropped in, which is untrusted:
 * validating it bounds how much work a crafted file can cause.
 */
import "./zodSetup.js";
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
/** A single top-level object's plate assignment and computed bounding box. */
export interface ConvertObject {
  id: string;
  name?: string;
  sequence?: number;
  isAssembly?: boolean;
  /** Omitted for objects with no plate metadata. */
  plate?: number;
  /** [minX, maxX, minY, maxY], or null when no mesh geometry was found for this object. */
  bbox: [number, number, number, number] | null;
  /** The item transform's raw translation, set only when bbox is null. */
  fallbackXy?: [number, number];
}

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
/** `true` for every toolhead, or exactly one entry per U1 toolhead, T1 to T4. */
export type HighFlowHotends = boolean | boolean[];

export const ConvertRequestSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  objects: z.array(ConvertObjectSchema).max(MAX_OBJECTS),
  /**
   * How many plates the project has, empty ones included: the slicer lays plates out on a grid by their number over
   * all of them, so an empty plate keeps its place. Absent: the highest plate an object is on.
   */
  plateCount: z.number().int().min(1).max(MAX_OBJECTS).optional(),
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
/** objectId -> [dx, dy] shift to apply to that object's transform. */
export type Shifts = Record<string, [number, number]>;

/** How a profile was picked, most confident first. */
export const MATCH_SOURCES = ["auto-tier-name", "auto-exact", "auto-nearest", "default-fallback"] as const;
export const MatchSourceSchema = z.enum(MATCH_SOURCES);
export type KnownMatchSource = (typeof MATCH_SOURCES)[number];
/** One of {@link MATCH_SOURCES}, or a way a later any2orca release added: treat one you don't recognize like "auto-nearest". */
export type MatchSource = KnownMatchSource | (string & {});

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
/** How the profile for a conversion was chosen. */
export interface ProfileMatch {
  profileId: string;
  nozzleDiameter: string;
  exact: boolean;
  /** The pick came from the source file's own tier name (e.g. "Extra Fine"), not nearest layer height. */
  matchedByTierName: boolean;
  /** See {@link MatchSource}: "auto-tier-name" and "auto-exact" are confident, "auto-nearest" the closest layer height, "default-fallback" no match at all. */
  matchSource: MatchSource;
}

export const ConvertResponseSchema = z.object({
  projectSettings: ProjectSettingsSchema,
  configFiles: ConfigFilesSchema,
  shifts: ShiftsSchema,
  /** Each plate's position on the U1's plate grid, from plate 1's, in mm, keyed by plate number, empty plates included. */
  plateOrigins: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
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
