// SPDX-License-Identifier: MIT
/**
 * The output stamp: one small JSON file added to every converted 3MF, so a
 * file can always be traced to the release that made it ("was this made
 * before the fix?"). It holds versions and the options used, nothing else:
 * no file names, paths, timestamps or identifiers. It sits in its own zip
 * entry, so no slicer-read file and no mesh data changes because of it.
 *
 * The path and the `stamp: 1` shape are a public contract once files
 * exist in the wild. Add fields if needed; never rename or remove one
 * without bumping `stamp`.
 */
import "./zodSetup.js";
import { z } from "zod";
import { HighFlowHotendsSchema, type HighFlowHotends } from "./schema.js";

/** The nozzle size the file is for: what was asked (a size, or "match" for the creator's) and the size used. */
const NozzleStampSchema = z.object({ choice: z.string().max(16), size: z.string().max(16) }).strict();
import { SOURCE_FORMATS, type SourceFormat } from "./sources/reader.js";

export const STAMP_PATH = "Metadata/any2orca.json";

const AboveStockStampSchema = z
  .object({
    keep: z.array(z.string().max(100)).max(100),
    stock: z.array(z.string().max(100)).max(100),
  })
  .strict();

const PresetStampSchema = z
  .object({
    base: z.string().max(64),
    keys: z.array(z.string().max(100)).max(400),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** What this version writes: exactly these fields. */
export const OutputStampSchema = z
  .object({
    stamp: z.literal(1),
    generator: z.literal("any2orca"),
    /** The `any2orca` package version that converted the file. */
    version: z.string(),
    profiles: z
      .object({
        /** The profile catalog's version (`any2orca-profiles` for the bundled one). */
        version: z.string(),
        /** The upstream slicer release the catalog tracks, e.g. "Snapmaker Orca 2.4.0". */
        tracks: z.string(),
      })
      .strict(),
    profileId: z.string(),
    /** The source project's format and the slicer version that saved it. Absent in files written before this field: the Bambu Studio family. */
    source: z
      .object({
        format: z.enum(SOURCE_FORMATS),
        slicerVersion: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
    options: z
      .object({
        /** The nozzle size the file is for; files written before the option have none. */
        nozzle: NozzleStampSchema.optional(),
        highFlowHotends: HighFlowHotendsSchema,
        hardenedNozzles: z.boolean(),
        filamentComplianceMode: z.enum(["generic", "snapmaker"]).nullable(),
        /** Present when the file was converted with a preset: its base, the settings it set, and a fingerprint of their values. Never its name. */
        preset: PresetStampSchema.optional(),
        /** Present when the user chose differently for values above stock: settings kept at the creator's value, and set to stock. */
        aboveStock: AboveStockStampSchema.optional(),
      })
      .strict(),
  })
  .strict();
/** The preset a file was converted with: its base, the settings it set, and a fingerprint of their values. Never its name. */
export interface OutputStampPreset {
  base: string;
  keys: string[];
  sha256: string;
}
/** The user's choices for values above stock: settings kept at the creator's value, and set to stock. */
export interface OutputStampAboveStock {
  keep: string[];
  stock: string[];
}
/** The stamp a converted file carries; `stamp` stays 1 as long as fields are only added. */
export interface OutputStamp {
  stamp: 1;
  generator: "any2orca";
  /** The `any2orca` package version that converted the file. */
  version: string;
  profiles: {
    /** The profile catalog's version (`any2orca-profiles` for the bundled one). */
    version: string;
    /** The upstream slicer release the catalog tracks, e.g. "Snapmaker Orca 2.4.0". */
    tracks: string;
  };
  profileId: string;
  /** The source project's format and the slicer version that saved it. Absent in files written before this field: the Bambu Studio family. */
  source?: {
    /** One of {@link SOURCE_FORMATS}, or a format a later any2orca release added. */
    format: SourceFormat;
    slicerVersion?: string;
  };
  options: {
    /**
     * The nozzle size the file is for: `choice` is what was asked ("0.4", or "match" for the creator's size),
     * `size` the size used. Absent in files written before the option; those are for the creator's size.
     */
    nozzle?: { choice: string; size: string };
    highFlowHotends: HighFlowHotends;
    hardenedNozzles: boolean;
    filamentComplianceMode: "generic" | "snapmaker" | null;
    preset?: OutputStampPreset;
    aboveStock?: OutputStampAboveStock;
  };
}

/**
 * Text from a note in someone's file: one line, no control characters or
 * direction overrides, so a program that prints it can't be tricked into
 * sending terminal codes or showing text that reads differently.
 */
const noteText = (max: number) => z.string().max(max).regex(/^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/);

/** What any version accepts when reading: a later release may add fields. */
const StampReadSchema = z.object({
  stamp: z.literal(1),
  generator: z.literal("any2orca"),
  version: noteText(64),
  profiles: z.object({ version: noteText(64), tracks: noteText(200) }),
  profileId: noteText(64),
  // Added with the PrusaSlicer reader; absent means the Bambu Studio family. Any short name, so a file from a later
  // release with a format this one doesn't know still reads as stamped.
  source: z.object({ format: z.string().regex(/^[a-z0-9-]{1,32}$/), slicerVersion: noteText(64).optional() }).optional(),
  options: z.object({
    // Added with the nozzle option; absent means the file is for the creator's nozzle size.
    nozzle: z.object({ choice: noteText(16), size: noteText(16) }).optional(),
    highFlowHotends: HighFlowHotendsSchema,
    // Added after the first stamps were written; absent means the stock stainless nozzles.
    hardenedNozzles: z.boolean().default(false),
    filamentComplianceMode: z.enum(["generic", "snapmaker"]).nullable(),
    // Added with presets; absent means no preset.
    preset: z.object({ base: noteText(64), keys: z.array(noteText(100)).max(400), sha256: noteText(64) }).optional(),
    aboveStock: z.object({ keep: z.array(noteText(100)).max(100), stock: z.array(noteText(100)).max(100) }).optional(),
  }),
});

export function encodeStamp(stamp: OutputStamp): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(OutputStampSchema.parse(stamp), null, 2)}\n`);
}

/** Reads the stamp from a converted file's zip entries, or null if it has none (or an unreadable one). */
export function decodeStamp(bytes: Uint8Array | undefined): OutputStamp | null {
  if (!bytes || bytes.byteLength > 64 * 1024) return null;
  try {
    const parsed = StampReadSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return null;
    const { stamp, generator, version, profiles, profileId, source, options } = parsed.data;
    return {
      stamp,
      generator,
      version,
      ...(source ? { source: { format: source.format, ...(source.slicerVersion !== undefined ? { slicerVersion: source.slicerVersion } : {}) } } : {}),
      profiles: { version: profiles.version, tracks: profiles.tracks },
      profileId,
      options: {
        ...(options.nozzle ? { nozzle: { choice: options.nozzle.choice, size: options.nozzle.size } } : {}),
        highFlowHotends: options.highFlowHotends,
        hardenedNozzles: options.hardenedNozzles,
        filamentComplianceMode: options.filamentComplianceMode,
        ...(options.preset ? { preset: { base: options.preset.base, keys: [...options.preset.keys], sha256: options.preset.sha256 } } : {}),
        ...(options.aboveStock ? { aboveStock: { keep: [...options.aboveStock.keep], stock: [...options.aboveStock.stock] } } : {}),
      },
    };
  } catch {
    return null;
  }
}
