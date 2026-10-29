// SPDX-License-Identifier: MIT
// Makes a preset from a project you tuned in Snapmaker Orca, and saves it as a
// presets file you can share or use with convert-with-preset.mjs.
//
//   node make-preset.mjs <tuned.3mf> <name> <presets.json> [--keep key,key,...]
//
// A preset holds only the print settings you changed from Snapmaker's stock
// profile. Speeds and accelerations above stock are left out unless you name
// them with --keep, the same choice the CLI and the web app ask for.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractPreset, serializePresets, withoutChanges } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { keep: { type: "string" } } });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const [tunedPath, name, outPath] = args.positionals;
if (!tunedPath || !name || !outPath) {
  console.error("Usage: node make-preset.mjs <tuned.3mf> <name> <presets.json> [--keep key,key,...]");
  process.exit(2);
}
const keep = new Set((args.values.keep ?? "").split(",").map((key) => key.trim()).filter(Boolean));

let extracted;
try {
  extracted = await extractPreset(new Uint8Array(await readFile(fromHere(tunedPath))), { profiles: bundledProfileSource() });
} catch (error) {
  // any2orca's own errors are sentences; a file that can't be read gets one too.
  console.error(error.code === "ENOENT" ? `Can't read ${tunedPath}: no such file.` : error.message);
  process.exit(1);
}

const aboveStock = extracted.changes.filter((change) => change.aboveStock);
const useStock = aboveStock.filter((change) => !keep.has(change.key)).map((change) => change.key);
const preset = { ...withoutChanges(extracted.preset, useStock), name };

console.log(`${name}: on ${extracted.preset.base}`);
for (const change of extracted.changes) {
  const kept = !useStock.includes(change.key);
  const note = change.aboveStock ? (kept ? "  (above stock, kept)" : "  (above stock, left at stock)") : "";
  const cap = kept && change.cappedAt !== undefined ? `, capped at ${change.cappedAt} by the U1's limits` : "";
  console.log(`  ${change.label} [${change.key}]: ${change.stock} -> ${change.yours}${note}${cap}`);
}
for (const note of extracted.notes) console.log(`  note: ${note}`);

await writeFile(fromHere(outPath), serializePresets([preset]));
console.log(`Saved ${Object.keys(preset.changes).length} setting(s) to ${outPath}`);
