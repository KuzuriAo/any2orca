// SPDX-License-Identifier: MIT
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let input: string;

const io = (): CliIo => ({ env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") }, isTTY: false, out: () => {}, err: () => {} });
const entries = (file: string) => Object.keys(unzipSync(new Uint8Array(readFileSync(file))));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-stamp-"));
  input = join(dir, "model.3mf");
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("--no-stamp", () => {
  it("writes the version note by default", async () => {
    expect(await runCli(["convert", input], io())).toBe(0);
    expect(entries(join(dir, "model_U1.3mf"))).toContain("Metadata/any2orca.json");
  });

  it("leaves the version note out when asked, and the rest of the file is the same", async () => {
    expect(await runCli(["convert", input], io())).toBe(0);
    const withStamp = entries(join(dir, "model_U1.3mf"));
    expect(await runCli(["convert", input, "--no-stamp", "--suffix", "_nostamp"], io())).toBe(0);
    const without = entries(join(dir, "model_nostamp.3mf"));
    expect(without).not.toContain("Metadata/any2orca.json");
    expect(without.sort()).toEqual(withStamp.filter((name) => name !== "Metadata/any2orca.json").sort());
  });

  it("is documented in the command's help", async () => {
    const lines: string[] = [];
    await runCli(["convert", "--help"], { ...io(), out: (line: string) => lines.push(line) });
    expect(lines.join("\n")).toContain("--no-stamp");
  });
});
