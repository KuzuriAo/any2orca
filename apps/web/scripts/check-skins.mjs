#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Keeps the skins honest. A skin is a set of design tokens and nothing else,
 * so:
 *   1. Components and app.css use no color literals (hex, rgb(), hsl()).
 *      Colors come from tokens defined in src/skins/*.css.
 *   2. `data-brand` selectors live only in src/skins/*.css (and the code
 *      that sets the attribute).
 * Fails with a list of offending lines so a new skin can't quietly fork the
 * layout.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

// #fff, #ffffff, #ffffffff, rgb(...), rgba(...), hsl(...), hsla(...); HTML
// entities such as &#123; are not colors.
const COLOR_LITERAL = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(/;
const failures = [];

for (const file of walk(src)) {
  const rel = relative(src, file).split("\\").join("/");
  const inSkins = rel.startsWith("skins/");
  const isStyleOrComponent = file.endsWith(".svelte") || file.endsWith(".css");
  if (!isStyleOrComponent) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (!inSkins && COLOR_LITERAL.test(line)) failures.push(`${rel}:${i + 1}: color literal, use a token: ${line.trim().slice(0, 100)}`);
    if (!inSkins && line.includes("[data-brand")) failures.push(`${rel}:${i + 1}: [data-brand] selector outside src/skins/: ${line.trim().slice(0, 100)}`);
  });
}

if (failures.length) {
  console.error(`check-skins: ${failures.length} problem(s)\n` + failures.map((f) => "  " + f).join("\n"));
  process.exit(1);
}
console.log("check-skins: no color literals or [data-brand] selectors outside src/skins/");
