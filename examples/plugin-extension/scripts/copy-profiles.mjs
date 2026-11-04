#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Copies the any2orca-profiles catalog into public/profiles/, where the
 * converter worker loads it from. The same step every site embedding
 * any2orca needs: the site serves the catalog itself.
 */
import { chmodSync, cpSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("any2orca-profiles/package.json")), "data");
const target = fileURLToPath(new URL("../public/profiles", import.meta.url));

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
// Plain modes on the copies: on some setups (a container over a bind mount, say) cpSync has left them
// readable by nobody but their owner, and a build packed from there ships unreadable profiles.
const plain = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const isDir = statSync(path).isDirectory();
    chmodSync(path, isDir ? 0o755 : 0o644);
    if (isDir) plain(path);
  }
};
plain(target);
console.log("Copied the profile catalog to public/profiles/.");
