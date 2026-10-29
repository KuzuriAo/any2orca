// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Any2orcaError } from "../../errors.js";
import { cleanWarnings } from "../../project.js";
import type { ProfileCatalog } from "../../profiles.js";
import { createLogger } from "../logger.js";
import type { ConvertOptions } from "./convert.js";
import { computeOutputPath, createWatchState, isPermanentFailure, matchWarningLine, shouldSkipExisting, watchPollOnce } from "./convert.js";

describe("computeOutputPath", () => {
  it("appends the default _U1 suffix, alongside the input by default", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_U1", undefined)).toBe(join("/models", "AMS_U1.3mf"));
  });

  it("supports a custom suffix", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_Snapmaker", undefined)).toBe(join("/models", "AMS_Snapmaker.3mf"));
  });

  it("supports an empty suffix, producing the bare name", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "", undefined)).toBe(join("/models", "AMS.3mf"));
  });

  it("writes into --out-dir instead of the input's own directory when given", () => {
    expect(computeOutputPath("AMS.3mf", "/models", "_U1", "/converted")).toBe(join("/converted", "AMS_U1.3mf"));
  });

  it("strips any input extension, not just .3mf, before appending the suffix", () => {
    expect(computeOutputPath("bundle.zip", "/models", "_U1", undefined)).toBe(join("/models", "bundle_U1.3mf"));
  });
});

describe("matchWarningLine", () => {
  it("warns clearly on default-fallback, naming the fallback profile", () => {
    const line = matchWarningLine("default-fallback", "snapmaker-u1-0.4-standard");
    expect(line).toContain("WARNING");
    expect(line).toContain("snapmaker-u1-0.4-standard");
  });

  it("notes, more mildly, when it's the nearest available height rather than exact", () => {
    const line = matchWarningLine("auto-nearest", "snapmaker-u1-0.6-standard");
    expect(line).not.toContain("WARNING");
    expect(line).toContain("snapmaker-u1-0.6-standard");
  });

  it("stays silent for a confident exact or tier-name match", () => {
    expect(matchWarningLine("auto-exact", "snapmaker-u1-0.4-0.12fin")).toBeNull();
    expect(matchWarningLine("auto-tier-name", "snapmaker-u1-0.4-0.12fin")).toBeNull();
  });
});

describe("shouldSkipExisting", () => {
  let tempDir: string;
  let existingPath: string;
  let missingPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "any2orca-skip-existing-test-"));
    existingPath = join(tempDir, "AMS_U1.3mf");
    missingPath = join(tempDir, "not-there_U1.3mf");
    writeFileSync(existingPath, "placeholder");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("is false when --skip-existing wasn't passed, even if the output already exists", () => {
    expect(shouldSkipExisting(existingPath, false)).toBe(false);
  });

  it("is true when --skip-existing was passed and the output already exists", () => {
    expect(shouldSkipExisting(existingPath, true)).toBe(true);
  });

  it("is false when --skip-existing was passed but there's nothing to skip yet", () => {
    expect(shouldSkipExisting(missingPath, true)).toBe(false);
  });
});

describe("isPermanentFailure", () => {
  it("treats a problem with the file itself as permanent, since conversion is deterministic", () => {
    expect(isPermanentFailure(new Any2orcaError("invalid_file", "not a zip"))).toBe(true);
    expect(isPermanentFailure(new Any2orcaError("invalid_project", "too many objects"))).toBe(true);
    expect(isPermanentFailure(new Error("unexpected"))).toBe(true);
  });

  it("treats filesystem hiccups and an unreadable catalog as worth retrying", () => {
    expect(isPermanentFailure(Object.assign(new Error("disk full"), { code: "ENOSPC" }))).toBe(false);
    expect(isPermanentFailure(Object.assign(new Error("locked"), { code: "EBUSY" }))).toBe(false);
    expect(isPermanentFailure(new Any2orcaError("profile_data", "catalog missing"))).toBe(false);
  });
});

describe("watchPollOnce", () => {
  let tempDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const options: ConvertOptions = {
    suffix: "_U1",
    dryRun: true,
    verbose: false,
    skipExisting: false,
    watch: true,
    // Never reached: every file below fails to open before a profile is needed.
    catalog: {} as ProfileCatalog,
    logger: createLogger({ quiet: false }),
  };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "any2orca-watch-test-"));
    // Every file below is plain text, not a real .3mf -- runConvert will fail to parse it and
    // log via console.error. That's fine here: these tests only care whether an attempt was
    // made (and exactly once per distinct version of the file), not whether it succeeded.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    consoleErrorSpy.mockRestore();
  });

  it("ignores files that aren't .3mf or .zip", async () => {
    writeFileSync(join(tempDir, "readme.txt"), "hello");
    const state = createWatchState();
    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("waits for a file's fingerprint to settle across two polls before attempting it", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "partial");
    const state = createWatchState();

    await watchPollOnce(tempDir, options, state); // first sighting -- not stable yet
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    await watchPollOnce(tempDir, options, state); // unchanged since the last poll -- now stable
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("resets the stability count if the file grows between polls (still being written)", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "a");
    const state = createWatchState();

    await watchPollOnce(tempDir, options, state); // sees size 1
    writeFileSync(filePath, "aa"); // grew -- still being written
    await watchPollOnce(tempDir, options, state); // size changed (1 -> 2) -- still not stable
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    await watchPollOnce(tempDir, options, state); // unchanged (2 -> 2) -- now stable
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("never re-attempts the same unchanged file across many polls", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "aaaa");
    const state = createWatchState();
    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state); // now stable, attempted once
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // still just the one attempt
  });

  it("reprocesses a file whose content changed even though its size stayed exactly the same", async () => {
    const filePath = join(tempDir, "model.3mf");
    writeFileSync(filePath, "Core pieces"); // 11 bytes
    const state = createWatchState();
    await watchPollOnce(tempDir, options, state);
    await watchPollOnce(tempDir, options, state); // stable, attempted once
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    // Same byte length, different content (a same-size typo fix) -- force a distinct mtime
    // rather than relying on real elapsed time between two synchronous writes in the same test.
    writeFileSync(filePath, "Core Pieces"); // still 11 bytes
    const future = new Date(Date.now() + 5000);
    utimesSync(filePath, future, future);

    await watchPollOnce(tempDir, options, state); // fingerprint changed -- not stable yet
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    await watchPollOnce(tempDir, options, state); // stable again -- reprocessed
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });
});

describe("cleanWarnings", () => {
  it("strips the WARN prefix and trailing period, keeping the actual message", () => {
    expect(cleanWarnings(['  WARN: profile "x" was retired; converted with "y" instead.'])).toEqual(['profile "x" was retired; converted with "y" instead']);
  });

  it("drops routine bookkeeping lines the web UI also hides", () => {
    expect(cleanWarnings(["  SKIP filament_colour: list length mismatch (template=1, bambu=2)", "  NOTE foo: left unchanged.", "   "])).toEqual([]);
  });

  it("removes internal file names from the message", () => {
    expect(cleanWarnings(["WARN: object 3 has no bounding box in model_settings.config."])).toEqual(["object 3 has no bounding box"]);
  });
});
