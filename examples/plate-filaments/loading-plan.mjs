// SPDX-License-Identifier: MIT
// Lists the filaments each plate of a project uses: what to load for it on a
// Snapmaker U1, how each filament is used and up to what height, and which
// plates need more filaments at the same height than the U1 prints with.
// It reads the project as it is; nothing is converted or written.
//
//   node loading-plan.mjs <project.3mf> [more.3mf ...] [--json]
//
// Exits 1 when a plate needs more filaments at once than the U1 has
// toolheads, so a publishing script can stop on a project that can't print
// as it is; 2 when a file can't be read.
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Any2orcaError, inspect } from "any2orca";

/** The U1 prints with four filaments at a time, one per toolhead. */
const TOOLHEADS = 4;

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { json: { type: "boolean", default: false } } });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (args.positionals.length === 0) {
  console.error("Usage: node loading-plan.mjs <project.3mf> [more.3mf ...] [--json]");
  process.exit(2);
}

/** What a plate's filaments mean for a U1: fine, needs filament changes at pauses, or can't print as it is. */
function verdict(plate) {
  if (plate.mostAtOnce > TOOLHEADS) return "too-many-at-once";
  return plate.filaments.length > TOOLHEADS ? "needs-changes" : "fits";
}

const USES = { object: "its objects", part: "a part", paint: "paint", "height-range": "a height range", support: "supports", "layer-change": "a tool change at a layer" };

let exitCode = 0;
const results = [];

for (const arg of args.positionals) {
  const name = basename(arg);
  let inspection;
  try {
    inspection = inspect(new Uint8Array(await readFile(fromHere(arg))));
  } catch (error) {
    // An Any2orcaError's message is written for the person; anything else is a problem reading the file itself.
    console.error(`${name}: ${error instanceof Any2orcaError ? error.message : `can't be read (${error.code ?? "unknown error"})`}`);
    exitCode = 2;
    continue;
  }
  const plates = inspection.plateFilaments.filter((plate) => plate.filaments.length > 0).map((plate) => ({ ...plate, verdict: verdict(plate) }));
  if (plates.some((plate) => plate.verdict === "too-many-at-once") && exitCode === 0) exitCode = 1;
  results.push({ file: name, filaments: inspection.filaments, plates });
  if (args.values.json) continue;

  console.log(`${name}: ${plates.length} plate${plates.length === 1 ? "" : "s"} with objects, ${inspection.filaments.length} filament${inspection.filaments.length === 1 ? "" : "s"}`);
  for (const plate of plates) {
    const count = plate.filaments.length;
    const summary =
      plate.verdict === "too-many-at-once"
        ? `needs ${plate.mostAtOnce} filaments at the same height; the U1 prints with ${TOOLHEADS}`
        : plate.verdict === "needs-changes"
          ? `${count} filaments, ${plate.mostAtOnce} at the same height: prints with filament changes at pauses`
          : `load ${count} filament${count === 1 ? "" : "s"}`;
    console.log(`  Plate ${plate.plate}: ${summary}`);
    for (const use of plate.filaments) {
      const filament = inspection.filaments[use.slot - 1];
      const label = filament ? `${filament.color}  ${filament.type}  ${filament.colorName?.name ?? filament.presetName}` : "(not in the project's filament list)";
      const how = use.uses.map((u) => USES[u] ?? u).join(", ");
      console.log(`    ${String(use.slot).padStart(2)}  ${label}  (${how}; ${use.from} to ${use.to} mm)`);
    }
  }
}

if (args.values.json) console.log(JSON.stringify(results, null, 2));
process.exit(exitCode);
