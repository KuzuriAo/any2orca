// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { fetchProfileSource, listProfiles, loadCatalog, memoryProfileSource } from "./profiles.js";
import { readCatalogJson, testProfileSource } from "./test-helpers.js";

describe("the generated catalog", () => {
  it("loads, and lists profiles finest first within each nozzle size", async () => {
    const profiles = await listProfiles(testProfileSource(), { nozzleDiameter: "0.4" });
    expect(profiles.length).toBeGreaterThan(0);
    const heights = profiles.map((p) => p.layerHeight);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(profiles.every((p) => p.nozzleDiameter === "0.4" && p.tierName.length > 0)).toBe(true);
  });

  it("loads every listed profile", async () => {
    const catalog = await loadCatalog(testProfileSource());
    for (const p of catalog.list()) await expect(catalog.load(p.id)).resolves.toBeTruthy();
  });

  it("points every retired id at a live profile", async () => {
    const catalog = await loadCatalog(testProfileSource());
    for (const r of catalog.index.retired) expect(catalog.get(r.successorId)).toBeTruthy();
  });

  it("carries only what the converter reads: no print-preset copy, no second slicer version", () => {
    const index = readCatalogJson("index.json") as { profiles: Array<{ id: string }> } & Record<string, unknown>;
    expect(index).not.toHaveProperty("orcaSlicerTagVersion");
    for (const p of index.profiles) expect(readCatalogJson(`profiles/${p.id}.json`), p.id).not.toHaveProperty("processSettings");
  });
});

describe("catalog validation", () => {
  it("rejects a malformed index", async () => {
    const index = { ...(readCatalogJson("index.json") as object), schema: 2 };
    await expect(loadCatalog(memoryProfileSource({ index, profiles: {} }))).rejects.toMatchObject({ code: "profile_data" });
  });

  it("rejects an index whose slicer has no Application value", async () => {
    const real = readCatalogJson("index.json") as { slicer: Record<string, unknown> };
    const { application: _dropped, ...slicer } = real.slicer;
    await expect(loadCatalog(memoryProfileSource({ index: { ...real, slicer }, profiles: {} }))).rejects.toMatchObject({
      code: "profile_data",
      message: expect.stringContaining("slicer.application"),
    });
  });

  it("rejects a profile id that could escape a folder or URL", async () => {
    const real = readCatalogJson("index.json") as { profiles: Array<Record<string, unknown>> };
    const index = { ...real, profiles: [...real.profiles, { ...real.profiles[0], id: "../secret" }] };
    await expect(loadCatalog(memoryProfileSource({ index, profiles: {} }))).rejects.toThrow(/malformed/);
  });

  it("rejects a profile file that claims to be a different profile", async () => {
    const index = readCatalogJson("index.json") as { profiles: Array<{ id: string }> };
    const [a, b] = index.profiles;
    const catalog = await loadCatalog(memoryProfileSource({ index, profiles: { [a.id]: readCatalogJson(`profiles/${b.id}.json`) } }));
    await expect(catalog.load(a.id)).rejects.toThrow(/says it is/);
  });
});

describe("fetchProfileSource", () => {
  it("only requests index.json and the one profile it needs, under the base URL", async () => {
    const requested: string[] = [];
    const fakeFetch = (async (url: URL) => {
      requested.push(url.href);
      const path = url.pathname.replace("/static/profiles/", "");
      return new Response(JSON.stringify(readCatalogJson(path)));
    }) as unknown as typeof fetch;
    const catalog = await loadCatalog(fetchProfileSource("https://example.test/static/profiles", { fetch: fakeFetch }));
    await catalog.load("snapmaker-u1-0.4-standard");
    expect(requested).toEqual([
      "https://example.test/static/profiles/index.json",
      "https://example.test/static/profiles/profiles/snapmaker-u1-0.4-standard.json",
    ]);
  });

  it("stops reading a response that runs past the size limit, even without a Content-Length", async () => {
    const endless = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(256 * 1024).fill(32));
      },
    });
    const fakeFetch = (async () => new Response(endless)) as unknown as typeof fetch;
    await expect(loadCatalog(fetchProfileSource("https://example.test/", { fetch: fakeFetch }))).rejects.toThrow(/byte limit/);
  });

  it("reports an HTTP error clearly", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(loadCatalog(fetchProfileSource("https://example.test/", { fetch: fakeFetch }))).rejects.toThrow(/HTTP 404/);
  });
});
