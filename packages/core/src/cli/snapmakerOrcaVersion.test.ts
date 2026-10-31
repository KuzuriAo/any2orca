// SPDX-License-Identifier: MIT
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeStamp, STAMP_PATH } from "../stamp.js";
import { PROFILES_DATA_DIR } from "../test-helpers.js";
import { runCli, type CliIo } from "./main.js";

const PROFILE = "snapmaker-u1-0.4-standard";
const NEW = "9.0.0";
const realIndex = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "index.json"), "utf-8"));
const OLD: string = realIndex.slicer.version;

let dir: string;
let input: string;
let catalogDir: string;
let lines: string[];
let errors: string[];

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line) => lines.push(line),
  err: (line) => errors.push(line),
});

/**
 * A catalog folder holding two releases, laid out like any2orca-profiles'
 * data/: the real catalog as the older release in releases/<version>/, and a
 * copy at the top as a newer one whose 0.4 Standard profile has another brim
 * width, so the output shows which release converted it.
 */
function writeTwoReleaseCatalog(target: string): void {
  const older = join(target, "releases", OLD);
  mkdirSync(older, { recursive: true });
  cpSync(join(PROFILES_DATA_DIR, "profiles"), join(older, "profiles"), { recursive: true });
  const { releases: _ignored, ...olderIndex } = realIndex;
  writeFileSync(join(older, "index.json"), JSON.stringify(olderIndex));
  cpSync(join(PROFILES_DATA_DIR, "profiles"), join(target, "profiles"), { recursive: true });
  const profilePath = join(target, "profiles", `${PROFILE}.json`);
  const profile = JSON.parse(readFileSync(profilePath, "utf-8"));
  profile.baselineProjectSettings.brim_width = "7.5";
  writeFileSync(profilePath, JSON.stringify(profile));
  writeFileSync(
    join(target, "index.json"),
    JSON.stringify({
      ...realIndex,
      slicer: { ...realIndex.slicer, version: NEW, application: `Snapmaker_Orca-${NEW}` },
      releases: [
        { version: NEW, application: `Snapmaker_Orca-${NEW}`, path: "." },
        { version: OLD, application: realIndex.slicer.application, path: `releases/${OLD}` },
      ],
    }),
  );
}

function facts(name: string) {
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, name))));
  return {
    application: /<metadata name="Application">([^<]*)</.exec(strFromU8(files["3D/3dmodel.model"]!))?.[1],
    brimWidth: JSON.parse(strFromU8(files["Metadata/project_settings.config"]!)).brim_width,
    tracks: decodeStamp(files[STAMP_PATH])?.profiles.tracks,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-release-"));
  input = join(dir, "model.3mf");
  copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
  catalogDir = join(dir, "catalog");
  writeTwoReleaseCatalog(catalogDir);
  lines = [];
  errors = [];
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("--snapmaker-orca-version", () => {
  it("converts for the newest release by default, and for the release chosen", async () => {
    expect(await runCli(["convert", input, "--profile", PROFILE, "--profiles-dir", catalogDir, "--suffix", "_new"], io())).toBe(0);
    expect(facts("model_new.3mf")).toEqual({ application: `Snapmaker_Orca-${NEW}`, brimWidth: "7.5", tracks: `Snapmaker Orca ${NEW}` });
    expect(await runCli(["convert", input, "--profile", PROFILE, "--profiles-dir", catalogDir, "--snapmaker-orca-version", OLD, "--suffix", "_old"], io())).toBe(0);
    expect(facts("model_old.3mf")).toMatchObject({ application: realIndex.slicer.application, tracks: `Snapmaker Orca ${OLD}` });
    expect(facts("model_old.3mf").brimWidth).not.toBe("7.5");
  });

  it("refuses a release the catalog doesn't hold, naming the ones it does, and writes nothing", async () => {
    expect(await runCli(["convert", input, "--profiles-dir", catalogDir, "--snapmaker-orca-version", "2.3.6"], io())).toBe(1);
    expect(errors.join("\n")).toContain(`isn't one of the releases this profile catalog holds (${NEW}, ${OLD})`);
    expect(() => readFileSync(join(dir, "model_U1.3mf"))).toThrow();
  });

  it("lists the other releases with the profiles", async () => {
    expect(await runCli(["profiles", "--profiles-dir", catalogDir, "--nozzle", "0.4"], io())).toBe(0);
    expect(lines.join("\n")).toContain(`Profiles track Snapmaker Orca ${NEW}`);
    expect(lines.join("\n")).toContain(`Also available: Snapmaker Orca ${OLD}. Choose one with --snapmaker-orca-version <x.y.z>; the newest is the default.`);
    lines = [];
    expect(await runCli(["profiles", "--profiles-dir", catalogDir, "--nozzle", "0.4", "--snapmaker-orca-version", OLD], io())).toBe(0);
    expect(lines.join("\n")).toContain(`Profiles track Snapmaker Orca ${OLD}`);
    expect(lines.join("\n")).toContain(`Also available: Snapmaker Orca ${NEW} (the default).`);
  });

  it("compares with the chosen release's stock profile", async () => {
    const run = async (...extra: string[]) => {
      lines = [];
      await runCli(["diff", input, "--against-stock", PROFILE, "--profiles-dir", catalogDir, "--json", ...extra], io());
      const row = JSON.parse(lines.join("\n")).groups.flatMap((g: { rows: unknown[] }) => g.rows).find((r: { key: string }) => r.key === "brim_width");
      return row?.b;
    };
    expect(await run()).toBe("7.5");
    expect(await run("--snapmaker-orca-version", OLD)).not.toBe("7.5");
  });

  it("is documented in every command that reads profiles", async () => {
    for (const command of ["convert", "profiles", "diff", "presets"]) {
      lines = [];
      await runCli([command, "--help"], io());
      expect(lines.join("\n"), command).toContain("--snapmaker-orca-version <x.y.z>");
    }
  });
});
