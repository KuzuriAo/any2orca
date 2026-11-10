// SPDX-License-Identifier: MIT
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeStamp, STAMP_PATH } from "../stamp.js";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let input: string;
/** What the command printed: `io.out` for help and the nozzle command, the console for convert's own lines. */
let lines: string[];
let errors: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line: string) => lines.push(line),
  err: (line: string) => errors.push(line),
});
const output = (name: string) => unzipSync(new Uint8Array(readFileSync(join(dir, name))));
const settings = (name: string) => JSON.parse(strFromU8(output(name)["Metadata/project_settings.config"]));
const stamp = (name: string) => decodeStamp(output(name)[STAMP_PATH]);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-nozzle-size-"));
  input = join(dir, "model.3mf");
  // The synthetic demo project is set up for a 0.4 mm nozzle.
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
  lines = [];
  errors = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(" ")));
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

describe("--nozzle", () => {
  it("converts for 0.4 mm nozzles by default and records the choice", async () => {
    expect(await runCli(["convert", input], io())).toBe(0);
    expect(settings("model_U1.3mf").printer_settings_id).toBe("Snapmaker U1 (0.4 nozzle)");
    expect(stamp("model_U1.3mf")?.options.nozzle).toEqual({ choice: "0.4", size: "0.4" });
  });

  it("converts a 0.4 mm creator's file for the user's 0.6 mm nozzles, and says so", async () => {
    expect(await runCli(["convert", input, "--nozzle", "0.6"], io())).toBe(0);
    expect(settings("model_U1.3mf").printer_settings_id).toBe("Snapmaker U1 (0.6 nozzle)");
    expect(stamp("model_U1.3mf")?.options.nozzle).toEqual({ choice: "0.6", size: "0.6" });
    expect(lines.join("\n")).toMatch(/set up for a 0\.4 mm nozzle; converted for your 0\.6 mm nozzles/);
  });

  it('"match" converts for the creator\'s size', async () => {
    expect(await runCli(["convert", input, "--nozzle", "match"], io())).toBe(0);
    expect(settings("model_U1.3mf").printer_settings_id).toBe("Snapmaker U1 (0.4 nozzle)");
    expect(stamp("model_U1.3mf")?.options.nozzle).toEqual({ choice: "match", size: "0.4" });
  });

  it("refuses a profile of another size, and a value that isn't a size", async () => {
    expect(await runCli(["convert", input, "--nozzle", "0.4", "--profile", "snapmaker-u1-0.6-standard"], io())).not.toBe(0);
    expect(errors.join("\n")).toContain("0.6 mm nozzle profile, but the nozzle option says 0.4 mm");
    errors = [];
    expect(await runCli(["convert", input, "--nozzle", "half"], io())).not.toBe(0);
    expect(errors.join("\n")).toContain("--nozzle takes a nozzle size in mm");
    errors = [];
    expect(await runCli(["convert", input, "--nozzle", "1.2"], io())).not.toBe(0);
    expect(errors.join("\n")).toContain("no U1 profile for a 1.2 mm nozzle");
  });

  it("is documented in the command's help", async () => {
    await runCli(["convert", "--help"], io());
    expect(lines.join("\n")).toContain("--nozzle <size|match>");
  });
});

describe("any2orca nozzle", () => {
  it("shows the default, saves a size that convert then uses, and clears it", async () => {
    expect(await runCli(["nozzle"], io())).toBe(0);
    expect(lines.join("\n")).toContain("0.4 mm (the U1's stock size; nothing saved)");

    lines = [];
    expect(await runCli(["nozzle", "0.6"], io())).toBe(0);
    expect(lines.join("\n")).toContain("conversions are for 0.6 mm nozzles");
    expect(JSON.parse(readFileSync(join(dir, "config", "config.json"), "utf-8")).nozzle).toBe("0.6");
    expect(await runCli(["convert", input], io())).toBe(0);
    expect(settings("model_U1.3mf").printer_settings_id).toBe("Snapmaker U1 (0.6 nozzle)");
    expect(stamp("model_U1.3mf")?.options.nozzle).toEqual({ choice: "0.6", size: "0.6" });

    // --nozzle on a run wins over the saved size.
    expect(await runCli(["convert", input, "--nozzle", "0.4", "--suffix", "_stock"], io())).toBe(0);
    expect(settings("model_stock.3mf").printer_settings_id).toBe("Snapmaker U1 (0.4 nozzle)");

    lines = [];
    expect(await runCli(["nozzle", "show"], io())).toBe(0);
    expect(lines.join("\n")).toContain("0.6 mm (saved)");

    lines = [];
    expect(await runCli(["nozzle", "clear"], io())).toBe(0);
    expect(lines.join("\n")).toContain("the U1's stock size");
    expect(JSON.parse(readFileSync(join(dir, "config", "config.json"), "utf-8")).nozzle).toBeUndefined();
  });

  it("refuses a value that isn't a size and extra words", async () => {
    expect(await runCli(["nozzle", "big"], io())).not.toBe(0);
    expect(errors.join("\n")).toContain("any2orca nozzle takes a nozzle size in mm");
    errors = [];
    expect(await runCli(["nozzle", "0.4", "0.6"], io())).not.toBe(0);
    expect(errors.join("\n")).toContain("Usage: any2orca nozzle");
  });

  it("has help", async () => {
    expect(await runCli(["nozzle", "--help"], io())).toBe(0);
    expect(lines.join("\n")).toContain("Says which nozzle size your U1 has");
  });
});
