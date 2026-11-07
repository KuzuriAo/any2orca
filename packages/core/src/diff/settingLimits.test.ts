// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { settingLimits } from "./settingLimits.js";
import { OLDER_RELEASE_LIMITS, SETTINGS_CATALOG_SOURCE } from "./settingsCatalog.js";

describe("settingLimits", () => {
  it("gives each release its own limits, and the strictest of them when no release is known", () => {
    expect(SETTINGS_CATALOG_SOURCE.tag).toBe("v2.4.1");
    expect(Object.keys(OLDER_RELEASE_LIMITS)).toEqual(["2.4.0"]);
    // Snapmaker Orca 2.4.1 accepts up to 120% bridge density, -1 for the raft's initial layer expansion, and at least 1° for supports.
    expect(settingLimits("bridge_density", "2.4.1")).toMatchObject({ min: 10, max: 120 });
    expect(settingLimits("raft_first_layer_expansion", "2.4.1")).toMatchObject({ min: -1 });
    expect(settingLimits("support_threshold_angle", "2.4.1")).toMatchObject({ min: 1, max: 90 });
    // 2.4.0 accepts at most 100%, nothing below 0, and 0° for supports.
    expect(settingLimits("bridge_density", "2.4.0")).toMatchObject({ min: 10, max: 100 });
    expect(settingLimits("raft_first_layer_expansion", "2.4.0")).toMatchObject({ min: 0 });
    expect(settingLimits("support_threshold_angle", "2.4.0")).toMatchObject({ min: 0, max: 90 });
    // Before a release is chosen: what both accept.
    expect(settingLimits("bridge_density")).toMatchObject({ min: 10, max: 100 });
    expect(settingLimits("raft_first_layer_expansion")).toMatchObject({ min: 0 });
    expect(settingLimits("support_threshold_angle")).toMatchObject({ min: 1, max: 90 });
  });

  it("is the newest's for a setting both releases treat alike, or a release it doesn't know", () => {
    expect(settingLimits("wall_loops", "2.4.0")).toEqual(settingLimits("wall_loops", "2.4.1"));
    expect(settingLimits("bridge_density", "9.9.9")).toMatchObject({ max: 120 });
  });

  it("has nothing for a key Snapmaker Orca doesn't have, or one that could reach an object's prototype", () => {
    expect(settingLimits("not_a_setting")).toBeUndefined();
    expect(settingLimits("__proto__", "2.4.0")).toBeUndefined();
    expect(settingLimits("bridge_density", "__proto__")).toMatchObject({ max: 120 });
  });
});
