#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Writes public/third-party-licenses.txt: the license text of every
 * third-party package whose code ends up in the built bundle (Svelte's
 * runtime, plus the library's own dependencies fflate and zod). These
 * licenses (MIT) require their copyright notice to travel with copies of the
 * code, and a bundler strips the comments that would carry it, so the notices
 * ship as their own file at /third-party-licenses.txt.
 *
 * Runs before `dev` and `build`. The output is generated, not committed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const BUNDLED = [
  { name: "svelte", file: "LICENSE.md" },
  { name: "fflate", file: "LICENSE" },
  { name: "zod", file: "LICENSE" },
];


const FEATHER_LICENSE = `feather-icons 4.29.2
-------------------

The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const sections = BUNDLED.map(({ name, file }) => {
  const dir = dirname(require.resolve(`${name}/package.json`));
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return `${name} ${version}\n${"-".repeat(name.length + version.length + 1)}\n\n${readFileSync(join(dir, file), "utf8").trim()}\n`;
});

const header = `Third-party software in this site's JavaScript bundle

any2orca's own code is described in the repository's LICENSE and NOTICE files.
The packages below are included in the bundle under their own licenses.

`;
writeFileSync(fileURLToPath(new URL("../public/third-party-licenses.txt", import.meta.url)), `${header}${[...sections, FEATHER_LICENSE].join("\n\n")}`);
console.log(`Wrote the licenses of ${[...BUNDLED.map((b) => b.name), "feather-icons"].join(", ")} to public/third-party-licenses.txt.`);

const webLicense = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
const rootNotice = readFileSync(new URL("../../../NOTICE", import.meta.url), "utf8");

writeFileSync(new URL("../public/LICENSE.txt", import.meta.url), webLicense);
writeFileSync(new URL("../public/NOTICE.txt", import.meta.url), rootNotice);

console.log("Copied LICENSE.txt and NOTICE.txt to public/.");
