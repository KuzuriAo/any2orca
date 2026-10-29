// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliIo } from "./main.js";
import { presetSlug } from "./commands/presets.js";

const SETTINGS_PATH = "Metadata/project_settings.config";
let dir: string;
let out: string[];
let err: string[];

const io = (configName = "config"): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_TELEMETRY: "0", ANY2ORCA_CONFIG_DIR: join(dir, configName) },
  isTTY: false,
  out: (line) => out.push(line),
  err: (line) => err.push(line),
});

function settingsOf(path: string): Record<string, unknown> {
  return JSON.parse(strFromU8(unzipSync(new Uint8Array(readFileSync(path)))[SETTINGS_PATH]));
}

/** A tuned master: the demo converted onto 0.20mm Standard, then edited as if in Snapmaker Orca. */
async function master(name: string, edit: (s: Record<string, unknown>) => void): Promise<string> {
  const source = join(dir, "demo.3mf");
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), source);
  expect(await runCli(["convert", source, "--profile", "snapmaker-u1-0.4-standard", "--no-stamp", "--suffix", "_converted"], io())).toBe(0);
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, "demo_converted.3mf"))));
  const settings = JSON.parse(strFromU8(files[SETTINGS_PATH]));
  edit(settings);
  files[SETTINGS_PATH] = strToU8(JSON.stringify(settings));
  const path = join(dir, name);
  writeFileSync(path, zipSync(files));
  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-presets-"));
  out = [];
  err = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("any2orca diff --against-preset", () => {
  it("compares a project with a saved preset, or a presets file, as it converts", async () => {
    const tuned = await master("tuned.3mf", (s) => {
      s.wall_loops = "4";
    });
    expect(await runCli(["presets", "add", "My walls", tuned], io())).toBe(0);
    const source = join(dir, "demo.3mf");
    const wallLoopsOnPresetSide = () => {
      const diff = JSON.parse(out.join("\n"));
      const rows = diff.groups.flatMap((g: { rows: { key: string; b: string | null }[] }) => g.rows);
      return { diff, b: rows.find((r: { key: string }) => r.key === "wall_loops")?.b };
    };

    out = [];
    expect(await runCli(["diff", source, "--against-preset", "My walls", "--json", "--all"], io())).toBe(1);
    const saved = wallLoopsOnPresetSide();
    expect(saved.diff.bLabel).toBe("Your preset My walls on 0.20mm Standard @Snapmaker U1 (0.4 nozzle)");
    expect(saved.diff.groups.map((g: { group: string }) => g.group)).toEqual(["print"]);
    expect(saved.b).toBe("4");

    const file = join(dir, "walls.json");
    expect(await runCli(["presets", "export", "My walls", "--out", file], io())).toBe(0);
    out = [];
    expect(await runCli(["diff", source, "--against-preset", file, "--json", "--all"], io())).toBe(1);
    expect(wallLoopsOnPresetSide().b).toBe("4");
  });

  it("refuses two files, both comparisons at once, or a preset it can't find", async () => {
    const source = join(dir, "demo.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), source);
    err = [];
    expect(await runCli(["diff", source, "--against-preset", "Nothing saved"], io())).toBe(2);
    expect(err.join("\n")).toMatch(/No saved preset named "Nothing saved"/);

    const tuned = await master("tuned.3mf", (s) => {
      s.wall_loops = "4";
    });
    await runCli(["presets", "add", "Walls", tuned], io());
    for (const [args, message] of [
      [["diff", source, source, "--against-preset", "Walls"], /--against-preset compares one \.3mf/],
      [["diff", source, "--against-stock", "--against-preset", "Walls"], /--against-stock or --against-preset, not both/],
    ] as const) {
      err = [];
      expect(await runCli([...args], io()), args.join(" ")).toBe(2);
      expect(err.join("\n")).toMatch(message);
    }
  });
});

describe("any2orca presets", () => {
  it("saves a preset from a tuned file, lists, shows, converts with it and removes it", async () => {
    const tuned = await master("tuned.3mf", (s) => {
      s.wall_loops = "4";
      s.top_shell_layers = "6";
    });
    out = [];
    expect(await runCli(["presets", "add", "My walls", tuned], io())).toBe(0);
    expect(out.join("\n")).toMatch(/My walls: \d+ changes? on 0\.20mm Standard @Snapmaker U1 \(0\.4 nozzle\)/);
    expect(existsSync(join(dir, "config", "presets", "my-walls.json"))).toBe(true);

    out = [];
    await runCli(["presets", "list"], io());
    expect(out.join("\n")).toMatch(/My walls\s+snapmaker-u1-0\.4-standard/);

    out = [];
    await runCli(["presets", "show", "my walls"], io());
    expect(out.join("\n")).toMatch(/Wall loops \[wall_loops\]\s+\d+\s+4/);

    const source = join(dir, "other.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-creality.3mf", import.meta.url), source);
    expect(await runCli(["convert", source, "--preset", "My walls"], io())).toBe(0);
    expect(settingsOf(join(dir, "other_U1.3mf"))).toMatchObject({ wall_loops: "4", top_shell_layers: "6" });

    out = [];
    expect(await runCli(["presets", "remove", "My walls"], io())).toBe(0);
    expect(readdirSync(join(dir, "config", "presets"))).toEqual([]);
  });

  it("lists speeds above stock and won't save them without a choice", async () => {
    const tuned = await master("fast.3mf", (s) => {
      s.sparse_infill_speed = "480";
    });
    err = [];
    expect(await runCli(["presets", "add", "Fast", tuned], io())).toBe(1);
    expect(err.join("\n")).toMatch(/Not saved\.[\s\S]*faster than Snapmaker's stock profile[\s\S]*--above-stock keep[\s\S]*--keep <setting/);
    expect(existsSync(join(dir, "config", "presets", "fast.json"))).toBe(false);
    expect(await runCli(["presets", "add", "Fast", tuned, "--above-stock", "keep"], io())).toBe(0);
    expect(existsSync(join(dir, "config", "presets", "fast.json"))).toBe(true);
  });

  it("keeps all, none, or only some values above stock, as chosen", async () => {
    const tuned = await master("fast.3mf", (s) => {
      s.sparse_infill_speed = "480";
      s.inner_wall_speed = "400";
      s.wall_loops = "4";
    });
    const saved = (name: string) => JSON.parse(readFileSync(join(dir, "config", "presets", `${name}.json`), "utf-8")).presets[0].changes;
    out = [];
    expect(await runCli(["presets", "add", "Stock", tuned, "--above-stock", "stock"], io())).toBe(0);
    expect(saved("stock")).toEqual({ wall_loops: "4" });
    expect(out.join("\n")).toMatch(/Snapmaker's stock value for: .*Sparse infill \(270\)/);
    expect(await runCli(["presets", "add", "Some", tuned, "--keep", "sparse_infill_speed"], io())).toBe(0);
    expect(saved("some")).toEqual({ wall_loops: "4", sparse_infill_speed: "480" });
    expect(await runCli(["presets", "add", "All", tuned, "--above-stock", "keep"], io())).toBe(0);
    expect(saved("all")).toMatchObject({ sparse_infill_speed: "480", inner_wall_speed: "400" });
    for (const args of [
      ["presets", "add", "Bad", tuned, "--keep", "wall_loops"],
      ["presets", "add", "Bad", tuned, "--above-stock", "maybe"],
      ["presets", "add", "Bad", tuned, "--above-stock", "keep", "--keep", "sparse_infill_speed"],
    ]) {
      err = [];
      expect(await runCli(args, io()), args.join(" ")).toBe(1);
      expect(err.join("\n"), args.join(" ")).toMatch(/^Error: /);
    }
  });

  it("exports and imports, and asks again for speeds above stock from someone else's file", async () => {
    await runCli(["presets", "add", "Walls", await master("a.3mf", (s) => void (s.wall_loops = "4"))], io());
    await runCli(["presets", "add", "Fast", await master("b.3mf", (s) => void (s.sparse_infill_speed = "480")), "--above-stock", "keep"], io());
    const exported = join(dir, "shared.json");
    expect(await runCli(["presets", "export", "--out", exported], io())).toBe(0);
    expect(JSON.parse(readFileSync(exported, "utf-8"))).toMatchObject({ format: "any2orca-presets", version: 1 });

    out = [];
    expect(await runCli(["presets", "import", exported], io("other-config"))).toBe(1);
    expect(out.join("\n")).toContain("Imported Walls");
    expect(out.join("\n")).toMatch(/Skipped Fast: .*faster than Snapmaker's stock profile/);
    expect(out.join("\n")).toContain("1 imported, 1 skipped.");
    out = [];
    expect(await runCli(["presets", "import", exported, "--above-stock", "keep"], io("other-config"))).toBe(1);
    expect(out.join("\n")).toMatch(/Skipped Walls: A preset named "Walls" already exists/);
  });

  it("converts with a presets file holding one preset, asking for a choice where needed", async () => {
    await runCli(["presets", "add", "Fast", await master("b.3mf", (s) => void (s.sparse_infill_speed = "480")), "--above-stock", "keep"], io());
    const file = join(dir, "fast.json");
    await runCli(["presets", "export", "Fast", "--out", file], io());
    const source = join(dir, "other.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-creality.3mf", import.meta.url), source);
    err = [];
    expect(await runCli(["convert", source, "--preset", file], io("fresh"))).toBe(1);
    expect(err.join("\n")).toMatch(/To use the preset, choose: --above-stock keep/);
    expect(await runCli(["convert", source, "--preset", file, "--above-stock", "keep"], io("fresh"))).toBe(0);
  });

  it("rejects bad input with a clear message", async () => {
    const source = join(dir, "demo.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), source);
    const cases: string[][] = [
      ["presets", "add", "Not U1", source],
      ["presets", "add", "x"],
      ["presets", "show", "nothing"],
      ["presets", "remove", "nothing"],
      ["presets", "frobnicate"],
      ["convert", source, "--preset", "nothing"],
      ["convert", source, "--preset", "x", "--profile", "snapmaker-u1-0.4-standard"],
    ];
    for (const args of cases) {
      err = [];
      expect(await runCli(args, io()), args.join(" ")).toBe(1);
      expect(err.join("\n"), args.join(" ")).toMatch(/^Error: /);
    }
    expect(() => presetSlug("!!!")).toThrow();
    expect(presetSlug("My CPL settings")).toBe("my-cpl-settings");
    expect(presetSlug("../../etc/passwd")).toBe("etc-passwd");
  });

  it("skips a saved file that isn't a valid preset instead of using it", async () => {
    await runCli(["presets", "add", "Walls", await master("a.3mf", (s) => void (s.wall_loops = "4"))], io());
    writeFileSync(join(dir, "config", "presets", "broken.json"), '{"format":"any2orca-presets","version":1,"presets":[{"name":"Evil","__proto__":{}}]}');
    out = [];
    err = [];
    await runCli(["presets", "list"], io());
    expect(out.join("\n")).toContain("Walls");
    expect(out.join("\n")).not.toContain("Evil");
    expect(err.join("\n")).toContain("Skipping broken.json");
  });

  it("is documented in the command's help and the top-level help", async () => {
    await runCli(["presets", "--help"], io());
    expect(out.join("\n")).toContain("presets add <name> <tuned.3mf>");
    out = [];
    await runCli(["convert", "--help"], io());
    expect(out.join("\n")).toContain("--preset <name|file>");
    out = [];
    await runCli(["--help"], io());
    expect(out.join("\n")).toContain("presets add");
  });
});
