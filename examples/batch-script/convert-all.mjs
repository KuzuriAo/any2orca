// SPDX-License-Identifier: MIT
// Converts every .3mf in a folder to Snapmaker U1, using the any2orca library.
//
//   node convert-all.mjs <input-folder> [output-folder] [--snapmaker-orca-version <x.y.z>]
//
// Files are converted for the Snapmaker Orca release you slice with: the
// newest the catalog holds, or the one given. One catalog is loaded once and
// shared by every file. A file that fails is
// reported and skipped; the script exits 1 if any file failed, so it can sit
// in a build or a cron job.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Any2orcaError, convert, loadCatalog } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

const usage = "Usage: node convert-all.mjs <input-folder> [output-folder] [--snapmaker-orca-version <x.y.z>]";
let args;
try {
  args = parseArgs({ allowPositionals: true, options: { "snapmaker-orca-version": { type: "string" } } });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n${usage}`);
  process.exit(2);
}
const [inputArg, outputArg] = args.positionals;
if (!inputArg) {
  console.error(usage);
  process.exit(2);
}

const inputDir = fromHere(inputArg);
const outputDir = fromHere(outputArg ?? join(inputDir, "converted"));
await mkdir(outputDir, { recursive: true });

const names = (await readdir(inputDir)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();
if (names.length === 0) {
  console.error(`No .3mf files in ${inputDir}`);
  process.exit(2);
}

// The newest release is the default; catalog.releases() lists the others.
const newest = await loadCatalog(bundledProfileSource());
const version = args.values["snapmaker-orca-version"];
let catalog;
try {
  catalog = version === undefined ? newest : await newest.forRelease(version);
} catch (error) {
  // release_not_found: the message names the releases the catalog holds.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
console.log(`Converting for ${catalog.index.slicer.name} ${catalog.index.slicer.version}.`);
let failed = 0;

for (const name of names) {
  const stem = basename(name, extname(name));
  try {
    const bytes = new Uint8Array(await readFile(join(inputDir, name)));
    const { output, report } = await convert(bytes, { profiles: catalog });
    await writeFile(join(outputDir, `${stem}_U1.3mf`), output);
    console.log(`ok      ${name}  ->  ${report.profile.id}  (${report.plates} plate(s), ${report.filamentSlots} filament(s))`);
    for (const warning of report.warnings) console.log(`        note: ${warning}`);
  } catch (error) {
    failed += 1;
    // Any2orcaError carries a stable `code`: invalid_file, too_large, invalid_project, profile_not_found, profile_data.
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.error(`FAILED  ${name}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\n${names.length - failed} converted, ${failed} failed. Output: ${outputDir}`);
process.exit(failed > 0 ? 1 : 0);
