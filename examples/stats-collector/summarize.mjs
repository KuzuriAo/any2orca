// SPDX-License-Identifier: MIT
// Counts what the collector has stored.
//
//   node summarize.mjs [events.jsonl] [--json]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUMMARY_FIELDS, summarize } from "./summary.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");

// npm runs an example's script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const file = fromHere(args.find((arg) => !arg.startsWith("--")) ?? "events.jsonl");

let text;
try {
  text = readFileSync(file, "utf-8");
} catch (error) {
  console.error(error.code === "ENOENT" ? `No events file at ${file}: start the collector first, or name the file.` : `Can't read ${file}: ${error.message}`);
  process.exit(1);
}
const summary = summarize(text);

if (json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`${summary.events} event(s)${summary.skipped ? `, ${summary.skipped} line(s) skipped` : ""}`);
  for (const field of SUMMARY_FIELDS) {
    console.log(`\nby ${field}`);
    for (const [key, count] of Object.entries(summary[field])) console.log(`  ${String(count).padStart(6)}  ${key}`);
  }
}
