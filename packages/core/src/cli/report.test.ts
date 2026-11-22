// SPDX-License-Identifier: MIT
// any2orca convert --report: the problem report after each file, and nothing of the file's name or place in it.
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_END, REPORT_START } from "./commands/convert.js";
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
  dir = mkdtempSync(join(tmpdir(), "any2orca-report-"));
  lines = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

/** The reports printed, each as its lines between the two marker lines. */
function reports(): string[][] {
  const found: string[][] = [];
  let open: string[] | null = null;
  for (const line of lines) {
    if (line === REPORT_START) open = [];
    else if (line === REPORT_END && open) {
      found.push(open);
      open = null;
    } else if (open) open.push(line);
  }
  return found;
}

describe("any2orca convert --report", () => {
  it("prints a report after a converted file, with nothing of the file's name or folder in it", async () => {
    const input = join(dir, "my-private-model-name.3mf");
    copyFileSync(new URL("../test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url), input);
    expect(await runCli(["convert", input, "--report", "--filament-compliance", "snapmaker", "--high-flow-toolheads", "1,3"], io())).toBe(0);
    const [report, ...others] = reports();
    expect(others).toEqual([]);
    expect(report![0]).toBe("any2orca problem report");
    expect(report).toContain("App: any2orca command line");
    expect(report!.some((l) => /^Ran on: Node \d/.test(l))).toBe(true);
    expect(report).toContain("Project: 7 plates; 18 objects; 6 filaments; 1.1 MB unpacked; nozzle 0.4 mm; layer height 0.2 mm");
    expect(report!.find((l) => l.startsWith("Options: "))).toBe(
      "Options: nozzle 0.4; Snapmaker Orca 2.4.1; profile matched; filament names snapmaker; high flow toolheads 1 and 3; hardened nozzles no; version note on; own preset no",
    );
    expect(report).toContain("Result: converted with snapmaker-u1-0.4-standard (matched, auto-tier-name), for 0.4 mm nozzles");
    expect(report!.some((l) => l.startsWith("  [plate-filaments] Plate 6 needs 5 filaments"))).toBe(true);
    // Right after the report: where it goes.
    expect(lines[lines.indexOf(REPORT_END) + 1]).toBe("Paste it into a bug report: https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml");
    const text = report!.join("\n");
    expect(text).not.toContain("my-private-model-name");
    expect(text).not.toContain(dir);
    expect(text).not.toContain(".3mf");
  });

  it("prints one for a file that can't be read, with the error's code and where it stopped", async () => {
    const input = join(dir, "broken-private-name.3mf");
    writeFileSync(input, "not a zip");
    expect(await runCli(["convert", input, "--report"], io())).toBe(1);
    const [report] = reports();
    expect(report).toContain("Result: error invalid_file at opening");
    expect(report!.join("\n")).not.toContain("broken-private-name");
  });

  it("prints one for a conversion that fails after the file opened, with what the file is", async () => {
    const input = join(dir, "model.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
    // A 0.4 mm profile with a 0.2 mm nozzle is refused once the profile is loaded.
    expect(await runCli(["convert", input, "--report", "--nozzle", "0.2", "--profile", "snapmaker-u1-0.4-standard"], io())).toBe(1);
    const [report] = reports();
    expect(report!.some((l) => l.startsWith("Project: 2 plates; 3 objects; 3 filaments; "))).toBe(true);
    expect(report).toContain("Result: error unexpected (TypeError) at loading-profile");
  });

  it("prints none unless asked, and none on a dry run", async () => {
    const input = join(dir, "model.3mf");
    copyFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url), input);
    expect(await runCli(["convert", input], io())).toBe(0);
    expect(reports()).toEqual([]);
    expect(lines.join("\n")).not.toContain("problem report");
    lines = [];
    expect(await runCli(["convert", input, "--report", "--dry-run"], io())).toBe(0);
    expect(reports()).toEqual([]);
  });
});
