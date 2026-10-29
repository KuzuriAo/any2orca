// SPDX-License-Identifier: MIT
// Lists which any2orca release, profile set and options made each converted
// file in a folder, from the small version note every converted file carries
// (Metadata/any2orca.json). Use it to find files made before a fix.
//
//   node versions.mjs <folder> [--older-than 0.2.0]
//
// --older-than exits 1 when any file was made by an earlier release, so a
// script can re-convert just those. Files with no note are listed as such.
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { unzipSync } from "fflate";
import { decodeStamp, STAMP_PATH } from "any2orca";

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

/** The note is tiny; anything bigger isn't one, and isn't worth decompressing. */
const MAX_NOTE_BYTES = 64 * 1024;

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { "older-than": { type: "string" } } });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const [folderArg] = args.positionals;
const olderThan = args.values["older-than"];
if (!folderArg || (olderThan !== undefined && !/^\d+\.\d+\.\d+$/.test(olderThan))) {
  console.error("Usage: node versions.mjs <folder> [--older-than <major.minor.patch>]");
  process.exit(2);
}

/** Compares two versions by their numbers (a pre-release counts as its release). */
function older(version, than) {
  const a = version.split(/[.-]/).slice(0, 3).map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i];
  return false;
}

/** The note from a converted file, decompressing only that one small entry. */
function readNote(bytes) {
  const entries = unzipSync(bytes, { filter: (file) => file.name === STAMP_PATH && file.originalSize <= MAX_NOTE_BYTES });
  return decodeStamp(entries[STAMP_PATH]);
}

const folder = fromHere(folderArg);
const names = (await readdir(folder)).filter((name) => extname(name).toLowerCase() === ".3mf").sort();
let flagged = 0;

for (const name of names) {
  let note;
  try {
    note = readNote(new Uint8Array(await readFile(join(folder, name))));
  } catch {
    console.log(`${name}: not a readable 3MF`);
    continue;
  }
  if (!note) {
    console.log(`${name}: no version note (converted without one, or not by any2orca)`);
    continue;
  }
  // true/false for all four toolheads, or one entry per toolhead.
  const hf = note.options.highFlowHotends;
  const highFlow = Array.isArray(hf) ? hf.flatMap((on, i) => (on ? [i + 1] : [])) : hf ? [1, 2, 3, 4] : [];
  const options = [
    highFlow.length ? `high flow on toolhead${highFlow.length > 1 ? "s" : ""} ${highFlow.join(", ")}` : null,
    note.options.hardenedNozzles ? "hardened nozzles" : null,
    note.options.filamentComplianceMode ? `${note.options.filamentComplianceMode} filament names` : null,
    note.options.preset ? `a preset (${note.options.preset.keys.length} setting(s))` : null,
  ].filter(Boolean);
  const isOld = olderThan !== undefined && older(note.version, olderThan);
  if (isOld) flagged += 1;
  console.log(`${name}: any2orca ${note.version}, ${note.profiles.tracks}, ${note.profileId}${options.length ? `, ${options.join(", ")}` : ""}${isOld ? `  <- older than ${olderThan}` : ""}`);
}

if (olderThan !== undefined) console.log(`\n${flagged} file(s) made before ${olderThan}.`);
process.exit(flagged > 0 ? 1 : 0);
