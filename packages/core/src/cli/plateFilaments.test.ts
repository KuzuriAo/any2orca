// SPDX-License-Identifier: MIT
// What the convert command says about the filaments each plate uses: the notes, and under --verbose a line per plate.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plateFilamentLines } from "./commands/convert.js";
import { runCli, type CliIo } from "./main.js";

let dir: string;
let lines: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

const io = (): CliIo => ({
  env: { NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") },
  isTTY: false,
  out: (line: string) => lines.push(line),
  err: (line: string) => lines.push(line),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "any2orca-plate-filaments-"));
  lines = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

/** Copies a fixture into the temporary folder and returns its path there. */
function fixture(path: string): string {
  const input = join(dir, "model.3mf");
  copyFileSync(new URL(`../test-fixtures/${path}`, import.meta.url), input);
  return input;
}

describe("any2orca convert, on the filaments each plate uses", () => {
  it("prints the note for a plate that needs more filaments at once than the U1 prints with, and what each other plate uses", async () => {
    expect(await runCli(["convert", fixture("sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf")], io())).toBe(0);
    const notes = lines.filter((l) => l.includes("note [plates]:")).map((l) => l.trim());
    expect(notes[0]).toMatch(/^note \[plates\]: Plate 6 needs 5 filaments at the same height \(it uses filaments 1, 2, 3, 5 and 6\)/);
    expect(notes.slice(1)).toEqual([
      "note [plates]: Plate 1 uses filaments 1, 2 and 3.",
      "note [plates]: Plate 2 uses filament 4.",
      "note [plates]: Plate 3 uses filaments 1, 2 and 3.",
      "note [plates]: Plate 4 uses filaments 1 and 2.",
      "note [plates]: Plate 5 uses filaments 1 and 2.",
      "note [plates]: Plate 7 uses filaments 1 and 2.",
    ]);
  });

  it("prints nothing about plates for a project with no more filaments than the U1 has toolheads", async () => {
    expect(await runCli(["convert", fixture("sources/bambu-studio-2.9.1.70.3mf")], io())).toBe(0);
    expect(lines.filter((l) => /\[plates\]|\bplate \d/i.test(l))).toEqual([]);
  });

  it("lists every plate's filaments under --verbose, whatever the project", async () => {
    expect(await runCli(["convert", fixture("sources/bambu-studio-2.9.1.70.3mf"), "--verbose"], io())).toBe(0);
    expect(lines.filter((l) => /^\s+plate \d/.test(l)).map((l) => l.trim())).toEqual(["plate 1: filaments 1, 2, 3", "plate 2: filament 4"]);
  });
});

describe("plateFilamentLines", () => {
  it("says how many filaments a plate needs at the same height when that is fewer than it uses, and skips empty plates", () => {
    const use = (slot: number) => ({ slot, uses: ["object"], from: 0, to: 1 });
    expect(
      plateFilamentLines({
        plateFilaments: [
          { plate: 1, filaments: [1, 2, 3, 4, 5].map(use), mostAtOnce: 2 },
          { plate: 2, filaments: [], mostAtOnce: 0 },
          { plate: 3, filaments: [7].map(use), mostAtOnce: 1 },
        ],
      }),
    ).toEqual(["plate 1: filaments 1, 2, 3, 4, 5, 2 at the same height", "plate 3: filament 7"]);
    expect(plateFilamentLines({})).toEqual([]);
  });
});
