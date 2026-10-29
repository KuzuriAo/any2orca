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
import { z } from "zod";
import { HighFlowHotendsSchema } from "./schema.js";

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
    options: z
      .object({
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
export type OutputStamp = z.infer<typeof OutputStampSchema>;

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
  options: z.object({
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
    const { stamp, generator, version, profiles, profileId, options } = parsed.data;
    return {
      stamp,
      generator,
      version,
      profiles: { version: profiles.version, tracks: profiles.tracks },
      profileId,
      options: {
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
