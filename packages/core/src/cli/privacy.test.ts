// SPDX-License-Identifier: MIT
/**
 * The CLI's network promises, tested: with the update check off it makes
 * no request at all, the update check only ever contacts the npm registry,
 * and stats are never sent unless turned on with somewhere to send them.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatsEventSchema } from "../telemetry.js";
import { runCli, type CliIo } from "./main.js";
import { REGISTRY_LATEST_URL } from "./updateCheck.js";

let dir: string;
let input: string;
let requests: string[];
let bodies: string[];

function io(env: Record<string, string | undefined>, isTTY = false): CliIo {
  const fetchSpy = vi.fn(async (url: string | URL, init?: RequestInit) => {
    requests.push(String(url));
    if (typeof init?.body === "string") bodies.push(init.body);
    return new Response(JSON.stringify({ version: "99.0.0" }));
  });
  return { env: { ANY2ORCA_CONFIG_DIR: join(dir, "config"), ...env }, isTTY, out: () => {}, err: () => {}, fetch: fetchSpy as unknown as typeof fetch };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-privacy-"));
  input = join(dir, "model.3mf");
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
  requests = [];
  bodies = [];
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("CLI network access", () => {
  it("makes no request at all for a conversion with NO_UPDATE_NOTIFIER=1, even in a terminal", async () => {
    const realFetch = globalThis.fetch;
    const globalSpy = vi.fn();
    globalThis.fetch = globalSpy as unknown as typeof fetch;
    try {
      expect(await runCli(["convert", input], io({ NO_UPDATE_NOTIFIER: "1" }, true))).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(requests).toEqual([]);
    expect(globalSpy).not.toHaveBeenCalled();
    expect(readFileSync(join(dir, "model_U1.3mf")).byteLength).toBeGreaterThan(0);
  });

  it("makes no request when output isn't a terminal or in CI", async () => {
    await runCli(["convert", input], io({}, false));
    await runCli(["convert", input], io({ CI: "true" }, true));
    expect(requests).toEqual([]);
  });

  it("contacts only the npm registry for the update check, at most once a day", async () => {
    await runCli(["profiles"], io({}, true));
    await runCli(["profiles"], io({}, true));
    expect(requests).toEqual([REGISTRY_LATEST_URL]);
  });

  it("never sends stats when they're off, even with a collector configured", async () => {
    await runCli(["convert", input], io({ NO_UPDATE_NOTIFIER: "1", ANY2ORCA_STATS_ENDPOINT: "https://stats.example.test/e" }));
    expect(requests).toEqual([]);
  });

  it("lets DO_NOT_TRACK override an opt-in", async () => {
    await runCli(["telemetry", "on"], io({}));
    await runCli(["convert", input], io({ NO_UPDATE_NOTIFIER: "1", ANY2ORCA_STATS_ENDPOINT: "https://stats.example.test/e", DO_NOT_TRACK: "1" }));
    expect(requests).toEqual([]);
  });

  it("sends exactly the schema's event, and nothing else, when turned on", async () => {
    await runCli(["telemetry", "on"], io({}));
    await runCli(["convert", input], io({ NO_UPDATE_NOTIFIER: "1", ANY2ORCA_STATS_ENDPOINT: "https://stats.example.test/e" }));
    expect(requests).toEqual(["https://stats.example.test/e"]);
    expect(StatsEventSchema.safeParse(JSON.parse(bodies[0])).success).toBe(true);
    expect(bodies[0]).not.toContain("model");
  });

  it("reads the collector only from ANY2ORCA_STATS_ENDPOINT, not a generic STATS_ENDPOINT another tool might set", async () => {
    await runCli(["telemetry", "on"], io({}));
    await runCli(["convert", input], io({ NO_UPDATE_NOTIFIER: "1", STATS_ENDPOINT: "https://other-tool.example.test/e" }));
    expect(requests).toEqual([]);
  });

  it("prints the event instead of sending it with --dry-run-telemetry", async () => {
    const lines: string[] = [];
    await runCli(["telemetry", "on"], io({}));
    const cliIo = io({ NO_UPDATE_NOTIFIER: "1", ANY2ORCA_STATS_ENDPOINT: "https://stats.example.test/e" });
    const log = vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    try {
      await runCli(["convert", input, "--dry-run-telemetry"], cliIo);
    } finally {
      log.mockRestore();
    }
    expect(requests).toEqual([]);
    expect(lines.join("\n")).toContain('"profileId": "snapmaker-u1-0.4-standard"');
  });

  it("refuses a non-https collector when stats are on", async () => {
    const errors: string[] = [];
    const cliIo = { ...io({ NO_UPDATE_NOTIFIER: "1", ANY2ORCA_TELEMETRY: "1", ANY2ORCA_STATS_ENDPOINT: "http://stats.example.test/e" }), err: (l: string) => void errors.push(l) };
    expect(await runCli(["convert", input], cliIo)).toBe(1);
    expect(errors.join("\n")).toMatch(/https/);
  });
});
