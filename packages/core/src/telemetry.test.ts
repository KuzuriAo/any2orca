// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { buildStatsEvent, NO_STATS_CHOICE, recordStatsChoice, resolveStatsConsent, StatsEventSchema } from "./telemetry.js";

const input = { profileId: "snapmaker-u1-0.4-standard", plates: 2, objects: 3, filamentSlots: 4, sourceVendor: "bambu" as const };

describe("the stats event", () => {
  it("contains exactly the documented fields and nothing else", () => {
    const event = buildStatsEvent({ ...input, ref: "cpl-site", date: new Date("2026-10-14T23:59:00Z") });
    expect(Object.keys(event).sort()).toEqual(Object.keys(StatsEventSchema.shape).sort());
    expect(event.day).toBe("2026-10-14");
    expect(event.matchSource).toBe("explicit");
  });

  it("refuses any field outside the schema, so docs and payload can't drift apart", () => {
    const event = buildStatsEvent(input);
    expect(StatsEventSchema.safeParse({ ...event, fileName: "secret.3mf" }).success).toBe(false);
  });

  it("drops a ref that isn't a short slug rather than sending free text", () => {
    expect(buildStatsEvent({ ...input, ref: "hello world <script>" }).ref).toBeUndefined();
    expect(buildStatsEvent({ ...input, ref: "x".repeat(65) }).ref).toBeUndefined();
  });

  it("has a description for every field (shown by `telemetry show` and the docs)", () => {
    for (const [key, field] of Object.entries(StatsEventSchema.shape)) expect(field.description, key).toBeTruthy();
  });
});

describe("resolveStatsConsent", () => {
  const hosted = { defaultOn: true };
  const selfHosted = { defaultOn: false };

  it("follows the deployment default when there's no choice and no GPC", () => {
    expect(resolveStatsConsent({ state: NO_STATS_CHOICE, gpc: false, ...hosted }).enabled).toBe(true);
    expect(resolveStatsConsent({ state: NO_STATS_CHOICE, gpc: false, ...selfHosted }).enabled).toBe(false);
  });

  it("treats GPC as an opt-out when there's no choice, and says why", () => {
    expect(resolveStatsConsent({ state: NO_STATS_CHOICE, gpc: true, ...hosted })).toEqual({ enabled: false, reason: "gpc", showGpcNote: true });
  });

  it("lets an explicit opt-in made while GPC was on win over GPC", () => {
    expect(resolveStatsConsent({ state: recordStatsChoice("on", true), gpc: true, ...hosted }).enabled).toBe(true);
  });

  it("turns stats off again if GPC appears after an opt-in", () => {
    expect(resolveStatsConsent({ state: recordStatsChoice("on", false), gpc: true, ...hosted })).toEqual({
      enabled: false,
      reason: "gpc-since-choice",
      showGpcNote: true,
    });
  });

  it("never lets anything override an explicit opt-out", () => {
    for (const gpc of [true, false]) {
      for (const defaultOn of [true, false]) {
        expect(resolveStatsConsent({ state: recordStatsChoice("off", gpc), gpc, defaultOn }).enabled).toBe(false);
      }
    }
  });
});
