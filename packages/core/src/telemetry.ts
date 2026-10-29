// SPDX-License-Identifier: MIT
/**
 * Usage stats: the one event, how it's built, and whether it may be sent.
 *
 * The library never sends anything itself; it has no network code at all.
 * A UI or the CLI calls {@link buildStatsEvent} after a successful
 * conversion and decides with {@link resolveStatsConsent} whether to send
 * it, and to where. Off by default everywhere except a deployment whose
 * operator turns it on and discloses it.
 *
 * {@link StatsEventSchema} is strict: the sender, the "see exactly what's
 * sent" display and the docs all come from it, and a payload with any
 * other field fails to parse, so the explanation can't drift from what's
 * actually sent.
 */
import { z } from "zod";
import type { SourceVendor } from "./inspect.js";
import type { ProfileMatch } from "./schema.js";
import { VERSION } from "./version.js";

export const REF_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export const StatsEventSchema = z
  .object({
    v: z.literal(1).describe("event format version"),
    core: z
      .string()
      .regex(/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]{1,32})?$/)
      .describe("the any2orca version that converted the file"),
    profileId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{0,63}$/)
      .describe('the profile used, e.g. "snapmaker-u1-0.4-standard"'),
    matchSource: z
      .enum(["explicit", "auto-tier-name", "auto-exact", "auto-nearest", "default-fallback"])
      .describe("how the profile was chosen"),
    plates: z.number().int().min(0).max(10_000).describe("number of plates"),
    objects: z.number().int().min(0).max(10_000).describe("number of objects"),
    filamentSlots: z.number().int().min(0).max(1_000).describe("number of filament slots"),
    sourceVendor: z
      .enum(["bambu", "creality", "anycubic", "snapmaker", "elegoo", "prusa", "flashforge", "other"])
      .describe("the printer maker the source file was set up for"),
    ref: z.string().regex(REF_PATTERN).optional().describe("which site sent you here, if it said so (a short slug, never free text)"),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("the UTC date of the conversion (no time of day)"),
  })
  .strict();
export type StatsEvent = z.infer<typeof StatsEventSchema>;

/** What is never sent, for the "see exactly what's sent" display. */
export const NEVER_SENT: readonly string[] = [
  "your file, or any part of it (no geometry, no settings values)",
  "file names or folder paths",
  "anything that identifies you or your device (no IDs, no cookies)",
  "the time of day (only the date)",
];

export interface StatsEventInput {
  profileId: string;
  /** Omitted when the profile was chosen explicitly. */
  profileMatch?: Pick<ProfileMatch, "matchSource">;
  plates: number;
  objects: number;
  filamentSlots: number;
  sourceVendor: SourceVendor;
  /** A `?ref=` value. Dropped if it isn't a short slug. */
  ref?: string | null;
  /** Defaults to now. */
  date?: Date;
}

/** Builds the event from a conversion report. Throws if a field is out of range. */
export function buildStatsEvent(input: StatsEventInput): StatsEvent {
  const ref = input.ref && REF_PATTERN.test(input.ref) ? input.ref : undefined;
  return StatsEventSchema.parse({
    v: 1,
    core: VERSION,
    profileId: input.profileId,
    matchSource: input.profileMatch?.matchSource ?? "explicit",
    plates: input.plates,
    objects: input.objects,
    filamentSlots: input.filamentSlots,
    sourceVendor: input.sourceVendor,
    ...(ref ? { ref } : {}),
    day: (input.date ?? new Date()).toISOString().slice(0, 10),
  });
}

/**
 * The stored choice. `choice: null` means the user hasn't chosen, so the
 * deployment's default applies. `gpcAtChoice` records whether the browser
 * sent Global Privacy Control when the choice was made.
 */
export interface StatsConsentState {
  choice: "on" | "off" | null;
  gpcAtChoice: boolean;
}

export const NO_STATS_CHOICE: StatsConsentState = { choice: null, gpcAtChoice: false };

export interface StatsConsent {
  enabled: boolean;
  /**
   * - `default`: no choice yet; the deployment default applies.
   * - `choice`: the user's own choice applies.
   * - `gpc`: Global Privacy Control turned it off (no choice yet).
   * - `gpc-since-choice`: GPC appeared after the user opted in, so it's off
   *   again until they confirm.
   */
  reason: "default" | "choice" | "gpc" | "gpc-since-choice";
  /** Show the note explaining GPC turned stats off and that they can turn it back on. */
  showGpcNote: boolean;
}

/**
 * Decides whether stats may be sent. Rules, in order:
 * 1. An explicit "off" is always off.
 * 2. An explicit "on" wins over GPC if GPC was already on when the user
 *    chose; GPC appearing later counts as newer intent and turns it off.
 * 3. With no choice, GPC means off; otherwise the deployment default.
 * Nothing automatic ever turns stats on except the deployment default.
 */
export function resolveStatsConsent(input: { state: StatsConsentState; gpc: boolean; defaultOn: boolean }): StatsConsent {
  const { state, gpc, defaultOn } = input;
  if (state.choice === "off") return { enabled: false, reason: "choice", showGpcNote: false };
  if (state.choice === "on") {
    if (gpc && !state.gpcAtChoice) return { enabled: false, reason: "gpc-since-choice", showGpcNote: true };
    return { enabled: true, reason: "choice", showGpcNote: false };
  }
  if (gpc) return { enabled: false, reason: "gpc", showGpcNote: defaultOn };
  return { enabled: defaultOn, reason: "default", showGpcNote: false };
}

/** The state to store when the user makes a choice. */
export function recordStatsChoice(choice: "on" | "off", gpc: boolean): StatsConsentState {
  return { choice, gpcAtChoice: gpc };
}
