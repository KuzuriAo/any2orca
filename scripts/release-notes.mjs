#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Prints the release notes for one version: the matching `## <version>`
 * section of a package's CHANGELOG.md (the format `changeset version`
 * writes), without its heading. Used by the publish workflow for the GitHub
 * Release body.
 *
 *   node scripts/release-notes.mjs packages/core/CHANGELOG.md 0.1.0
 *
 * Exits 1 if the version has no section, so a release can't go out with an
 * empty body by accident.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}` || line.startsWith(`## ${version} `));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  const body = lines
    .slice(start + 1, end === -1 ? undefined : end)
    // changesets prefixes each entry with the short commit hash ("- baca90f: ..."); readers don't need it
    .map((line) => line.replace(/^(\s*- )[0-9a-f]{7,40}: /, "$1"))
    .join("\n")
    .trim();
  return body === "" ? null : body;
}

// Started directly, not imported. Compare paths: file://${path} breaks on Windows paths and on names with spaces.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, version] = process.argv.slice(2);
  if (!file || !version) {
    console.error("Usage: node scripts/release-notes.mjs <CHANGELOG.md> <version>");
    process.exit(2);
  }
  const notes = releaseNotes(readFileSync(file, "utf8"), version);
  if (notes === null) {
    console.error(`${file} has no notes for version ${version}`);
    process.exit(1);
  }
  console.log(notes);
}
