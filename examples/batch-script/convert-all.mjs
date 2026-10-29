// SPDX-License-Identifier: MIT
// Converts every .3mf in a folder to Snapmaker U1, using the any2orca library.
//
//   node convert-all.mjs <input-folder> [output-folder]
//
// One catalog is loaded once and shared by every file. A file that fails is
// reported and skipped; the script exits 1 if any file failed, so it can sit
// in a build or a cron job.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Any2orcaError, convert, loadCatalog } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg) {
  console.error("Usage: node convert-all.mjs <input-folder> [output-folder]");
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

const catalog = await loadCatalog(bundledProfileSource());
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
    // Any2orcaError carries a stable `code`: invalid_file, invalid_project, profile_not_found, profile_data.
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.error(`FAILED  ${name}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\n${names.length - failed} converted, ${failed} failed. Output: ${outputDir}`);
process.exit(failed > 0 ? 1 : 0);
