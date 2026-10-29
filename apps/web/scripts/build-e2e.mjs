#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Builds both skins into dist-e2e/oss and dist-e2e/a2o for the end-to-end
 * tests, which serve them with `vite preview`. The skin is chosen at build
 * time (VITE_BRAND), exactly as a real deployment does it.
 */
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const runAsync = (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(npxCmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`vite build (${env.VITE_BRAND}) exited with code ${code}`))));
  });

for (const script of ["copy-profiles", "copy-licenses"]) execFileSync(process.execPath, [`scripts/${script}.mjs`], { cwd: root, stdio: "inherit" });
await Promise.all(
  [
    ["oss", "dist-e2e/oss"],
    ["a2o", "dist-e2e/a2o"],
  ].map(([brand, outDir]) => runAsync(["vite", "build", "--outDir", outDir, "--emptyOutDir"], { VITE_BRAND: brand })),
);
