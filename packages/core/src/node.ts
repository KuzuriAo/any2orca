// SPDX-License-Identifier: MIT
/**
 * any2orca/node: profile sources that read from disk, for Node scripts,
 * servers and the CLI.
 *
 *   import { convert } from "any2orca";
 *   import { bundledProfileSource } from "any2orca/node";
 *   const { output, report } = await convert(bytes, { profiles: bundledProfileSource() });
 */
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { isReleasePath, MAX_INDEX_BYTES, MAX_PROFILE_BYTES, parseCatalogJson, ProfileDataError, type ProfileSource } from "./profiles.js";

async function readCapped(path: string, maxBytes: number): Promise<unknown> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new ProfileDataError(`Profile catalog file not found: ${path}`);
  }
  if (size > maxBytes) throw new ProfileDataError(`${path} is larger than the ${maxBytes} byte limit.`);
  return parseCatalogJson(await readFile(path, "utf-8"), maxBytes, path);
}

/**
 * A catalog folder laid out like `any2orca-profiles`' `data/`:
 * `index.json` plus `profiles/<id>.json`, and any older releases in
 * `releases/<version>/`. Used for `--profiles-dir`, to try newer or custom
 * profiles without waiting for a release.
 */
export function dirProfileSource(dir: string): ProfileSource {
  const root = resolve(dir);
  return {
    readIndex: () => readCapped(join(root, "index.json"), MAX_INDEX_BYTES),
    // Ids are validated against the index (lowercase letters, digits, dots
    // and dashes, no slashes) before this is called, so this stays in root.
    readProfile: (id) => readCapped(join(root, "profiles", `${id}.json`), MAX_PROFILE_BYTES),
    release: (path) => {
      // releases/<digits.digits.digits> only, so this stays in root too.
      if (!isReleasePath(path)) throw new ProfileDataError(`Not a release folder: ${JSON.stringify(path.slice(0, 40))}.`);
      return dirProfileSource(join(root, ...path.split("/")));
    },
  };
}

/** The `data/` folder of the installed `any2orca-profiles` package. */
export function bundledProfilesDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("any2orca-profiles/package.json")), "data");
}

let bundled: ProfileSource | undefined;

/** The catalog from the installed `any2orca-profiles` package. */
export function bundledProfileSource(): ProfileSource {
  bundled ??= dirProfileSource(bundledProfilesDir());
  return bundled;
}
