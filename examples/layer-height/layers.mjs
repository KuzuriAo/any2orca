// SPDX-License-Identifier: MIT
// Shows a project's layers against what the U1's nozzle supports, and, with
// --layer-height, converts it with one layer height for the whole project.
//
//   node layers.mjs <project.3mf> [--nozzle 0.2|0.4|0.6|0.8] [--layer-height <mm>] [--out <file.3mf>]
//
// Without --layer-height it converts nothing: it prints each plate's thinnest
// and thickest layer, the heights the nozzle's profiles offer, and the notes a
// conversion would give about layers outside what the nozzle supports.
// With --layer-height (one of the heights the nozzle's profiles offer) it
// converts the project with that layer height, which replaces the creator's
// variable layer heights and the layer heights set for ranges of an object's
// height or on objects, and writes the result to --out (default: next to the
// project, "<name>_U1.3mf").
//
// Exits 2 when the project can't be read or the layer height isn't one of the
// nozzle's.
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Any2orcaError, convert, inspect, loadCatalog } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const fail = (message) => {
  console.error(message);
  process.exit(2);
};

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { nozzle: { type: "string", default: "0.4" }, "layer-height": { type: "string" }, out: { type: "string" } } });
} catch (error) {
  fail(error.message);
}
if (args.positionals.length !== 1) fail("Give one project: node layers.mjs <project.3mf> [--nozzle 0.6] [--layer-height 0.18] [--out file.3mf]");
const [input] = args.positionals;
const { nozzle } = args.values;
const layerHeight = args.values["layer-height"] === undefined ? undefined : Number(args.values["layer-height"]);
if (layerHeight !== undefined && !(layerHeight > 0)) fail(`--layer-height must be a layer height in mm, such as 0.18, got "${args.values["layer-height"]}"`);

const catalog = await loadCatalog(bundledProfileSource());
// The heights the nozzle's profiles have: the ones --layer-height takes.
const offered = [...new Set(catalog.list({ nozzleDiameter: nozzle }).map((profile) => profile.layerHeight))].sort((a, b) => a - b);
if (offered.length === 0) fail(`There is no U1 profile for a ${nozzle} mm nozzle.`);

let bytes;
try {
  bytes = new Uint8Array(await readFile(fromHere(input)));
} catch (error) {
  fail(`${basename(input)}: can't be read (${error.code ?? "unknown error"})`);
}

try {
  if (layerHeight === undefined) {
    const inspection = inspect(bytes);
    console.log(`${basename(input)}: layers for the ${nozzle} mm nozzle, which has profiles at ${offered.join(", ")} mm`);
    for (const plate of inspection.plateFilaments ?? []) {
      if (!plate.layerHeights) continue;
      const { thinnest, thickest } = plate.layerHeights;
      console.log(`  Plate ${plate.plate}: ${thinnest === thickest ? `${thinnest} mm` : `${thinnest} to ${thickest} mm`}`);
    }
    // What a conversion for this nozzle would say about them.
    const { report } = await convert(bytes, { profiles: catalog, nozzle });
    for (const note of report.notes.filter((n) => n.text.startsWith("The project has layers as"))) console.log(`  ${note.text}`);
  } else {
    const { output, report } = await convert(bytes, { profiles: catalog, nozzle, layerHeight });
    const out = args.values.out ? fromHere(args.values.out) : join(dirname(fromHere(input)), `${basename(input, extname(input))}_U1.3mf`);
    await writeFile(out, output);
    for (const note of report.notes.filter((n) => n.text.startsWith("Every layer is"))) console.log(note.text);
    console.log(`Wrote ${basename(out)}`);
  }
} catch (error) {
  fail(error instanceof Any2orcaError ? error.message : `${basename(input)}: ${error.message}`);
}
