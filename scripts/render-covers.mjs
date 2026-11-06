#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Renders the cover image (scripts/cover.html) at the README's size into
 * docs/assets/readme-cover.png, and with --og <file.png> also at the size of
 * a social preview (1200x630) into that file. Uses the browser the test
 * suites install (npx playwright install chromium).
 *
 *   node scripts/render-covers.mjs
 *   node scripts/render-covers.mjs --og apps/web/public/og-image-any2orca-v2.png
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { og: { type: "string" } } });
if (values.og !== undefined && !/\.png$/i.test(values.og)) {
  console.error(`render-covers: --og takes a .png file to write, not "${values.og}"`);
  process.exit(1);
}

const targets = [{ file: join(root, "docs", "assets", "readme-cover.png"), width: 1280, height: 720 }];
if (values.og) targets.push({ file: resolve(values.og), width: 1200, height: 630 });

const browser = await chromium.launch();
try {
  for (const { file, width, height } of targets) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(pathToFileURL(join(root, "scripts", "cover.html")).href);
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    await page.close();
    console.log(`render-covers: ${width}x${height} written to ${file}`);
  }
} finally {
  await browser.close();
}
