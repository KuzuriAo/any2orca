// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../profiles.js";
import { testProfileSource } from "../../test-helpers.js";
import { formatProfiles, runProfiles } from "./profiles.js";

describe("formatProfiles", () => {
  it("sorts by id byte-wise, matching the `sort` command", async () => {
    const catalog = await loadCatalog(testProfileSource());
    const lines = formatProfiles(catalog.list()).split("\n");
    const ids = lines.map((line) => line.split(/\s+/)[0]);
    expect(ids).toEqual([...ids].sort());
  });

  it("marks manual-only tiers and tiers with high-flow speeds", async () => {
    const catalog = await loadCatalog(testProfileSource());
    const text = formatProfiles(catalog.list({ nozzleDiameter: "0.4" }));
    expect(text).toMatch(/snapmaker-u1-0\.4-0\.20hq .*\(manual-select only\)/);
    expect(text).toMatch(/snapmaker-u1-0\.4-standard .*\(high-flow speeds\)/);
  });
});

describe("runProfiles", () => {
  it("says so when a nozzle size has no profiles", async () => {
    const lines: string[] = [];
    runProfiles(await loadCatalog(testProfileSource()), "1.2", (l) => lines.push(l));
    expect(lines).toEqual(["No profiles found for nozzle diameter 1.2."]);
  });

  it("names the upstream release the catalog tracks", async () => {
    const lines: string[] = [];
    const catalog = await loadCatalog(testProfileSource());
    runProfiles(catalog, "0.8", (l) => lines.push(l));
    expect(lines.join("\n")).toContain(`Profiles track ${catalog.index.slicer.name} ${catalog.index.slicer.version}`);
  });
});
