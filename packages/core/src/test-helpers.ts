// SPDX-License-Identifier: MIT
// Test-only helpers (excluded from the build).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirProfileSource } from "./node.js";
import { ProfileIndexSchema, type ProfileSource } from "./profiles.js";
import type { FilamentNameTable } from "./engine/filamentComplianceNames.js";

/** The generated catalog in packages/profiles/data. */
export const PROFILES_DATA_DIR = fileURLToPath(new URL("../../profiles/data/", import.meta.url));

/** The newest release's templates in packages/profiles: the release at the top of data/. */
export const NEWEST_TEMPLATES_DIR = join(
  PROFILES_DATA_DIR,
  "..",
  "releases",
  (JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "index.json"), "utf-8")) as { slicer: { version: string } }).slicer.version,
  "templates",
);

export function testProfileSource(): ProfileSource {
  return dirProfileSource(PROFILES_DATA_DIR);
}

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url)));
}

export function readCatalogJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, `file://${PROFILES_DATA_DIR}`), "utf-8"));
}

/** The generated catalog's filament names (index.json `filamentNames`), validated as the core validates them. */
export function testFilamentNames(): FilamentNameTable {
  const index = ProfileIndexSchema.parse(readCatalogJson("index.json"));
  if (!index.filamentNames) throw new Error("packages/profiles/data/index.json has no filamentNames");
  return index.filamentNames;
}
