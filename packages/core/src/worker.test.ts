// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { STAMP_PATH } from "./stamp.js";
import { PROFILES_DATA_DIR, readFixture } from "./test-helpers.js";
import { createConverterWorker, type WorkerLike } from "./worker.js";

/**
 * Runs the real worker script in this process: worker-entry.ts installs
 * its handler on globalThis.onmessage and replies with globalThis.postMessage,
 * which this fake worker routes back to the client, the way a real Worker
 * would (structured clone aside).
 */
const listeners: Array<(event: { data: unknown }) => void> = [];
const fetched: string[] = [];
const scope = globalThis as unknown as { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (m: unknown) => void };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  scope.postMessage = (message) => queueMicrotask(() => listeners.forEach((l) => l({ data: message })));
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    fetched.push(url.href);
    const path = url.pathname.replace(/^\/profiles\//, "");
    return new Response(readFileSync(`${PROFILES_DATA_DIR}${path}`, "utf-8"));
  }) as typeof fetch;
  await import("./worker-entry.js");
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const fakeWorker: WorkerLike = {
  postMessage: (message) => queueMicrotask(() => scope.onmessage?.({ data: message })),
  addEventListener: (_type, listener) => listeners.push(listener),
  terminate: () => {},
};

describe("createConverterWorker", () => {
  // Created after the worker script has loaded: a real Worker queues messages
  // sent before its script runs, but this in-process stand-in doesn't.
  let converter: ReturnType<typeof createConverterWorker>;
  beforeAll(() => {
    converter = createConverterWorker(fakeWorker, { profilesUrl: "https://site.test/profiles/" });
  });

  it("opens, inspects and converts a file with progress events", async () => {
    const { project, inspection } = await converter.open(readFixture("synthetic-demo.3mf"));
    expect(inspection.objects).toHaveLength(3);
    const stages: string[] = [];
    const { output, report } = await project.convert({ onProgress: (s) => stages.push(s) });
    expect(report.profile.id).toBe("snapmaker-u1-0.4-standard");
    expect(stages).toEqual(["matching", "loading-profile", "merging", "writing"]);
    expect(unzipSync(output)[STAMP_PATH]).toBeDefined();
    await project.close();
    await expect(project.convert()).rejects.toThrow(/no longer open/);
  });

  it("lists the catalog's releases and converts for one, refusing a release it doesn't hold", async () => {
    const index = JSON.parse(readFileSync(`${PROFILES_DATA_DIR}index.json`, "utf-8"));
    const releases = (index.releases as Array<{ version: string; application: string }>).map((r, i) => ({ version: r.version, application: r.application, isDefault: i === 0 }));
    expect(releases[0]!.version).toBe(index.slicer.version);
    await expect(converter.listProfiles({ snapmakerOrcaVersion: "1.0.0" })).rejects.toMatchObject({ code: "release_not_found" });
    const { project } = await converter.open(readFixture("synthetic-demo.3mf"));
    // Every release the bundled catalog holds, each read from its own folder.
    for (const { version } of releases) {
      const listing = await converter.listProfiles({ snapmakerOrcaVersion: version });
      expect(listing.releases).toEqual(releases);
      expect(listing.slicer.version).toBe(version);
      expect((await project.matchProfile({ snapmakerOrcaVersion: version })).profileId).toBe("snapmaker-u1-0.4-standard");
      // The user's nozzle size, as convert takes it: a 0.6 pick for a 0.4 project, and "match" for the creator's size.
      const sixth = await project.matchProfile({ snapmakerOrcaVersion: version, nozzle: "0.6" });
      expect(sixth.profileId).toMatch(/^snapmaker-u1-0\.6-/);
      expect(sixth.nozzle).toEqual({ choice: "0.6", size: "0.6", sourceSizes: ["0.4"] });
      expect((await project.matchProfile({ nozzle: "match" })).nozzle?.size).toBe("0.4");
      const { report } = await project.convert({ snapmakerOrcaVersion: version });
      expect(report.stamp?.profiles.tracks).toBe(`Snapmaker Orca ${version}`);
    }
    await expect(project.convert({ snapmakerOrcaVersion: "../1.0.0" })).rejects.toMatchObject({ code: "release_not_found" });
    await expect(project.extractPreset({ snapmakerOrcaVersion: "1.0.0" })).rejects.toMatchObject({ code: "release_not_found" });
    await project.close();
  });

  it("lists profiles with the catalog's versions", async () => {
    const listing = await converter.listProfiles({ nozzleDiameter: "0.6" });
    expect(listing.profiles.every((p) => p.nozzleDiameter === "0.6")).toBe(true);
    expect(listing.slicer.name).toBe("Snapmaker Orca");
  });

  it("passes errors back with their code, and the slicer's name with unsupported_slicer", async () => {
    await expect(converter.open(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "invalid_file" });
    const entries = unzipSync(new Uint8Array(readFileSync(new URL("./test-fixtures/prusaslicer/prusaslicer-2.9.6.3mf", import.meta.url))));
    const ini = new TextDecoder().decode(entries["Metadata/Slic3r_PE.config"]).replace(/^; generated by PrusaSlicer/, "; generated by SuperSlicer");
    entries["Metadata/Slic3r_PE.config"] = new TextEncoder().encode(ini);
    await expect(converter.open(zipSync(entries))).rejects.toMatchObject({ code: "unsupported_slicer", slicer: "SuperSlicer" });
  });

  it("only ever fetches from the configured profiles URL", async () => {
    fetched.length = 0;
    const own = createConverterWorker(fakeWorker, { profilesUrl: "https://only.test/profiles/" });
    await own.listProfiles();
    const { project } = await own.open(readFixture("synthetic-demo.3mf"));
    await project.convert();
    await project.close();
    own.terminate();
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((url) => url.startsWith("https://only.test/profiles/"))).toBe(true);
  });

  it("diffs two open projects, and a project against a stock profile, in the worker", async () => {
    const converter = createConverterWorker(fakeWorker, { profilesUrl: "https://example.test/profiles/" });
    const a = await converter.open(readFixture("synthetic-demo.3mf"));
    const b = await converter.open(readFixture("synthetic-demo.3mf"));
    const same = await converter.diff({ project: a.project, label: "a.3mf" }, { project: b.project, label: "b.3mf" });
    expect(same).toMatchObject({ format: "any2orca-diff", aLabel: "a.3mf", bLabel: "b.3mf", identical: true });
    const stock = await converter.diff({ project: a.project, label: "a.3mf" }, { stock: "snapmaker-u1-0.4-standard" }, { groups: ["print"] });
    expect(stock.bLabel).toMatch(/^Snapmaker's stock .* profile$/);
    expect(stock.groups.every((g) => g.group === "print")).toBe(true);
    await expect(converter.diff({ project: { inspection: a.inspection } as never, label: "x" }, { stock: "snapmaker-u1-0.4-standard" })).rejects.toThrow(/wasn't opened/);
    converter.terminate();
  });

  it("makes, checks, compares and converts with a preset in the worker", async () => {
    const converter = createConverterWorker(fakeWorker, { profilesUrl: "https://site.test/profiles/" });
    const source = await converter.open(readFixture("synthetic-demo.3mf"));
    const { output } = await source.project.convert({ profileId: "snapmaker-u1-0.4-standard" });
    const master = await converter.open(output);
    const extracted = await master.project.extractPreset();
    expect(extracted.preset.base).toBe("snapmaker-u1-0.4-standard");

    const preset = { ...extracted.preset, name: "Mine", changes: { wall_loops: "5", sparse_infill_speed: "480" } };
    const resolved = await converter.resolvePreset(preset);
    expect(resolved.described.find((c) => c.key === "sparse_infill_speed")).toMatchObject({ aboveStock: true });

    const compared = await converter.diff({ stock: "snapmaker-u1-0.4-standard" }, { preset }, { groups: ["print"] });
    expect(compared.bLabel).toBe("Your preset Mine on 0.20mm Standard @Snapmaker U1 (0.4 nozzle)");
    expect(compared.groups[0].rows.map((r) => r.key)).toEqual(expect.arrayContaining(["sparse_infill_speed", "wall_loops"]));
    expect(compared.groups[0].rows.find((r) => r.key === "sparse_infill_speed")?.attention).toBe("above-stock");

    const converted = await source.project.convert({ preset });
    expect(converted.report.preset?.changes.map((c) => c.key)).toEqual(["sparse_infill_speed", "wall_loops"]);
    await expect(source.project.convert({ preset: { ...preset, base: "nope" } })).rejects.toMatchObject({ code: "invalid_preset" });
    converter.terminate();
  });
});

describe("createConverterWorker when the worker fails", () => {
  /** A worker that answers nothing, and can fail like a real one: an event with type "error" or "messageerror". */
  function failingWorker() {
    const listeners = new Map<string, Array<(event: { type?: string; message?: string }) => void>>();
    const worker: WorkerLike = {
      postMessage: () => {},
      addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
      terminate: () => {},
    };
    const emit = (type: string, message?: string) => listeners.get(type)?.forEach((l) => l({ type, ...(message ? { message } : {}) }));
    return { worker, emit };
  }

  it("rejects the calls in flight when the worker stops, and refuses later ones", async () => {
    const { worker, emit } = failingWorker();
    const converter = createConverterWorker(worker, { profilesUrl: "https://site.test/profiles/" });
    const pending = converter.listProfiles();
    emit("error", "Out of memory");
    await expect(pending).rejects.toThrow(/^The converter stopped working \(Out of memory\)\. Reload the page to try again/);
    await expect(converter.listProfiles()).rejects.toThrow(/stopped working/);
  });

  it("rejects the calls in flight when a reply can't be read", async () => {
    const { worker, emit } = failingWorker();
    const converter = createConverterWorker(worker, { profilesUrl: "https://site.test/profiles/" });
    const pending = converter.listProfiles();
    emit("messageerror");
    await expect(pending).rejects.toThrow(/^The converter couldn't read a reply from its worker\. Reload the page/);
  });

  it("a failure reply without a readable error still settles the call", async () => {
    // Replies with ok: false and no usable error field: each must reject, never leave the call waiting.
    const replies: unknown[] = [{ ok: false }, { ok: false, error: "text" }, { ok: false, error: { code: 7 } }, { ok: "no" }];
    const listeners: Array<(event: { data?: unknown; type?: string }) => void> = [];
    let sent = 0;
    const worker: WorkerLike = {
      postMessage: (message) => {
        const { id } = message as { id: number };
        const reply = replies[sent++];
        if (reply !== undefined) queueMicrotask(() => listeners.forEach((l) => l({ data: { id, ...(reply as object) } })));
      },
      addEventListener: (_type, listener) => listeners.push(listener),
      terminate: () => {},
    };
    const converter = createConverterWorker(worker, { profilesUrl: "https://site.test/profiles/" });
    for (let i = 1; i < replies.length; i++) {
      // The configure message took the first reply; each listProfiles call takes the next.
      await expect(converter.listProfiles()).rejects.toMatchObject({ code: "invalid_file", message: expect.stringMatching(/couldn't read/) });
    }
  });
});

describe("unwrapBundle through the worker", () => {
  const bundle = () => zipSync({ "a.3mf": readFixture("synthetic-demo.3mf"), "b.3mf": readFixture("synthetic-demo.3mf") });

  it("returns each nested file, whether the bytes are copied or moved", async () => {
    const converter = createConverterWorker(fakeWorker, { profilesUrl: "https://site.test/profiles/" });
    const copied = await converter.unwrapBundle(bundle());
    expect(copied?.map((e) => e.name)).toEqual(["a.3mf", "b.3mf"]);
    const moved = await converter.unwrapBundle(bundle(), { transfer: true });
    expect(moved?.map((e) => e.bytes.length)).toEqual(copied?.map((e) => e.bytes.length));
    expect(await converter.unwrapBundle(readFixture("synthetic-demo.3mf"))).toBeNull();
    converter.terminate();
  });
});
