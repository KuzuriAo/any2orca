// SPDX-License-Identifier: MIT
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeStamp, STAMP_PATH } from "../stamp.js";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let input: string;

const io = (): CliIo => ({ env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") }, isTTY: false, out: () => {}, err: () => {} });
const output = (name: string) => unzipSync(new Uint8Array(readFileSync(join(dir, name))));
const nozzleType = (name: string) => JSON.parse(strFromU8(output(name)["Metadata/project_settings.config"])).nozzle_type;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-nozzle-"));
  input = join(dir, "model.3mf");
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("--hardened-nozzle", () => {
  it("records the stock stainless 0.4 nozzle by default", async () => {
    expect(await runCli(["convert", input, "--profile", "snapmaker-u1-0.4-standard"], io())).toBe(0);
    expect(nozzleType("model_U1.3mf")).toBe("stainless_steel");
    expect(decodeStamp(output("model_U1.3mf")[STAMP_PATH])?.options.hardenedNozzles).toBe(false);
  });

  it("records hardened steel nozzles when asked, in the settings and the version note", async () => {
    expect(await runCli(["convert", input, "--profile", "snapmaker-u1-0.4-standard", "--hardened-nozzle"], io())).toBe(0);
    expect(nozzleType("model_U1.3mf")).toBe("hardened_steel");
    expect(decodeStamp(output("model_U1.3mf")[STAMP_PATH])?.options.hardenedNozzles).toBe(true);
  });

  it("is documented in the command's help", async () => {
    const lines: string[] = [];
    await runCli(["convert", "--help"], { ...io(), out: (line: string) => lines.push(line) });
    expect(lines.join("\n")).toContain("--hardened-nozzle");
  });
});
