// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert, loadCatalog, parsePresetFile } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const run = promisify(execFile);
const make = new URL("./make-preset.mjs", import.meta.url).pathname;
const convertWith = new URL("./convert-with-preset.mjs", import.meta.url).pathname;
const sample = new URL("../../apps/web/public/demo-model.3mf", import.meta.url).pathname;
const SETTINGS = "Metadata/project_settings.config";
const settingsOf = async (path) => JSON.parse(strFromU8(unzipSync(new Uint8Array(await readFile(path)))[SETTINGS]));
const node = (...args) =>
  run("node", args).then(
    (r) => ({ code: 0, stdout: r.stdout }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

let dir;
let tunedPath;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "a2o-presets-"));
  // A tuned project: the demo converted, then edited as if in Snapmaker Orca.
  const { output } = await convert(new Uint8Array(await readFile(sample)), { profiles: await loadCatalog(bundledProfileSource()), stamp: false });
  const files = unzipSync(output);
  const settings = JSON.parse(strFromU8(files[SETTINGS]));
  Object.assign(settings, { wall_loops: "4", sparse_infill_speed: ["480", "480"] });
  files[SETTINGS] = strToU8(JSON.stringify(settings));
  tunedPath = join(dir, "tuned.3mf");
  await writeFile(tunedPath, zipSync(files));
});

test("makes a preset of what you changed, leaving speeds above stock out unless kept", async () => {
  const plain = join(dir, "plain.json");
  const result = await node(make, tunedPath, "Strong", plain);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Sparse infill \[sparse_infill_speed\]: 270 -> 480\s+\(above stock, left at stock\)/);
  const [preset] = parsePresetFile(await readFile(plain, "utf-8")).presets;
  assert.equal(preset.name, "Strong");
  assert.deepEqual(Object.keys(preset.changes), ["wall_loops"]);

  const fast = join(dir, "fast.json");
  assert.equal((await node(make, tunedPath, "Fast", fast, "--keep", "sparse_infill_speed")).code, 0);
  assert.deepEqual(Object.keys(parsePresetFile(await readFile(fast, "utf-8")).presets[0].changes).sort(), ["sparse_infill_speed", "wall_loops"]);
});

test("converts a folder with the preset's settings instead of the creator's", async () => {
  const presets = join(dir, "strong.json");
  await node(make, tunedPath, "Strong", presets);
  const input = join(dir, "in");
  await mkdir(input);
  await copyFile(sample, join(input, "model.3mf"));
  const result = await node(convertWith, presets, input, join(dir, "out"));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /ok\s+model\.3mf\s+->\s+snapmaker-u1-0\.4-standard with "Strong"/);
  assert.equal((await settingsOf(join(dir, "out", "model_U1.3mf"))).wall_loops, "4");
});

test("refuses a presets file that isn't one", async () => {
  const bad = join(dir, "bad.json");
  // Raw text, so the "__proto__" key really reaches the parser (an object literal would set the prototype instead).
  const good = parsePresetFile(await readFile(join(dir, "plain.json"), "utf-8")).presets[0];
  const text = JSON.stringify({ format: "any2orca-presets", version: 1, presets: [{ ...good, changes: { wall_loops: "4" } }] });
  await writeFile(bad, text.replace('"wall_loops":"4"', '"__proto__":{"polluted":"yes"}'));
  const result = await node(convertWith, bad, dir);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Can't use .*bad\.json: .*key named "__proto__"/);
});

test("make-preset.mjs says in a sentence why a file can't make a preset, without a stack trace", async () => {
  const missing = await node(make, join(dir, "nope.3mf"), "x", join(dir, "x.json"));
  assert.equal(missing.code, 1);
  assert.doesNotMatch(missing.stderr, /\n\s+at /);
  const notU1 = await node(make, sample, "x", join(dir, "x.json"));
  assert.equal(notU1.code, 1);
  assert.doesNotMatch(notU1.stderr, /\n\s+at /);
  assert.match(notU1.stderr, /Snapmaker U1/);
});
