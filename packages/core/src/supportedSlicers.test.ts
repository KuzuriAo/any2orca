// SPDX-License-Identifier: MIT
// Every place that lists the slicers any2orca converts must list all of them. A new source slicer is added in one
// place (the readers), and this test is what finds the copy that still names the old set: the CLI's help, the
// package description, the READMEs, the docs and the examples.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

/** The slicers any2orca converts, as public text names them. */
const SLICERS = ["Bambu Studio", "Creality Print", "Anycubic Slicer Next", "ElegooSlicer", "Flash Studio", "PrusaSlicer"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Tracked text files under these folders hold public copy. `apps/web` has its own check beside its FAQ. */
function publicTextFiles(): string[] {
  let listed: string;
  try {
    listed = execFileSync("git", ["ls-files", "--", "README.md", "docs", "examples", "packages/core/README.md", "packages/core/package.json", "packages/core/src/cli", "packages/core/src/index.ts", "packages/profiles/README.md"], { cwd: root, encoding: "utf8" });
  } catch {
    return [];
  }
  return listed
    .split("\n")
    .filter((file) => /\.(md|json|ts|mjs|html)$/.test(file) && !/(^|\/)(node_modules|test-results)\//.test(file) && !/\.test\.(ts|mjs)$|package-lock\.json$|\/CHANGELOG\.md$/.test(file));
}

/** A list of slicers is a line that names three or more of them. */
function listsOf(text: string): string[] {
  return text.split("\n").filter((line) => SLICERS.filter((name) => line.includes(name)).length >= 3);
}

describe("every list of supported slicers names all of them", () => {
  it("in the CLI's help, the package description, the READMEs, the docs and the examples", (ctx) => {
    const files = publicTextFiles();
    if (files.length === 0) ctx.skip(); // not a git checkout
    const stale: string[] = [];
    let lists = 0;
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      // A comment wraps its sentences over lines; read them as one.
      for (const line of listsOf(file.endsWith(".ts") ? text.replace(/\n\s*\*\s?/g, " ") : text)) {
        lists++;
        const missing = SLICERS.filter((name) => !line.includes(name));
        if (missing.length > 0) stale.push(`${relative(".", file)}: lacks ${missing.join(", ")}: ${line.trim().slice(0, 110)}`);
      }
    }
    expect(lists, "the scan found the lists it's meant to check").toBeGreaterThan(8);
    expect(stale).toEqual([]);
  });

  it("in the CLI's own help, which is built at run time", async () => {
    const { runCli } = await import("./cli/main.js");
    const lines: string[] = [];
    await runCli(["--help"], { env: { NO_UPDATE_NOTIFIER: "1" }, isTTY: false, out: (line: string) => lines.push(line), err: () => {} });
    const help = lines.join("\n");
    expect(help).toContain(`any2orca ${VERSION}`);
    for (const name of SLICERS) expect(help, name).toContain(name);
  });
});
