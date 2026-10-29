#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Every source file carries an SPDX license header that matches its package's
 * license (see LICENSE): core, examples and the repo's own scripts are MIT;
 * the profile catalog and the web app are AGPL-3.0-or-later. Fails with the
 * list of files that have none or the wrong one, so a file can't ship under
 * a license nobody chose.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LICENSE_BY_PREFIX = [
  ["packages/core/", "MIT"],
  ["packages/profiles/", "AGPL-3.0-or-later"],
  ["apps/web/", "AGPL-3.0-or-later"],
  ["examples/", "MIT"],
  ["scripts/", "MIT"],
];
const SOURCE = /\.(ts|svelte|mjs|js|css|html)$/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const problems = [];
let checked = 0;
for (const file of files) {
  if (!SOURCE.test(file) || file.endsWith(".d.ts") || file.includes("/public/")) continue;
  const expected = LICENSE_BY_PREFIX.find(([prefix]) => file.startsWith(prefix))?.[1];
  if (!expected) continue;
  checked++;
  const found = /SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)/.exec(readFileSync(file, "utf8").slice(0, 400))?.[1];
  if (!found) problems.push(`${file}: no SPDX-License-Identifier header (expected ${expected})`);
  else if (found !== expected) problems.push(`${file}: ${found}, but this package is ${expected}`);
}
if (problems.length) {
  console.error(`check-spdx: ${problems.length} problem(s)\n` + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`check-spdx: ${checked} source files, all with the right license header`);
