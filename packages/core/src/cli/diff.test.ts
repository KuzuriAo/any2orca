// SPDX-License-Identifier: MIT
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let out: string[];
let err: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line) => out.push(line),
  err: (line) => err.push(line),
});
const fixture = (name: string, as: string) => {
  copyFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), join(dir, as));
  return join(dir, as);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-diff-"));
  out = [];
  err = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("any2orca diff", () => {
  it("exits 0 and says so when the projects' settings are the same", async () => {
    const a = fixture("synthetic-demo.3mf", "a.3mf");
    const b = fixture("synthetic-demo.3mf", "b.3mf");
    expect(await runCli(["diff", a, b], io())).toBe(0);
    expect(out.join("\n")).toContain("No differences.");
  });

  it("exits 1 and lists differences grouped like Snapmaker Orca", async () => {
    const a = fixture("synthetic-demo.3mf", "a.3mf");
    const b = fixture("synthetic-creality.3mf", "b.3mf");
    expect(await runCli(["diff", a, b], io())).toBe(1);
    const text = out.join("\n");
    expect(text).toMatch(/Source \(A\): a\.3mf\s+Target \(B\): b\.3mf/);
    expect(text).toMatch(/difference/);
  });

  it("prints the full result as JSON", async () => {
    const a = fixture("synthetic-demo.3mf", "a.3mf");
    const b = fixture("synthetic-creality.3mf", "b.3mf");
    await runCli(["diff", a, b, "--json"], io());
    const parsed = JSON.parse(out.join("\n"));
    expect(parsed).toMatchObject({ format: "any2orca-diff", version: 1, aLabel: "a.3mf", bLabel: "b.3mf", identical: false });
  });

  it("compares one project with the stock profile, auto-matched or named", async () => {
    const a = fixture("synthetic-demo.3mf", "a.3mf");
    const auto = await runCli(["diff", a, "--against-stock", "--json"], io());
    expect([0, 1]).toContain(auto);
    expect(JSON.parse(out.join("\n")).bLabel).toMatch(/^Snapmaker's stock .* profile$/);
    out = [];
    await runCli(["diff", a, "--against-stock", "snapmaker-u1-0.4-0.16hq", "--json"], io());
    const named = JSON.parse(out.join("\n"));
    expect(named.bLabel).toContain("0.16mm");
    expect(named.groups.every((g: { group: string }) => g.group === "print" || g.group === "machine")).toBe(true);
  });

  it("lists values above stock or the U1's limits first, marked, unless sorted otherwise", async () => {
    const files = unzipSync(new Uint8Array(readFileSync(fixture("synthetic-demo.3mf", "plain.3mf"))));
    const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
    settings.outer_wall_speed = ["450"];
    settings.inner_wall_speed = ["900"];
    files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    const a = join(dir, "a.3mf");
    writeFileSync(a, zipSync(files));
    await runCli(["diff", a, "--against-stock", "--json"], io());
    const json = JSON.parse(out.join("\n"));
    const rowsByKey = Object.fromEntries(json.groups.flatMap((g: { rows: Array<{ key: string; attention?: string }> }) => g.rows).map((r: { key: string; attention?: string }) => [r.key, r.attention]));
    expect(rowsByKey).toMatchObject({ outer_wall_speed: "above-stock", inner_wall_speed: "above-limit" });
    const marked = Object.values(rowsByKey).filter(Boolean);
    out = [];
    await runCli(["diff", a, "--against-stock"], io());
    const text = out.join("\n");
    const lines = text.split("\n").filter((l) => /\b(changed|only in|not a Snapmaker)/.test(l));
    const firstPlain = lines.findIndex((l) => !/above (stock|the U1)/.test(l));
    const lastMarked = lines.map((l) => /above (stock|the U1)/.test(l)).lastIndexOf(true);
    expect(marked.length).toBeGreaterThan(0);
    expect(text).toMatch(/Inner wall \[inner_wall_speed\].*above the U1's limit \(capped\)/);
    if (firstPlain !== -1) expect(lastMarked).toBeLessThan(firstPlain);
    out = [];
    expect(await runCli(["diff", a, "--against-stock", "--sort", "setting"], io())).toBeLessThan(2);
    err = [];
    expect(await runCli(["diff", a, "--against-stock", "--sort", "sideways"], io())).toBe(2);
    expect(err.join("\n")).toMatch(/--sort takes attention, setting or status/);
  });

  it("never prints terminal control codes that come from a file", async () => {
    const files = unzipSync(new Uint8Array(readFileSync(fixture("synthetic-demo.3mf", "plain.3mf"))));
    const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
    // A clipboard-write sequence some terminals act on, and a right-to-left override.
    settings.seam_position = "back\u001b]52;c;ZXZpbA==\u0007\u202e";
    files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    const a = join(dir, "hostile.3mf");
    writeFileSync(a, zipSync(files));
    out = [];
    await runCli(["diff", a, "--against-stock", "--all"], io());
    const text = out.join("\n");
    expect(text).toContain("seam_position");
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e]/);
    expect(text).toContain("back\ufffd]52;c;ZXZpbA==\ufffd\ufffd");
  });

  it("exits 2 with a clear message on bad input", async () => {
    const a = fixture("synthetic-demo.3mf", "a.3mf");
    const broken = join(dir, "broken.3mf");
    writeFileSync(broken, "not a zip at all");
    const cases: string[][] = [
      ["diff", a],
      ["diff", a, join(dir, "missing.3mf")],
      ["diff", a, broken],
      ["diff", a, join(dir, "bundle.zip")],
      ["diff", a, a, "--group", "colors"],
      ["diff", a, "--against-stock", "no-such-profile"],
    ];
    for (const args of cases) {
      err = [];
      expect(await runCli(args, io()), args.join(" ")).toBe(2);
      expect(err.join("\n"), args.join(" ")).toMatch(/^Error: /);
    }
  });

  it("is documented in the command's help and the top-level help", async () => {
    await runCli(["diff", "--help"], io());
    expect(out.join("\n")).toContain("--against-stock");
    out = [];
    await runCli(["--help"], io());
    expect(out.join("\n")).toContain("diff <a.3mf> <b.3mf>");
  });
});
