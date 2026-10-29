// SPDX-License-Identifier: MIT
// Converts a folder and keeps each file's "What changed?" record next to it,
// so a person can review what the conversion did before anything is published.
//
//   node review.mjs <input-folder> [output-folder] [--fail-on capped,stock,...]
//
// Writes <name>_U1.3mf and <name>_U1.what-changed.json (format
// any2orca-what-changed, the same JSON the web app and `convert --explain-json`
// export). --fail-on exits 1 when any file has a change for one of those
// reasons: creator, stock, capped, firmware, layout or yours.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Any2orcaError, convert, loadCatalog, plainText } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

const REASONS = ["creator", "stock", "capped", "firmware", "layout", "yours"];

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { "fail-on": { type: "string" } } });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const [inputArg, outputArg] = args.positionals;
const failOn = (args.values["fail-on"] ?? "").split(",").map((r) => r.trim()).filter(Boolean);
const unknown = failOn.filter((reason) => !REASONS.includes(reason));
if (!inputArg || unknown.length > 0) {
  console.error(`Usage: node review.mjs <input-folder> [output-folder] [--fail-on ${REASONS.join(",")}]`);
  process.exit(2);
}

const inputDir = fromHere(inputArg);
const outputDir = fromHere(outputArg ?? join(inputDir, "converted"));
await mkdir(outputDir, { recursive: true });
const names = (await readdir(inputDir)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();
const catalog = await loadCatalog(bundledProfileSource());

let flagged = 0;
let failed = 0;
for (const name of names) {
  const stem = `${basename(name, extname(name))}_U1`;
  try {
    // explain: true adds every setting difference to the record, for the full review.
    const { output, report } = await convert(new Uint8Array(await readFile(join(inputDir, name))), { profiles: catalog, explain: true });
    const record = report.whatChanged;
    await writeFile(join(outputDir, `${stem}.3mf`), output);
    await writeFile(join(outputDir, `${stem}.what-changed.json`), `${JSON.stringify(record, null, 2)}\n`);

    const counts = record.groups.map((group) => `${group.title}: ${group.items.length}`).join("; ");
    console.log(`${name}  ->  ${record.profile.displayName}${counts ? `  (${counts})` : "  (nothing else changed)"}`);
    for (const group of record.groups) {
      for (const item of group.items) {
        // Values above stock the person could choose differently: convert again with `aboveStock` to apply.
        // Values come from the file: plainText keeps terminal control codes in a crafted value from reaching the screen.
        if (item.alternative) console.log(plainText(`    choice: ${item.label}: ${item.before ?? "-"} -> ${item.after ?? "-"} (could ${item.alternative === "keep" ? "keep the creator's value" : "use stock"})`));
      }
    }
    if (record.groups.some((group) => failOn.includes(group.reason) && group.items.length > 0)) {
      flagged += 1;
      console.log(`    flagged: has ${failOn.filter((reason) => record.groups.some((g) => g.reason === reason)).join(", ")} changes`);
    }
  } catch (error) {
    failed += 1;
    const code = error instanceof Any2orcaError ? error.code : "error";
    console.error(`FAILED  ${name}  [${code}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\n${names.length - failed} converted, ${failed} failed, ${flagged} flagged. Records: ${outputDir}`);
process.exit(failed > 0 || flagged > 0 ? 1 : 0);
