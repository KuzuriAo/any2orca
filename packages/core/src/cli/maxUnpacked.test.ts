// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMaxUnpacked, runCli, type CliIo } from "./main.js";

let dir: string;
let out: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_TELEMETRY: "0", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line) => out.push(line),
  err: (line) => out.push(line),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-max-unpacked-"));
  out = [];
  // The demo project plus 1.5 MB of incompressible data, so it unpacks to more than 1 MB with an honest ratio.
  const entries = unzipSync(new Uint8Array(readFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url))));
  let seed = 7;
  entries["Metadata/padding.bin"] = Uint8Array.from({ length: 1.5 * 1024 * 1024 }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  writeFileSync(join(dir, "padded.3mf"), zipSync(entries));
  vi.spyOn(console, "log").mockImplementation((line: string) => void out.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => void out.push(line));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("parseMaxUnpacked", () => {
  it("reads GB, MB and plain bytes", () => {
    expect(parseMaxUnpacked("4GB")).toBe(4 * 1024 ** 3);
    expect(parseMaxUnpacked("3000mb")).toBe(3000 * 1024 ** 2);
    expect(parseMaxUnpacked("1.5GB")).toBe(1.5 * 1024 ** 3);
    expect(parseMaxUnpacked("2097152")).toBe(2097152);
  });

  it("refuses anything else, and sizes out of range, instead of guessing", () => {
    for (const bad of ["", "big", "4 TB", "-1GB", "0.5MB", "17GB", "1e3GB", "4GB; rm -rf", "9".repeat(40)]) {
      expect(() => parseMaxUnpacked(bad), bad).toThrow(/--max-unpacked takes a size/);
    }
  });
});

describe("any2orca convert --max-unpacked", () => {
  it("converts within the limit, and refuses a project over a lowered one with the reason", async () => {
    expect(await runCli(["convert", join(dir, "padded.3mf"), "--out-dir", join(dir, "ok")], io())).toBe(0);
    expect(await runCli(["convert", join(dir, "padded.3mf"), "--out-dir", join(dir, "small"), "--max-unpacked", "1MB"], io())).toBe(1);
    expect(out.join("\n")).toMatch(/This project is too large: it unpacks to more than 1 MB, the limit set for this conversion\. Raise the limit with --max-unpacked/);
    expect(out.join("\n")).not.toMatch(/maxUnpackedBytes/);
  });

  it("refuses a value it can't read before converting anything", async () => {
    expect(await runCli(["convert", join(dir, "padded.3mf"), "--max-unpacked", "lots"], io())).toBe(1);
    expect(out.join("\n")).toMatch(/--max-unpacked takes a size/);
  });
});
