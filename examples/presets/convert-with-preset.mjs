// SPDX-License-Identifier: MIT
// Converts every .3mf in a folder with your preset: the preset's base profile,
// with your print settings instead of each creator's.
//
//   node convert-with-preset.mjs <presets.json> <input-folder> [output-folder]
//
// Exits 1 if any file failed, so it can sit in a script or a scheduled job.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Any2orcaError, convert, loadCatalog, parsePresetFile } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

const [presetsPath, inputArg, outputArg] = process.argv.slice(2);
if (!presetsPath || !inputArg) {
  console.error("Usage: node convert-with-preset.mjs <presets.json> <input-folder> [output-folder]");
  process.exit(2);
}

// A presets file is input like any other: parsePresetFile checks its size, shape and every value.
let file;
try {
  file = parsePresetFile(new Uint8Array(await readFile(fromHere(presetsPath))));
} catch (error) {
  console.error(`Can't use ${presetsPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
if (file.presets.length !== 1) {
  console.error(`${presetsPath} holds ${file.presets.length} presets; give a file with exactly one.`);
  process.exit(2);
}
const [preset] = file.presets;

const inputDir = fromHere(inputArg);
const outputDir = fromHere(outputArg ?? join(inputDir, "converted"));
await mkdir(outputDir, { recursive: true });
const names = (await readdir(inputDir)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();

const catalog = await loadCatalog(bundledProfileSource());
let failed = 0;
for (const name of names) {
  try {
    const { output, report } = await convert(new Uint8Array(await readFile(join(inputDir, name))), { profiles: catalog, preset });
    await writeFile(join(outputDir, `${basename(name, extname(name))}_U1.3mf`), output);
    console.log(`ok      ${name}  ->  ${report.profile.id} with "${preset.name}" (${report.preset?.changes.length ?? 0} setting(s))`);
    for (const note of report.preset?.notes ?? []) console.log(`        note: ${note}`);
  } catch (error) {
    failed += 1;
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.error(`FAILED  ${name}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${names.length - failed} converted, ${failed} failed. Output: ${outputDir}`);
process.exit(failed > 0 ? 1 : 0);
