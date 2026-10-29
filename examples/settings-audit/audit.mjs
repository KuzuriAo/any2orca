// SPDX-License-Identifier: MIT
// Checks every .3mf in a folder against Snapmaker's stock profile, or against
// your own house preset, and fails when a print setting differs that you
// haven't allowed. Built for a CI step or a pre-publish check.
//
//   node audit.mjs <folder> [--preset house.json] [--allow key,key,...]
//
// Exit codes: 0 every file matches (apart from allowed settings), 1 a file has
// a setting you didn't allow or couldn't be read, 2 a usage error.
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Any2orcaError, diffReference, diffSettings, loadCatalog, parsePresetFile, plainText, presetDiffSide, Project, valueLayoutNotes } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

/** A difference that counts: the project sets a value the reference doesn't, or sets it differently. */
const COUNTS = new Set(["changed", "only-a"]);

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { preset: { type: "string" }, allow: { type: "string" } } });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const [folderArg] = args.positionals;
if (!folderArg) {
  console.error("Usage: node audit.mjs <folder> [--preset house.json] [--allow key,key,...]");
  process.exit(2);
}
const allowed = new Set((args.values.allow ?? "").split(",").map((key) => key.trim()).filter(Boolean));

const catalog = await loadCatalog(bundledProfileSource());
// A house preset is compared as it converts: its base profile with its changes on top.
let preset;
if (args.values.preset) {
  const file = parsePresetFile(new Uint8Array(await readFile(fromHere(args.values.preset))));
  if (file.presets.length !== 1) {
    console.error(`${args.values.preset} holds ${file.presets.length} presets; give a file with exactly one.`);
    process.exit(2);
  }
  preset = await presetDiffSide(file.presets[0], catalog);
}

const folder = fromHere(folderArg);
const names = (await readdir(folder)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();
if (names.length === 0) {
  console.error(`No .3mf files in ${folder}`);
  process.exit(2);
}

let failed = 0;
for (const name of names) {
  try {
    const project = Project.open(new Uint8Array(await readFile(join(folder, name))));
    let reference;
    let profileId;
    if (preset) {
      reference = preset;
      profileId = preset.profileId;
    } else {
      profileId = (await project.matchProfile(catalog)).profileId;
      const loaded = await catalog.load(profileId);
      reference = { label: `stock ${loaded.summary.displayName}`, settings: loaded.convertProfile.profile.baselineProjectSettings };
    }
    const diff = diffSettings(
      { label: name, settings: project.settings() },
      { label: reference.label, settings: reference.settings },
      { groups: ["print"], reference: await diffReference(catalog, profileId) },
    );
    const rows = diff.groups.flatMap((group) => group.rows).filter((row) => COUNTS.has(row.status));
    const unexpected = rows.filter((row) => !allowed.has(row.key));
    if (unexpected.length === 0) {
      console.log(`ok      ${name}  (against ${reference.label}${rows.length ? `, ${rows.length} allowed` : ""})`);
      continue;
    }
    failed += 1;
    console.log(`DIFFERS ${name}  (against ${reference.label})`);
    for (const row of unexpected) {
      const mark = row.attention ? `  [${row.attention}]` : "";
      // Values come from the file: plainText keeps terminal control codes in a crafted value from reaching the screen.
      console.log(plainText(`        ${row.label} [${row.key}]: ${row.b ?? "(not set)"} -> ${row.a ?? "(not set)"}${mark}`));
    }
    // A note for settings with several values, such as the U1's standard and high-flow speeds.
    for (const note of valueLayoutNotes(unexpected)) console.log(`        ${note}`);
  } catch (error) {
    failed += 1;
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.log(`FAILED  ${name}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\n${names.length - failed} of ${names.length} match.${allowed.size ? ` Allowed: ${[...allowed].join(", ")}.` : ""}`);
process.exit(failed > 0 ? 1 : 0);
