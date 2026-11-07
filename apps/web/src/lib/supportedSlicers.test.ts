// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const VENDORS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "Bambu", pattern: /\bBambu\b/ },
  { name: "Creality", pattern: /\bCreality\b/ },
  { name: "Anycubic", pattern: /\bAnycubic\b/ },
  { name: "ELEGOO", pattern: /\b(?:ELEGOO|ElegooSlicer)\b/ },
  { name: "Flashforge", pattern: /\b(?:Flashforge|Flash Studio)\b/ },
  { name: "QIDI", pattern: /\b(?:QIDI|QIDI Studio)\b/ },
  { name: "Prusa", pattern: /\b(?:Prusa|PrusaSlicer)\b/ },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function webCopyFiles(): string[] {
  let listed: string;
  try {
    listed = execFileSync("git", ["ls-files", "--", "apps/web"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return listed
    .split("\n")
    .filter(
      (file) =>
        /\.(html|ts|svelte)$/.test(file) &&
        !file.endsWith(".test.ts") &&
        !file.startsWith("apps/web/e2e/")
    );
}

function listsOf(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => VENDORS.filter((v) => v.pattern.test(line)).length >= 4);
}

describe("every list of supported slicers in apps/web names all seven vendors", () => {
  it("in index.html, faq.ts, and all other web copy files", (ctx) => {
    const files = webCopyFiles();
    if (files.length === 0) {
      ctx.skip("not a git checkout");
      return;
    }

    assert.ok(files.includes("apps/web/index.html"));
    assert.ok(files.includes("apps/web/src/lib/faq.ts"));

    const stale: string[] = [];
    let lists = 0;

    for (const file of files) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      for (const line of listsOf(text)) {
        lists++;
        const missing = VENDORS.filter((v) => !v.pattern.test(line)).map((v) => v.name);
        if (missing.length > 0) {
          stale.push(`${file}: lacks ${missing.join(", ")}: ${line.trim().slice(0, 110)}`);
        }
      }
    }

    assert.ok(lists >= 15, `expected at least 15 slicer/vendor lists in apps/web, found ${lists}`);
    assert.deepEqual(stale, []);
  });
});
