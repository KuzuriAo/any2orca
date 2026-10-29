// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandInputPatterns, MAX_WILDCARD_MATCHES } from "./expandWildcards.js";
import { runCli, type CliIo } from "./main.js";

let dir: string;
const touch = (name: string) => writeFileSync(join(dir, name), "x");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-glob-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("expandInputPatterns", () => {
  it("leaves arguments without wildcards alone, even for files that don't exist", () => {
    expect(expandInputPatterns(["a.3mf", join(dir, "missing.3mf")])).toEqual(["a.3mf", join(dir, "missing.3mf")]);
  });

  it("expands * and ? in the file name, sorted, files only", () => {
    for (const name of ["b.3mf", "a.3mf", "c.zip", "d1.3mf", "d22.3mf"]) touch(name);
    mkdirSync(join(dir, "folder.3mf"));
    expect(expandInputPatterns([join(dir, "*.3mf")])).toEqual([join(dir, "a.3mf"), join(dir, "b.3mf"), join(dir, "d1.3mf"), join(dir, "d22.3mf")]);
    expect(expandInputPatterns([join(dir, "d?.3mf")])).toEqual([join(dir, "d1.3mf")]);
  });

  it("works in a folder whose name has spaces", () => {
    const spaced = join(dir, "my files");
    mkdirSync(spaced);
    writeFileSync(join(spaced, "one two.3mf"), "x");
    expect(expandInputPatterns([join(spaced, "*.3mf")])).toEqual([join(spaced, "one two.3mf")]);
  });

  it("matches case-insensitively only when asked (Windows)", () => {
    touch("Model.3MF");
    expect(() => expandInputPatterns([join(dir, "*.3mf")], { caseInsensitive: false })).toThrow(/No files match/);
    expect(expandInputPatterns([join(dir, "*.3mf")], { caseInsensitive: true })).toEqual([join(dir, "Model.3MF")]);
  });

  it("skips names starting with a dot unless the pattern does", () => {
    touch(".hidden.3mf");
    touch("shown.3mf");
    expect(expandInputPatterns([join(dir, "*.3mf")])).toEqual([join(dir, "shown.3mf")]);
    expect(expandInputPatterns([join(dir, ".*.3mf")])).toEqual([join(dir, ".hidden.3mf")]);
  });

  it("treats other regular-expression characters in a pattern as plain text", () => {
    touch("a+b(1).3mf");
    touch("aab1.3mf");
    expect(expandInputPatterns([join(dir, "a+b(1)*.3mf")])).toEqual([join(dir, "a+b(1).3mf")]);
  });

  it("keeps a file that really has a wildcard in its name when it exists", (ctx) => {
    if (process.platform === "win32") ctx.skip(); // not a legal name there
    touch("odd*.3mf");
    touch("oddity.3mf");
    expect(expandInputPatterns([join(dir, "odd*.3mf")])).toEqual([join(dir, "odd*.3mf")]);
  });

  it("does not add a file twice", () => {
    touch("a.3mf");
    expect(expandInputPatterns([join(dir, "a.3mf"), join(dir, "*.3mf")])).toEqual([join(dir, "a.3mf")]);
  });

  it("refuses wildcards in folder names, patterns that match nothing, and a missing folder", () => {
    expect(() => expandInputPatterns([join(dir, "*", "a.3mf")])).toThrow(/file name only/);
    expect(() => expandInputPatterns([join(dir, "*.3mf")])).toThrow(/No files match/);
    expect(() => expandInputPatterns([join(dir, "nope", "*.3mf")])).toThrow(/Error reading .*doesn't exist/);
  });

  it("stops at a bounded number of matches and at an absurd pattern length", () => {
    for (let i = 0; i <= MAX_WILDCARD_MATCHES; i++) writeFileSync(join(dir, `f${i}.3mf`), "");
    expect(() => expandInputPatterns([join(dir, "*.3mf")])).toThrow(/more than/);
    expect(() => expandInputPatterns([`${"a".repeat(600)}*`])).toThrow(/can't be right/);
  }, 60_000);
});

describe("convert with a wildcard", () => {
  it("converts every file the pattern names", async () => {
    const fixture = new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url);
    copyFileSync(fixture, join(dir, "one.3mf"));
    copyFileSync(fixture, join(dir, "two.3mf"));
    const io: CliIo = { env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") }, isTTY: false, out: () => {}, err: () => {} };
    expect(await runCli(["convert", join(dir, "*.3mf"), "--out-dir", join(dir, "out")], io)).toBe(0);
    expect(existsSync(join(dir, "out", "one_U1.3mf"))).toBe(true);
    expect(existsSync(join(dir, "out", "two_U1.3mf"))).toBe(true);
  });
});
