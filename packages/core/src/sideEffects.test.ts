// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL(".", import.meta.url));
const root = join(src, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test-fixtures" ? [] : sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("package.json sideEffects", () => {
  // A bundler drops an import a file makes only for its side effects (import "./x.js") when package.json says x
  // has none, and the library then behaves differently in a bundle than in its own tests.
  it("lists every file the library imports only for its side effects", () => {
    const listed = new Set(JSON.parse(readFileSync(join(root, "package.json"), "utf-8")).sideEffects as string[]);
    const needed = new Set<string>();
    for (const file of sources(src)) {
      for (const [, spec] of readFileSync(file, "utf-8").matchAll(/^import "(\.{1,2}\/[^"]+)\.js";$/gm)) {
        const target = join(dirname(file), `${spec}.ts`);
        needed.add(`./dist/${relative(src, target).split("\\").join("/").replace(/\.ts$/, ".js")}`);
      }
    }
    expect(needed.size).toBeGreaterThan(0);
    for (const path of needed) expect(listed.has(path), path).toBe(true);
  });
});
