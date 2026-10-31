// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RealPresetsEngine,
  PRESETS_STORAGE_KEY,
  type Preset,
  type PresetsEngine,
} from "./presetsEngine";
import type { ConverterWorker } from "any2orca/worker";
import {
  parsePresetFile,
  serializePresets,
  Any2orcaError,
  MAX_PRESETS_FILE_BYTES,
  type ExtractedPreset,
  type ResolvedPreset,
  type SettingsDiff,
  type PresetChange,
} from "any2orca";

class MemoryStorage implements Storage {
  private data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.data).length;
  }

  clear(): void {
    this.data = {};
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.data);
    return keys[index] || null;
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }
}

class StandInWorker {
  closedHandles: number[] = [];

  async listProfiles() {
    return {
      profiles: [
        {
          id: "snapmaker-u1-0.4-standard",
          displayName: "0.20mm Standard @Snapmaker U1 (0.4 nozzle)",
          nozzleDiameter: "0.4",
          layerHeight: 0.20,
          highFlowSupported: true,
          highFlowSpeeds: true,
        },
      ],
      dataVersion: "0.1.0",
      slicer: { name: "Snapmaker Orca", version: "2.4.0" },
      defaultProfileId: "snapmaker-u1-0.4-standard",
    };
  }

  async resolvePreset(preset: Preset): Promise<ResolvedPreset> {
    const described: PresetChange[] = Object.entries(preset.changes).map(([k, v]) => {
      const isAbove =
        (k === "outer_wall_speed" && Number(v) > 200) ||
        (k === "sparse_infill_speed" && Number(v) > 270);
      return {
        key: k,
        label: k.replace(/_/g, " "),
        stock: "200",
        yours: String(v),
        aboveStock: isAbove,
        cappedAt: isAbove && Number(v) > 500 ? 500 : undefined,
      };
    });

    return {
      profileId: preset.base,
      changes: preset.changes,
      described,
      notes: [],
    };
  }

  async open(bytes: Uint8Array) {
    const handle = Math.floor(Math.random() * 10000);
    return {
      inspection: {
        vendor: "bambu" as const,
        fileSizeBytes: bytes.length,
        platesCount: 1,
        objectsCount: 1,
        filaments: [],
        warnings: [],
      },
      project: {
        inspection: {} as any,
        matchProfile: async () => ({
          profileMatch: {
            profileId: "snapmaker-u1-0.4-standard",
            nozzleDiameter: "0.4",
            exact: true,
          },
        }),
        convert: async () => ({
          output: new Uint8Array([1, 2, 3]),
          report: { warnings: [], shifts: [] },
        }),
        extractPreset: async (): Promise<ExtractedPreset> => ({
          preset: {
            base: "snapmaker-u1-0.4-standard",
            baseInferred: false,
            catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
            changes: { wall_loops: "4" },
            created: "2026-10-21",
          },
          changes: [
            { key: "wall_loops", label: "Wall loops", stock: "2", yours: "4", aboveStock: false },
          ],
          notes: ["Extracted test settings"],
        }),
        close: async () => {
          this.closedHandles.push(handle);
        },
      },
    };
  }

  async diff(a: any, b: any, options?: any): Promise<SettingsDiff> {
    return {
      format: "any2orca-diff",
      version: 1,
      aLabel: a.label ?? a.stock ?? a.preset?.name ?? "Side A",
      bLabel: b.label ?? b.stock ?? b.preset?.name ?? "Side B",
      catalog: { tag: "v2.4.0", commit: "abcdef" },
      groups: [
        {
          group: "print",
          rows: [
            { key: "wall_loops", label: "Wall loops", a: "4", b: "2", status: "changed" },
            { key: "sparse_infill_pattern", label: "Sparse infill pattern", a: null, b: "grid", status: "only-b" },
          ],
        },
      ],
      identical: false,
    };
  }
}

describe("RealPresetsEngine with stand-in worker", () => {
  function makeEngine() {
    const storage = new MemoryStorage();
    const worker = new StandInWorker();
    const engine = new RealPresetsEngine(storage, () => worker as unknown as ConverterWorker);
    return { engine, storage, worker };
  }

  it("starts empty when storage has no presets", () => {
    const { engine } = makeEngine();
    assert.deepEqual(engine.listPresets(), []);
    assert.equal(engine.getStorageError(), null);
  });

  it("saves a valid preset and lists it", () => {
    const { engine, storage } = makeEngine();
    const preset: Preset = {
      name: "Tuned Speed",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {
        wall_loops: "4",
        sparse_infill_pattern: "crosshatch",
      },
      created: "2026-10-21",
    };

    engine.savePreset(preset);
    const list = engine.listPresets();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "Tuned Speed");
    assert.equal(list[0].changes.wall_loops, "4");

    // Check that storage contains serialized any2orca-presets JSON
    const raw = storage.getItem(PRESETS_STORAGE_KEY);
    assert.ok(raw);
    const parsed = parsePresetFile(raw);
    assert.equal(parsed.presets.length, 1);
  });

  it("validates preset names: rejects empty, oversized, and line breaks", () => {
    const { engine } = makeEngine();
    const basePreset: Preset = {
      name: "",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {},
      created: "2026-10-21",
    };

    assert.throws(() => engine.savePreset({ ...basePreset, name: "   " }), /cannot be empty/);
    assert.throws(() => engine.savePreset({ ...basePreset, name: "A".repeat(45) }), /at most 40/);
    assert.throws(() => engine.savePreset({ ...basePreset, name: "Name\nWithNewline" }), /line breaks/);
  });

  it("updates existing preset when saved with same name (case-insensitive)", () => {
    const { engine } = makeEngine();
    engine.savePreset({
      name: "Tuned Speed",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { wall_loops: "2" },
      created: "2026-10-21",
    });

    engine.savePreset({
      name: "TUNED SPEED",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { wall_loops: "5" },
      created: "2026-10-21",
    });

    const list = engine.listPresets();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "TUNED SPEED");
    assert.equal(list[0].changes.wall_loops, "5");
  });

  it("deletes a preset by name (case-insensitive)", () => {
    const { engine } = makeEngine();
    engine.savePreset({
      name: "Preset A",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {},
      created: "2026-10-21",
    });
    engine.savePreset({
      name: "Preset B",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {},
      created: "2026-10-21",
    });

    engine.deletePreset("preset a");
    const list = engine.listPresets();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "Preset B");
  });

  it("exports all presets or filtered names to standard presets file JSON", () => {
    const { engine } = makeEngine();
    engine.savePreset({
      name: "Alpha",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {},
      created: "2026-10-21",
    });
    engine.savePreset({
      name: "Beta",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: {},
      created: "2026-10-21",
    });

    const allJson = engine.exportPresets();
    const parsedAll = parsePresetFile(allJson);
    assert.equal(parsedAll.presets.length, 2);

    const filteredJson = engine.exportPresets(["beta"]);
    const parsedFiltered = parsePresetFile(filteredJson);
    assert.equal(parsedFiltered.presets.length, 1);
    assert.equal(parsedFiltered.presets[0].name, "Beta");
  });

  it("ignores corrupted data in storage without deleting it and sets error message", () => {
    const { engine, storage } = makeEngine();
    storage.setItem(PRESETS_STORAGE_KEY, "invalid-json-text");

    assert.deepEqual(engine.listPresets(), []);
    assert.equal(engine.getStorageError(), "Your saved presets couldn't be read and were not loaded.");

    // Critical: existing stored text is NOT destroyed or erased
    assert.equal(storage.getItem(PRESETS_STORAGE_KEY), "invalid-json-text");
    assert.equal(engine.getRawStorage(), "invalid-json-text");

    // Refuses to save or delete while storage is unreadable
    assert.throws(
      () =>
        engine.savePreset({
          name: "Test",
          base: "snapmaker-u1-0.4-standard",
          baseInferred: false,
          catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
          changes: {},
          created: "2026-10-21",
        }),
      /couldn't be read/
    );
    assert.throws(() => engine.deletePreset("Test"), /couldn't be read/);
    assert.equal(storage.getItem(PRESETS_STORAGE_KEY), "invalid-json-text");

    // Start over explicitly clears storage
    engine.clearStorage();
    assert.equal(storage.getItem(PRESETS_STORAGE_KEY), null);
    assert.equal(engine.getStorageError(), null);
    assert.deepEqual(engine.listPresets(), []);
  });

  it("evaluates above-stock flag accurately from resolvePreset", async () => {
    const { engine } = makeEngine();

    const normalPreset: Preset = {
      name: "Normal Walls",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { wall_loops: "4" },
      created: "2026-10-21",
    };
    const fastPreset: Preset = {
      name: "High Speed Infill",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { sparse_infill_speed: "450" },
      created: "2026-10-21",
    };

    const isNormalAbove = await engine.isAboveStock(normalPreset);
    assert.equal(isNormalAbove, false);

    const isFastAbove = await engine.isAboveStock(fastPreset);
    assert.equal(isFastAbove, true);

    const resolved = await engine.resolvePreset(fastPreset);
    assert.equal(resolved.described[0].aboveStock, true);
  });

  it("parses valid preset files and rejects hostile inputs (__proto__, oversized, duplicates)", () => {
    // Valid file
    const validJson = serializePresets([
      {
        name: "Imported Preset",
        base: "snapmaker-u1-0.4-standard",
        baseInferred: false,
        catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
        changes: { wall_loops: "3" },
        created: "2026-10-21",
      },
    ]);
    const parsed = parsePresetFile(validJson);
    assert.equal(parsed.presets.length, 1);

    // Malformed JSON
    assert.throws(() => parsePresetFile("not-json"), /isn't valid JSON/);

    // Hostile __proto__ key in changes
    const protoAttack =
      '{"format":"any2orca-presets","version":1,"presets":[{"name":"Attack","base":"snapmaker-u1-0.4-standard","baseInferred":false,"catalog":{"version":"0.1.0","tracks":"Snapmaker Orca 2.4.0"},"changes":{"__proto__":{"isAdmin":true}},"created":"2026-10-21"}]}';
    assert.throws(() => parsePresetFile(protoAttack), /has a key named \"__proto__\"/);

    // Duplicate names differing only by case
    const dupJson = JSON.stringify({
      format: "any2orca-presets",
      version: 1,
      presets: [
        {
          name: "Test Name",
          base: "snapmaker-u1-0.4-standard",
          baseInferred: false,
          catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
          changes: {},
          created: "2026-10-21",
        },
        {
          name: "test name",
          base: "snapmaker-u1-0.4-standard",
          baseInferred: false,
          catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
          changes: {},
          created: "2026-10-21",
        },
      ],
    });
    assert.throws(() => parsePresetFile(dupJson), /two presets named/);

    // Oversized (> 1 MB)
    const largePadding = "x".repeat(MAX_PRESETS_FILE_BYTES + 50);
    assert.throws(() => parsePresetFile(largePadding), /larger than the 1 MB/);
  });

  it("extracts presets and diffs settings while cleanly closing opened projects", async () => {
    const { engine, worker } = makeEngine();
    const fakeFileA = new File([new Uint8Array([1, 2, 3])], "tuned.3mf", {
      type: "application/octet-stream",
    });
    const fakeFileB = new File([new Uint8Array([4, 5, 6])], "model.3mf", {
      type: "application/octet-stream",
    });

    const extracted = await engine.extractPreset(fakeFileA);
    assert.equal(extracted.preset.base, "snapmaker-u1-0.4-standard");
    assert.equal(extracted.changes[0].key, "wall_loops");
    assert.equal(worker.closedHandles.length, 1);

    // Diff two files
    const diffFiles = await engine.diff(fakeFileA, fakeFileB);
    assert.equal(diffFiles.format, "any2orca-diff");
    assert.equal(diffFiles.aLabel, "tuned.3mf");
    assert.equal(diffFiles.bLabel, "model.3mf");
    assert.equal(worker.closedHandles.length, 3); // 1 + 2 closed

    // Diff against preset by name
    engine.savePreset({
      name: "Tuned Speed",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { wall_loops: "4" },
      created: "2026-10-21",
    });
    const diffPreset = await engine.diff(fakeFileA, { preset: "tuned speed" });
    assert.equal(diffPreset.bLabel, "Tuned Speed");
    assert.equal(worker.closedHandles.length, 4); // 3 + 1 closed

    // Diff against stock
    const diffStock = await engine.diff(fakeFileA, { stock: "snapmaker-u1-0.4-standard" });
    assert.equal(diffStock.bLabel, "snapmaker-u1-0.4-standard");
    assert.equal(worker.closedHandles.length, 5); // 4 + 1 closed
  });
});

describe("PresetsManagerModal intro copy", () => {
  it("uses neutral intro copy without first-person pronouns (I, we, us, our)", () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const modalPath = path.resolve(__dirname, "components/PresetsManagerModal.svelte");
    const content = fs.readFileSync(modalPath, "utf8");
    assert.ok(
      content.includes("Your changed walls, infill, supports and speeds become a reusable preset."),
      "drop-subtitle should use neutral wording"
    );
    assert.ok(
      !content.includes("We'll extract your customized walls"),
      "should not use 'We'll extract'"
    );
  });
});

describe("RealPresetsEngine and the Snapmaker Orca release", () => {
  it("sends the current release with every worker call that reads profiles, and keeps stock profiles per release", async () => {
    const calls: Array<[string, unknown]> = [];
    const project = {
      matchProfile: async (release: unknown) => (calls.push(["matchProfile", release]), { profileId: "snapmaker-u1-0.4-standard" }),
      extractPreset: async (release: unknown) => (calls.push(["extractPreset", release]), {}),
      close: async () => {},
    };
    const worker = {
      open: async () => ({ project, inspection: {} }),
      resolvePreset: async (_preset: unknown, release: unknown) => (calls.push(["resolvePreset", release]), { described: [] }),
      listProfiles: async (filter: unknown) => (calls.push(["listProfiles", filter]), { profiles: [{ id: "p", displayName: "P" }] }),
      diff: async (_a: unknown, _b: unknown, options: unknown) => (calls.push(["diff", options]), {}),
    };
    let release: { snapmakerOrcaVersion?: string } = { snapmakerOrcaVersion: "2.4.0" };
    const engine = new RealPresetsEngine(new MemoryStorage(), () => worker as unknown as ConverterWorker, () => release);
    const file = new File([new Uint8Array([1])], "a.3mf");
    const preset = { name: "Mine", base: "snapmaker-u1-0.4-standard", changes: {} } as unknown as Preset;

    await engine.matchProfileForFile(file);
    await engine.extractPreset(file);
    await engine.resolvePreset(preset);
    await engine.diff(file, { stock: "snapmaker-u1-0.4-standard" }, { includeUnchanged: true });
    await engine.stockProfiles();
    await engine.stockProfiles();
    assert.deepEqual(calls, [
      ["matchProfile", { snapmakerOrcaVersion: "2.4.0" }],
      ["extractPreset", { snapmakerOrcaVersion: "2.4.0" }],
      ["resolvePreset", { snapmakerOrcaVersion: "2.4.0" }],
      ["diff", { includeUnchanged: true, snapmakerOrcaVersion: "2.4.0" }],
      ["listProfiles", { snapmakerOrcaVersion: "2.4.0" }],
    ]);

    release = {};
    calls.length = 0;
    await engine.stockProfiles();
    assert.deepEqual(calls, [["listProfiles", {}]], "another release's stock profiles are fetched, not reused");
  });
});
