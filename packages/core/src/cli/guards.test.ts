// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli, type CliIo } from "./main.js";
import { loadStateFile } from "./watchState.js";
import { safeTerminalText } from "./terminalText.js";

let dir: string;
let out: string[];
let err: string[];
let requests: string[];
const FIXTURE = new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url);

function io(env: Record<string, string | undefined> = {}, isTTY = false): CliIo {
  const fetchSpy = vi.fn(async (url: string | URL) => {
    requests.push(String(url));
    return new Response(JSON.stringify({ version: "0.0.1" }));
  });
  return {
    env: { ANY2ORCA_CONFIG_DIR: join(dir, "config"), ...env },
    isTTY,
    out: (l) => void out.push(l),
    err: (l) => void err.push(l),
    fetch: fetchSpy as unknown as typeof fetch,
  };
}

/** Windows only lets a symbolic link be made with Developer Mode or administrator rights; without them those tests can't run. */
function canSymlink(): boolean {
  try {
    writeFileSync(join(dir, "SymlinkProbeTarget"), "");
    symlinkSync(join(dir, "SymlinkProbeTarget"), join(dir, "SymlinkProbeLink"));
    return true;
  } catch {
    return false;
  }
}

function caseInsensitiveFs(): boolean {
  writeFileSync(join(dir, "CaseProbe"), "");
  return existsSync(join(dir, "caseprobe"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-cli-guards-"));
  out = [];
  err = [];
  requests = [];
  vi.spyOn(console, "log").mockImplementation((l) => void out.push(String(l)));
  vi.spyOn(console, "error").mockImplementation((l) => void err.push(String(l)));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("folders and files that are the same thing under another name", () => {
  it("refuses --watch with --archive-dir pointing at the watched folder", async () => {
    mkdirSync(join(dir, "wd"));
    mkdirSync(join(dir, "wo"));
    expect(await runCli(["convert", "--watch", join(dir, "wd"), "--out-dir", join(dir, "wo"), "--archive-dir", join(dir, "wd")], io())).toBe(1);
    expect(err.join("\n")).toMatch(/archive-dir/);
  });

  it("refuses a one-shot --archive-dir that is the input's own folder, leaving the input in place", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    mkdirSync(join(dir, "o"));
    expect(await runCli(["convert", join(dir, "a.3mf"), "--out-dir", join(dir, "o"), "--archive-dir", dir], io())).toBe(1);
    expect(readdirSync(dir).filter((f) => f.endsWith(".3mf"))).toEqual(["a.3mf"]);
  });

  it("refuses --out-dir that is the watched folder through a symlink", async (ctx) => {
    if (!canSymlink()) ctx.skip();
    mkdirSync(join(dir, "wd"));
    symlinkSync(join(dir, "wd"), join(dir, "link"));
    expect(await runCli(["convert", "--watch", join(dir, "wd"), "--out-dir", join(dir, "link")], io())).toBe(1);
  });

  it("refuses to overwrite the input when the output differs from it only by case", async (ctx) => {
    // Only a case-insensitive file system (macOS, Windows) can make the two names one file.
    if (!caseInsensitiveFs()) ctx.skip();
    copyFileSync(FIXTURE, join(dir, "Small.3MF"));
    const before = readFileSync(join(dir, "Small.3MF"));
    expect(await runCli(["convert", join(dir, "Small.3MF"), "--suffix", ""], io())).toBe(1);
    expect(readFileSync(join(dir, "Small.3MF")).equals(before)).toBe(true);
  });

  it("refuses to write through an output that is a symlink to the input", async (ctx) => {
    if (!canSymlink()) ctx.skip();
    mkdirSync(join(dir, "in"));
    mkdirSync(join(dir, "o"));
    copyFileSync(FIXTURE, join(dir, "in", "m.3mf"));
    symlinkSync(join(dir, "in", "m.3mf"), join(dir, "o", "m_U1.3mf"));
    const before = readFileSync(join(dir, "in", "m.3mf"));
    expect(await runCli(["convert", join(dir, "in", "m.3mf"), "--out-dir", join(dir, "o")], io())).toBe(1);
    expect(readFileSync(join(dir, "in", "m.3mf")).equals(before)).toBe(true);
  });
});

describe("two inputs with the same name in one batch", () => {
  it("doesn't let the second overwrite the first's output", async () => {
    for (const sub of ["a", "b"]) {
      mkdirSync(join(dir, sub));
      copyFileSync(FIXTURE, join(dir, sub, "model.3mf"));
    }
    mkdirSync(join(dir, "o"));
    expect(await runCli(["convert", join(dir, "a", "model.3mf"), join(dir, "b", "model.3mf"), "--out-dir", join(dir, "o")], io())).toBe(1);
    expect(err.join("\n")).toMatch(/model_U1\.3mf/);
  });
});

describe("ANY2ORCA_STATS_ENDPOINT", () => {
  it("an unrelated value doesn't stop a conversion while stats are off", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    expect(await runCli(["convert", join(dir, "a.3mf"), "--dry-run"], io({ ANY2ORCA_STATS_ENDPOINT: "statsd://metrics:8125" }))).toBe(0);
  });

  it("is still checked when stats are on", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    expect(await runCli(["convert", join(dir, "a.3mf"), "--dry-run"], io({ ANY2ORCA_STATS_ENDPOINT: "statsd://metrics:8125", ANY2ORCA_TELEMETRY: "1" }))).toBe(1);
  });
});

describe("a tracked file that isn't readable as a 3MF the first time", () => {
  it("is retried once before it's recorded as permanently failed", async () => {
    writeFileSync(join(dir, "half.3mf"), readFileSync(FIXTURE).subarray(0, 100));
    mkdirSync(join(dir, "o"));
    await runCli(["convert", join(dir, "half.3mf"), "--out-dir", join(dir, "o"), "--skip-existing"], io());
    expect(loadStateFile(join(dir, "o"))["half.3mf"]?.outcome).not.toBe("permanently-failed");
    await runCli(["convert", join(dir, "half.3mf"), "--out-dir", join(dir, "o"), "--skip-existing"], io());
    expect(loadStateFile(join(dir, "o"))["half.3mf"]?.outcome).toBe("permanently-failed");
  });
});

describe("the update check", () => {
  for (const args of [["telemetry", "show"], ["--version"], ["nonsense"], ["telemetry", "update-check", "off"]]) {
    it(`doesn't run for "${args.join(" ")}"`, async () => {
      await runCli(args, io({}, true));
      expect(requests).toEqual([]);
    });
  }
});

describe("file system errors", () => {
  it("are sentences, not errno text", async () => {
    mkdirSync(join(dir, "folder.3mf"));
    await runCli(["convert", join(dir, "folder.3mf")], io());
    await runCli(["presets", "import", join(dir, "nope.json")], io());
    expect(err.join("\n")).not.toMatch(/EISDIR|ENOENT|illegal operation/);
  });
});

describe("--json output", () => {
  it("keeps C1 and direction characters as JSON escapes instead of replacement characters", async () => {
    const lines: string[] = [];
    const jio: CliIo = { ...io(), out: (l) => void lines.push(l) };
    const a = join(dir, "a.3mf");
    copyFileSync(FIXTURE, a);
    // A setting value with a direction override, compared as JSON.
    const { unzipSync, zipSync } = await import("fflate");
    const entries = unzipSync(readFileSync(a));
    const text = new TextDecoder().decode(entries["Metadata/project_settings.config"]);
    const settings = JSON.parse(text.slice(0, text.lastIndexOf("}") + 1));
    settings.wall_loops = "3‮";
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(settings));
    writeFileSync(join(dir, "b.3mf"), zipSync(entries));
    await runCli(["diff", a, join(dir, "b.3mf"), "--json"], jio);
    const joined = lines.join("\n");
    expect(joined).not.toContain("�");
    expect(joined).not.toContain("‮");
    expect(joined).toContain("\\u202e");
  });
});

describe("terminal text", () => {
  it("replaces zero-width and invisible characters too", () => {
    for (const c of ["​", "‎", "؜", "﻿", " ", "­"]) expect(safeTerminalText(`a${c}b`)).not.toContain(c);
  });
});

describe("telemetry show", () => {
  it("shows the saved update-check setting even when output isn't a terminal", async () => {
    await runCli(["telemetry", "show"], io());
    expect(out.join("\n")).toMatch(/Update check: off \(output isn't a terminal\)/);
    expect(out.join("\n")).toMatch(/Saved setting: on/);
  });
});

describe("convert options", () => {
  it("creates --out-dir when it's missing, like --archive-dir", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    expect(await runCli(["convert", join(dir, "a.3mf"), "--out-dir", join(dir, "new")], io())).toBe(0);
    expect(existsSync(join(dir, "new", "a_U1.3mf"))).toBe(true);
  });

  it("says (replaced) when an earlier output is overwritten", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    await runCli(["convert", join(dir, "a.3mf")], io());
    out = [];
    await runCli(["convert", join(dir, "a.3mf")], io());
    expect(out.join("\n")).toMatch(/\(replaced\)/);
  });

  it("--dry-run names the profile by its display name", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    await runCli(["convert", join(dir, "a.3mf"), "--dry-run"], io());
    expect(out.join("\n")).toMatch(/mm (Standard|Fine|Draft|Extra|Optimal|Strength)/);
  });

  it("help lines stay within 100 characters", async () => {
    await runCli(["convert", "--help"], io());
    expect(out.join("\n").split("\n").filter((l) => l.length > 100)).toEqual([]);
  });

  it("--allow-above-stock is gone", async () => {
    copyFileSync(FIXTURE, join(dir, "a.3mf"));
    expect(await runCli(["convert", join(dir, "a.3mf"), "--allow-above-stock", "--dry-run"], io())).toBe(1);
  });
});
