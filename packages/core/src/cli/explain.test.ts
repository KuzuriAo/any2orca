// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let out: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_TELEMETRY: "0", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line) => out.push(line),
  err: (line) => out.push(line),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-explain-"));
  out = [];
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), join(dir, "demo.3mf"));
  // Conversion progress goes through the CLI's logger, which writes to the console.
  vi.spyOn(console, "log").mockImplementation((line: string) => void out.push(line));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("any2orca convert --explain", () => {
  it("prints what changed, grouped by why, after the file", async () => {
    expect(await runCli(["convert", join(dir, "demo.3mf"), "--explain", "--hardened-nozzle"], io())).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("    Converted with 0.20mm Standard @Snapmaker U1 (0.4 nozzle) (matched to the file).");
    expect(text.indexOf("From the creator's file")).toBeLessThan(text.indexOf("Your choices"));
    expect(text).toMatch(/Nozzle type \[nozzle_type\]: stainless_steel -> hardened_steel \(hardened steel nozzles\)/);
    expect(existsSync(join(dir, "demo_U1.what-changed.json"))).toBe(false);
  });

  it("writes the JSON export, with every difference, next to the output", async () => {
    expect(await runCli(["convert", join(dir, "demo.3mf"), "--explain-json"], io())).toBe(0);
    const json = JSON.parse(readFileSync(join(dir, "demo_U1.what-changed.json"), "utf-8"));
    expect(json).toMatchObject({ format: "any2orca-what-changed", version: 1, diff: { format: "any2orca-diff" } });
    expect(json.groups.length).toBeGreaterThan(0);
  });

  it("is in the convert help", async () => {
    await runCli(["convert", "--help"], io());
    expect(out.join("\n")).toContain("--explain-json");
  });
});

describe("any2orca convert --use-stock / --keep-higher", () => {
  it("applies the choice for values above stock, and rejects a setting it can't apply to before converting", async () => {
    expect(await runCli(["convert", join(dir, "demo.3mf"), "--use-stock", "outer_wall_speed", "--keep-higher", "travel_speed,outer_wall_acceleration"], io())).toBe(0);
    const stamp = JSON.parse(strFromU8(unzipSync(new Uint8Array(readFileSync(join(dir, "demo_U1.3mf"))))["Metadata/any2orca.json"]));
    expect(stamp.options.aboveStock).toEqual({ keep: ["outer_wall_acceleration", "travel_speed"], stock: ["outer_wall_speed"] });
    out = [];
    expect(await runCli(["convert", join(dir, "demo.3mf"), "--suffix", "_other", "--use-stock", "nozzle_temperature"], io())).toBe(1);
    expect(out.join("\n")).toMatch(/Error: aboveStock\.stock: "nozzle_temperature" isn't/);
    expect(existsSync(join(dir, "demo_other.3mf"))).toBe(false);
  });
});
