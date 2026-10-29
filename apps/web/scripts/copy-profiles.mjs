#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Copies the installed any2orca-profiles catalog (its data/ folder) into
 * public/profiles/, where the app loads it with fetchProfileSource(). This
 * is the same setup the any2orca README describes for any site embedding
 * the library: the site serves the catalog itself, and the browser fetches
 * index.json plus only the profiles it converts with.
 *
 * Runs before `dev` and `build`. public/profiles/ is generated, not
 * committed.
 */
import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("any2orca-profiles/package.json")), "data");
const target = fileURLToPath(new URL("../public/profiles", import.meta.url));

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied the profile catalog from any2orca-profiles to public/profiles/.`);
