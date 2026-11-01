// SPDX-License-Identifier: MIT
// Vite plans to load configs with Node's own loader by default (Vite 9). That loader needs real file extensions,
// in the config and in every local file it imports, and today's loader doesn't warn about all of it. So each
// config is loaded the native way here: loading only, no build.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

/** Every app's and example's Vite config, as [project folder, config file]. */
const configs = ["apps", "examples"].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(root, group, entry.name);
      const name = CONFIG_NAMES.find((n) => existsSync(join(dir, n)));
      return name ? [[`${group}/${entry.name}`, join(dir, name)]] : [];
    }),
);

// Node strips TypeScript types from 22.18 (and 23.6) on; before that a .ts config can't load natively at all.
const [major, minor] = process.versions.node.split(".").map(Number);
const nativeTypeScript = major > 22 || (major === 22 && minor >= 18);
const NOT_HERE = `Node ${process.versions.node} can't load a TypeScript config natively (22.18 or newer can)`;

async function loadNatively(file, dir) {
  const { loadConfigFromFile } = await import("vite");
  return loadConfigFromFile({ command: "build", mode: "production", isSsrBuild: false, isPreview: false }, file, dir, "silent", undefined, "native");
}

describe("Vite configs under the native config loader", () => {
  it("finds every config", () => {
    for (const project of ["apps/web", "examples/minimal-ui", "examples/plugin-extension", "examples/web-stack-embed"]) {
      assert.ok(configs.some(([name]) => name === project), project);
    }
  });

  for (const [name, file] of configs) {
    it(`${name} loads`, async (t) => {
      if (!nativeTypeScript && file.endsWith("ts")) return t.skip(NOT_HERE);
      const loaded = await loadNatively(file, join(file, ".."));
      assert.ok(loaded?.config, `${name}: no config loaded`);
    });
  }

  it("fails for an import without its file extension, so a broken config can't pass", async (t) => {
    if (!nativeTypeScript) return t.skip(NOT_HERE);
    const dir = mkdtempSync(join(tmpdir(), "vite-native-"));
    writeFileSync(join(dir, "helper.ts"), "export const base = \"./\";\n");
    writeFileSync(join(dir, "vite.config.ts"), 'import { base } from "./helper";\nexport default { base };\n');
    await assert.rejects(loadNatively(join(dir, "vite.config.ts"), dir), /Cannot find module|ERR_MODULE_NOT_FOUND/);
  });
});
