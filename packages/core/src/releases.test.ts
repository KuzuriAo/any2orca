// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "./errors.js";
import { dirProfileSource } from "./node.js";
import { fetchProfileSource, isReleasePath, listProfiles, loadCatalog, memoryProfileSource, ProfileDataError, type MemoryCatalogData } from "./profiles.js";
import { convert } from "./project.js";
import { decodeStamp, STAMP_PATH } from "./stamp.js";
import { PROFILES_DATA_DIR, readFixture } from "./test-helpers.js";

type Json = Record<string, any>;
const read = (path: string): Json => JSON.parse(readFileSync(join(PROFILES_DATA_DIR, path), "utf-8"));
const realIndex = read("index.json");
const realProfiles: Record<string, unknown> = Object.fromEntries(
  readdirSync(join(PROFILES_DATA_DIR, "profiles")).map((f) => [f.replace(/\.json$/, ""), read(`profiles/${f}`)]),
);
const OLD = realIndex.slicer.version as string;
const NEW = "9.0.0";
const PROFILE = "snapmaker-u1-0.4-standard";

/**
 * A catalog holding two releases, made from the real data: the real one as
 * the older release, and a copy as a newer one whose 0.4 Standard profile
 * has a different brim width, so a conversion shows which release it used.
 */
function twoReleases(): MemoryCatalogData {
  const newer = structuredClone(realProfiles) as Record<string, Json>;
  newer[PROFILE]!.baselineProjectSettings.brim_width = "7.5";
  const { releases: _ignored, ...older } = structuredClone(realIndex);
  return {
    index: {
      ...structuredClone(realIndex),
      slicer: { ...realIndex.slicer, version: NEW, application: `Snapmaker_Orca-${NEW}` },
      releases: [
        { version: NEW, application: `Snapmaker_Orca-${NEW}`, path: "." },
        { version: OLD, application: realIndex.slicer.application, path: `releases/${OLD}` },
      ],
    },
    profiles: newer,
    releases: { [`releases/${OLD}`]: { index: older, profiles: realProfiles } },
  };
}

function convertedFacts(output: Uint8Array) {
  const files = unzipSync(output);
  const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]!));
  const application = /<metadata name="Application">([^<]*)</.exec(strFromU8(files["3D/3dmodel.model"]!))?.[1];
  return { application, brimWidth: settings.brim_width, tracks: decodeStamp(files[STAMP_PATH])?.profiles.tracks };
}

describe("Snapmaker Orca releases in a profile catalog", () => {
  it("lists every release, newest first and as the default", async () => {
    const catalog = await loadCatalog(memoryProfileSource(twoReleases()));
    expect(catalog.releases()).toEqual([
      { version: NEW, application: `Snapmaker_Orca-${NEW}`, isDefault: true },
      { version: OLD, application: realIndex.slicer.application, isDefault: false },
    ]);
  });

  it("converts for the newest release when none is chosen, and for the one chosen otherwise", async () => {
    const profiles = memoryProfileSource(twoReleases());
    const bytes = readFixture("synthetic-demo.3mf");
    const newest = convertedFacts((await convert(bytes, { profiles, profileId: PROFILE })).output);
    expect(newest).toEqual({ application: `Snapmaker_Orca-${NEW}`, brimWidth: "7.5", tracks: `Snapmaker Orca ${NEW}` });
    const older = await convert(bytes, { profiles, profileId: PROFILE, snapmakerOrcaVersion: OLD });
    expect(convertedFacts(older.output)).toEqual({
      application: realIndex.slicer.application,
      brimWidth: (realProfiles[PROFILE] as Json).baselineProjectSettings.brim_width,
      tracks: `Snapmaker Orca ${OLD}`,
    });
    expect(older.report.profile.id).toBe(PROFILE);
  });

  it("lists profiles for the release chosen", async () => {
    const profiles = memoryProfileSource(twoReleases());
    expect((await listProfiles(profiles, { snapmakerOrcaVersion: OLD })).map((p) => p.id)).toEqual((await listProfiles(profiles)).map((p) => p.id));
    await expect(listProfiles(profiles, { snapmakerOrcaVersion: "1.0.0" })).rejects.toMatchObject({ code: "release_not_found" });
  });

  it("refuses a release the catalog doesn't hold, without reading anything for it", async () => {
    const data = twoReleases();
    const asked: string[] = [];
    const source = memoryProfileSource(data);
    const spy = { ...source, release: (path: string) => (asked.push(path), source.release!(path)) };
    for (const bad of ["2.3.6", "../../etc", `${OLD}/..`, "releases/2.4.0", "x".repeat(10_000), ""]) {
      const err = await convert(readFixture("synthetic-demo.3mf"), { profiles: spy, snapmakerOrcaVersion: bad }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Any2orcaError);
      expect((err as Any2orcaError).code).toBe("release_not_found");
      expect((err as Error).message.length).toBeLessThan(200);
    }
    expect(asked).toEqual([]);
  });

  it("rejects a version option that isn't a string", async () => {
    await expect(
      convert(readFixture("synthetic-demo.3mf"), { profiles: memoryProfileSource(twoReleases()), snapmakerOrcaVersion: 2.4 as unknown as string }),
    ).rejects.toThrow(TypeError);
  });

  it("refuses an index whose releases point outside releases/<version>", async () => {
    for (const path of ["../evil", "releases/../../x", "/etc", "releases/2.4.0/../9", "https://elsewhere.test/", "releases\\2.4.0"]) {
      const data = twoReleases();
      (data.index as Json).releases[1].path = path;
      await expect(loadCatalog(memoryProfileSource(data))).rejects.toThrow(ProfileDataError);
    }
  });

  it("refuses releases that disagree with the index or with themselves", async () => {
    const cases: Array<(index: Json) => void> = [
      (i) => (i.releases[0].version = "8.0.0"), // its own entry isn't its slicer version
      (i) => i.releases.shift(), // no entry for itself
      (i) => (i.releases[1].version = NEW), // the same release twice
      (i) => (i.releases[1].path = "releases/1.2.3"), // a folder named after another version
      (i) => (i.releases[1].application = "Snapmaker_Orca-1.2.3"), // an application value for another version
    ];
    for (const change of cases) {
      const data = twoReleases();
      change(data.index as Json);
      await expect(loadCatalog(memoryProfileSource(data))).rejects.toThrow(ProfileDataError);
    }
  });

  it("refuses an older release whose own index names another version", async () => {
    const data = twoReleases();
    const older = data.releases![`releases/${OLD}`]!.index as Json;
    older.slicer = { ...older.slicer, version: "1.2.3", application: "Snapmaker_Orca-1.2.3" };
    const catalog = await loadCatalog(memoryProfileSource(data));
    await expect(catalog.forRelease(OLD)).rejects.toThrow(/is for Snapmaker Orca 1\.2\.3/);
    // A failed load isn't kept, so fixing the data and asking again works.
    data.releases![`releases/${OLD}`]!.index = { ...older, slicer: realIndex.slicer };
    await expect(catalog.forRelease(OLD)).resolves.toBeDefined();
  });

  it("loads an older release once", async () => {
    const data = twoReleases();
    let reads = 0;
    const source = memoryProfileSource(data);
    const counting = { ...source, release: (path: string) => (reads++, source.release!(path)) };
    const catalog = await loadCatalog(counting);
    const [a, b] = await Promise.all([catalog.forRelease(OLD), catalog.forRelease(OLD)]);
    expect(a).toBe(b);
    expect(reads).toBe(1);
  });

  it("treats a catalog with no releases list as holding its own release only", async () => {
    const { releases: _ignored, ...index } = structuredClone(realIndex);
    const catalog = await loadCatalog(memoryProfileSource({ index, profiles: realProfiles }));
    expect(catalog.releases()).toEqual([{ version: OLD, application: realIndex.slicer.application, isDefault: true }]);
    expect(await catalog.forRelease(OLD)).toBe(catalog);
  });

  it("serves the bundled catalog's own release, which is the newest", async () => {
    const catalog = await loadCatalog(dirProfileSource(PROFILES_DATA_DIR));
    expect(catalog.releases()[0]).toEqual({ version: OLD, application: realIndex.slicer.application, isDefault: true });
    expect(await catalog.forRelease(OLD)).toBe(catalog);
  });
});

describe("ProfileSource.release", () => {
  it("accepts only releases/<x.y.z>", () => {
    expect(isReleasePath("releases/2.4.0")).toBe(true);
    for (const bad of ["releases/2.4", "releases/02.4.0", "releases/2.4.0/", "releases/2.4.0/..", "../releases/2.4.0", "releases/2.4.0-beta", ".", ""]) {
      expect(isReleasePath(bad), bad).toBe(false);
    }
  });

  it("fetches an older release from its folder under the catalog's URL", async () => {
    const requested: string[] = [];
    const fakeFetch = (async (input: string | URL) => {
      requested.push(String(input));
      return new Response("{}");
    }) as typeof fetch;
    const source = fetchProfileSource("https://site.test/profiles/", { fetch: fakeFetch });
    await source.release!("releases/2.4.0").readIndex();
    await source.release!("releases/2.4.0").readProfile(PROFILE);
    expect(requested).toEqual(["https://site.test/profiles/releases/2.4.0/index.json", `https://site.test/profiles/releases/2.4.0/profiles/${PROFILE}.json`]);
    expect(() => source.release!("../admin")).toThrow(ProfileDataError);
  });

  it("reads an older release from its folder, and nothing outside the catalog", async () => {
    const source = dirProfileSource(PROFILES_DATA_DIR);
    for (const bad of ["../..", "releases/../../..", "/etc"]) expect(() => source.release!(bad)).toThrow(ProfileDataError);
    await expect(source.release!("releases/1.0.0").readIndex()).rejects.toThrow(/not found/);
  });
});
