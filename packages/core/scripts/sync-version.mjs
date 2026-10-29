#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Writes package.json's version into src/version.ts, so the CLI, the
// output stamp and the stats event all report the version that shipped.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const target = new URL("../src/version.ts", import.meta.url);
const text = `// SPDX-License-Identifier: MIT\n// Written by scripts/sync-version.mjs from package.json; a test checks they match.\nexport const VERSION = ${JSON.stringify(version)};\n`;
if (readFileSync(target, "utf-8") !== text) writeFileSync(target, text);
