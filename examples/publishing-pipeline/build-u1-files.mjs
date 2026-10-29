// SPDX-License-Identifier: MIT
// A publish step: turn a folder of source 3MF projects into Snapmaker U1
// files plus a manifest your site or release can use.
//
//   node build-u1-files.mjs <source-folder> <output-folder>
//
// Writes <output-folder>/<name>_U1.3mf for each source and <output-folder>/u1-files.json
// listing them. Idempotent: a file whose source bytes and any2orca version haven't
// changed since the last run is not converted again. Exits 1 if any file fails,
// so a broken model stops the publish instead of shipping silently.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Any2orcaError, convert, loadCatalog, VERSION } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

const MANIFEST = "u1-files.json";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  console.error("Usage: node build-u1-files.mjs <source-folder> <output-folder>");
  process.exit(2);
}
const sourceDir = fromHere(sourceArg);
const outputDir = fromHere(outputArg);
await mkdir(outputDir, { recursive: true });

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = (path) => stat(path).then(() => true, () => false);

let previous = { files: [] };
try {
  previous = JSON.parse(await readFile(join(outputDir, MANIFEST), "utf-8"));
} catch {
  // First run, or an unreadable manifest: convert everything.
}
const previousByName = new Map((previous.files ?? []).map((entry) => [entry.source, entry]));

const sources = (await readdir(sourceDir)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();
const catalog = await loadCatalog(bundledProfileSource());
const files = [];
let failed = 0;

for (const source of sources) {
  const output = `${basename(source, extname(source))}_U1.3mf`;
  try {
    const bytes = new Uint8Array(await readFile(join(sourceDir, source)));
    const sourceHash = sha256(bytes);
    const before = previousByName.get(source);
    if (before && before.sourceSha256 === sourceHash && before.any2orca === VERSION && (await exists(join(outputDir, output)))) {
      files.push(before);
      console.log(`skip    ${source} (unchanged)`);
      continue;
    }
    const result = await convert(bytes, { profiles: catalog });
    await writeFile(join(outputDir, output), result.output);
    files.push({
      source,
      file: output,
      sourceSha256: sourceHash,
      sha256: sha256(result.output),
      bytes: result.output.byteLength,
      profile: result.report.profile.id,
      warnings: result.report.warnings,
      any2orca: VERSION,
    });
    console.log(`ok      ${source}  ->  ${output}`);
  } catch (error) {
    failed += 1;
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.error(`FAILED  ${source}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Written even on failure, so files that did convert are not lost; the exit code tells the build to stop.
await writeFile(join(outputDir, MANIFEST), `${JSON.stringify({ any2orca: VERSION, files }, null, 2)}\n`);
console.log(`\n${files.length} file(s) in ${join(outputDir, MANIFEST)}, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
