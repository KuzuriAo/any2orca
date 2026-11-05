// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCliConfig } from "./config.js";
import { updateNotice } from "./updateCheck.js";
import { loadStateFile } from "./watchState.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-config-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the CLI's config file", () => {
  const env = () => ({ ANY2ORCA_CONFIG_DIR: dir });

  it("keeps what has the expected shape and drops the rest", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ stats: { choice: "on", decidedOn: "2026-11-04" }, updateCheck: { enabled: false, lastCheckedAt: 5, latest: "9.9.9", outputAffecting: "Why." }, extra: 1 }));
    expect(readCliConfig(env())).toEqual({ stats: { choice: "on", decidedOn: "2026-11-04" }, updateCheck: { enabled: false, lastCheckedAt: 5, latest: "9.9.9", outputAffecting: "Why." } });
  });

  it("a value of the wrong type is dropped, not used", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ stats: { choice: "maybe", decidedOn: "x" }, updateCheck: { enabled: "yes", lastCheckedAt: "now", latest: { x: 1 }, outputAffecting: 7 } }));
    expect(readCliConfig(env())).toEqual({ updateCheck: {} });
    expect(updateNotice(env())).toBeNull();
    for (const body of ["[]", "null", '"text"', "{", '{"updateCheck":{"latest":["9.9.9"]}}']) {
      writeFileSync(join(dir, "config.json"), body);
      expect(() => updateNotice(env())).not.toThrow();
    }
  });
});

describe("the watch state file", () => {
  it("records of the expected shape are kept; anything else counts as not recorded", () => {
    writeFileSync(join(dir, ".any2orca-state.json"), JSON.stringify({ "a.3mf": { fingerprint: "1:2", outcome: "succeeded" }, "b.3mf": { fingerprint: 3, outcome: "succeeded" }, "c.3mf": { fingerprint: "1:2", outcome: "done" }, "d.3mf": "x" }));
    expect({ ...loadStateFile(dir) }).toEqual({ "a.3mf": { fingerprint: "1:2", outcome: "succeeded" } });
    for (const body of ["null", "[1]", '"text"', "7", "{"]) {
      writeFileSync(join(dir, ".any2orca-state.json"), body);
      expect({ ...loadStateFile(dir) }).toEqual({});
    }
  });

  it("a file named like an object property is an ordinary record", () => {
    // Written as text: in an object literal, a `__proto__` key sets the prototype instead of being a key.
    writeFileSync(join(dir, ".any2orca-state.json"), '{"__proto__":{"fingerprint":"1:2","outcome":"succeeded"},"constructor":{"fingerprint":"3:4","outcome":"failed-once"}}');
    const state = loadStateFile(dir);
    expect(state["__proto__"]).toEqual({ fingerprint: "1:2", outcome: "succeeded" });
    expect(state["constructor"]).toEqual({ fingerprint: "3:4", outcome: "failed-once" });
    expect(state["missing.3mf"]).toBeUndefined();
  });
});
