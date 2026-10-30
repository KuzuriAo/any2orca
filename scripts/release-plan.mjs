#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Decides what a push to main releases: every package whose version in its
 * package.json isn't on npm yet. Used by the publish workflow, and runnable
 * locally to see what a push would release:
 *
 *   node scripts/release-plan.mjs                      prints the plan
 *   node scripts/release-plan.mjs --notes-dir <dir>    also writes each release's notes to <dir>/<name>.md
 *
 * In GitHub Actions it also writes `profiles_version`, `core_version` and
 * `publish` to $GITHUB_OUTPUT (empty when there's nothing to release).
 *
 * Refuses (exit 1, nothing released) when a version to release isn't plain
 * semver, has no CHANGELOG section, or is the core pinning a profiles version
 * that is neither on npm nor in this release.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes } from "./release-notes.mjs";

/** In publish order: the core pins an exact profiles version, so profiles go first. */
export const PACKAGES = [
  { name: "any2orca-profiles", dir: "packages/profiles", key: "profiles" },
  { name: "any2orca", dir: "packages/core", key: "core" },
];

const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(-[0-9A-Za-z.-]{1,40})?$/;

/**
 * @param {{ name: string, dir: string, key: string, version: string, changelog: string, pinnedProfiles?: string }[]} packages in publish order
 * @param {(name: string, version: string) => boolean} isPublished
 */
export function planRelease(packages, isPublished) {
  const publish = [];
  const errors = [];
  for (const pkg of packages) {
    if (!SEMVER.test(pkg.version)) {
      errors.push(`${pkg.name}: "${pkg.version}" isn't a plain semver version`);
      continue;
    }
    if (isPublished(pkg.name, pkg.version)) continue;
    const notes = releaseNotes(pkg.changelog, pkg.version);
    if (notes === null) {
      errors.push(`${pkg.name} ${pkg.version} has no section in ${pkg.dir}/CHANGELOG.md`);
      continue;
    }
    publish.push({ name: pkg.name, dir: pkg.dir, key: pkg.key, version: pkg.version, tag: `${pkg.name}@${pkg.version}`, notes });
  }
  const core = packages.find((p) => p.name === "any2orca");
  if (core?.pinnedProfiles && publish.some((p) => p.name === "any2orca")) {
    const inThisRelease = publish.some((p) => p.name === "any2orca-profiles" && p.version === core.pinnedProfiles);
    if (!SEMVER.test(core.pinnedProfiles)) errors.push(`any2orca pins any2orca-profiles "${core.pinnedProfiles}", which isn't an exact version`);
    else if (!inThisRelease && !isPublished("any2orca-profiles", core.pinnedProfiles)) {
      errors.push(`any2orca ${core.version} pins any2orca-profiles ${core.pinnedProfiles}, which is neither on npm nor in this release`);
    }
  }
  return { publish: errors.length ? [] : publish, errors };
}

/** The versions npm has for `name` (empty when the package doesn't exist yet). */
async function publishedVersions(name) {
  const res = await fetch(`https://registry.npmjs.org/${name}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`registry.npmjs.org answered ${res.status} for ${name}`);
  const body = await res.text();
  if (body.length > 20_000_000) throw new Error(`registry answer for ${name} is unexpectedly large`);
  const versions = JSON.parse(body).versions;
  if (typeof versions !== "object" || versions === null) throw new Error(`registry answer for ${name} has no versions`);
  return new Set(Object.keys(versions));
}

// Started directly, not imported. Compare paths: file://${path} breaks on Windows paths and on names with spaces.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const notesDir = args[0] === "--notes-dir" ? args[1] : undefined;
  if ((args.length && !notesDir) || args.length > 2) {
    console.error("Usage: node scripts/release-plan.mjs [--notes-dir <dir>]");
    process.exit(2);
  }
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const packages = PACKAGES.map((p) => {
    const json = JSON.parse(readFileSync(join(root, p.dir, "package.json"), "utf8"));
    if (json.name !== p.name) throw new Error(`${p.dir}/package.json is named ${json.name}, expected ${p.name}`);
    return { ...p, version: String(json.version), changelog: readFileSync(join(root, p.dir, "CHANGELOG.md"), "utf8"), pinnedProfiles: json.dependencies?.["any2orca-profiles"] };
  });
  const known = new Map(await Promise.all(PACKAGES.map(async (p) => [p.name, await publishedVersions(p.name)])));
  const { publish, errors } = planRelease(packages, (name, version) => known.get(name)?.has(version) ?? false);

  for (const p of packages) {
    const on = known.get(p.name);
    const latest = [...on].pop() ?? "none";
    console.log(`${p.name}: package.json ${p.version}, on npm: ${on.has(p.version) ? "yes" : "no"} (npm has ${on.size} version${on.size === 1 ? "" : "s"}, last listed ${latest})`);
  }
  if (errors.length) {
    for (const e of errors) console.error(`Refusing to release: ${e}`);
    process.exit(1);
  }
  console.log(publish.length ? `Releases: ${publish.map((p) => p.tag).join(", ")}` : "Nothing to release: every version is already on npm.");
  if (notesDir) {
    mkdirSync(notesDir, { recursive: true });
    for (const p of publish) writeFileSync(join(notesDir, `${p.name}.md`), p.notes + "\n");
  }
  if (process.env.GITHUB_OUTPUT) {
    const version = (key) => publish.find((p) => p.key === key)?.version ?? "";
    appendFileSync(process.env.GITHUB_OUTPUT, `profiles_version=${version("profiles")}\ncore_version=${version("core")}\npublish=${publish.map((p) => p.tag).join(" ")}\n`);
  }
}
