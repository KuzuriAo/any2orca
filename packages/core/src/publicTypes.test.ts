// SPDX-License-Identifier: MIT
// The public types are written out as interfaces, so the published type files mention no validation library.
// Each one must stay in step with the schema that checks the same data: what a schema produces is a value of the
// public type (checked when this file compiles), and a value of the public type passes the schema (checked here).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConvertObject, HighFlowHotends, OutputStamp, ProfileIndex, ProfileMatch, Shifts, StatsEvent } from "./index.js";
import { bundledProfilesDir } from "./node.js";
import { ProfileIndexSchema } from "./profiles.js";
import { ConvertObjectSchema, HighFlowHotendsSchema, ProfileMatchSchema, ShiftsSchema } from "./schema.js";
import { OutputStampSchema } from "./stamp.js";
import { buildStatsEvent, StatsEventSchema } from "./telemetry.js";

describe("public types and their schemas agree", () => {
  it("OutputStamp", () => {
    const stamp: OutputStamp = {
      stamp: 1,
      generator: "any2orca",
      version: "0.9.0",
      profiles: { version: "0.3.1", tracks: "Snapmaker Orca 2.4.1" },
      profileId: "snapmaker-u1-0.4-standard",
      source: { format: "prusaslicer", slicerVersion: "2.9.6" },
      options: {
        highFlowHotends: [true, false, false, false],
        hardenedNozzles: false,
        filamentComplianceMode: null,
        preset: { base: "snapmaker-u1-0.4-standard", keys: ["wall_loops"], sha256: "a".repeat(64) },
        aboveStock: { keep: ["outer_wall_speed"], stock: [] },
      },
    };
    const parsed: OutputStamp = OutputStampSchema.parse(stamp);
    expect(parsed).toEqual(stamp);
  });

  it("ConvertObject, HighFlowHotends and Shifts", () => {
    const objects: ConvertObject[] = [
      { id: "1", name: "Cube", bbox: [0, 10, 0, 10] },
      { id: "2", bbox: null, fallbackXy: [1, 2], plate: 1, sequence: 0, isAssembly: false },
    ];
    for (const object of objects) {
      const parsed: ConvertObject = ConvertObjectSchema.parse(object);
      expect(parsed).toEqual(object);
    }
    for (const hotends of [true, [true, false, true, false]] as HighFlowHotends[]) {
      const parsed: HighFlowHotends = HighFlowHotendsSchema.parse(hotends);
      expect(parsed).toEqual(hotends);
    }
    const shifts: Shifts = { "1": [1, 2], "2": [0, -3.5] };
    const parsed: Shifts = ShiftsSchema.parse(shifts);
    expect(parsed).toEqual(shifts);
  });

  it("ProfileMatch", () => {
    const match: ProfileMatch = { profileId: "snapmaker-u1-0.4-standard", nozzleDiameter: "0.4", exact: true, matchedByTierName: false, matchSource: "auto-exact" };
    const parsed: ProfileMatch = ProfileMatchSchema.parse(match);
    expect(parsed).toEqual(match);
  });

  it("ProfileIndex, on the bundled catalog", () => {
    const raw: unknown = JSON.parse(readFileSync(join(bundledProfilesDir(), "index.json"), "utf-8"));
    const index: ProfileIndex = ProfileIndexSchema.parse(raw);
    expect(index.schema).toBe(1);
    expect(index.profiles.length).toBeGreaterThan(0);
    expect(index.releases?.[0]?.path).toBe(".");
  });

  it("StatsEvent", () => {
    const event: StatsEvent = buildStatsEvent({ profileId: "snapmaker-u1-0.4-standard", plates: 1, objects: 2, filamentSlots: 4, sourceVendor: "bambu" });
    const parsed: StatsEvent = StatsEventSchema.parse(event);
    expect(parsed).toEqual(event);
  });
});
