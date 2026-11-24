// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./layers.mjs", import.meta.url));
const sevenPlates = fileURLToPath(new URL("../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url));
const layers = (...args) =>
  run(process.execPath, [script, ...args]).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

/** The seven-plate project with a height range that sets 0.1 mm layers: thinner than the 0.6 mm nozzle's profiles use. */
async function withThinRange() {
  const entries = unzipSync(new Uint8Array(await readFile(sevenPlates)));
  entries["Metadata/layer_config_ranges.xml"] = strToU8(
    '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="3">\n  <range min_z="5" max_z="10">\n   <option opt_key="extruder">2</option>\n   <option opt_key="layer_height">0.1</option>\n  </range>\n </object>\n</objects>\n',
  );
  const dir = await mkdtemp(join(tmpdir(), "a2o-layers-"));
  const file = join(dir, "thin.3mf");
  await writeFile(file, zipSync(entries));
  return { dir, file };
}

test("shows each plate's layers and the note a conversion gives when they are thinner than the nozzle's profiles use", async () => {
  const { file } = await withThinRange();
  const result = await layers(file, "--nozzle", "0.6");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /layers for the 0\.6 mm nozzle, which has profiles at 0\.18, 0\.24, 0\.3 mm\n/);
  assert.match(result.stdout, /\n {2}Plate 2: 0\.1 to 0\.2 mm\n/);
  assert.match(result.stdout, /\n {2}The project has layers as thin as 0\.1 mm, below the 0\.12 to 0\.42 mm that Snapmaker's U1 profiles use for the 0\.6 mm nozzle\./);
  // The 0.4 mm nozzle's profiles use 0.1 mm layers: no note.
  assert.doesNotMatch((await layers(file, "--nozzle", "0.4")).stdout, /The project has layers as/);
});

test("converts with one layer height, replacing the creator's own, and writes the file", async () => {
  const { dir, file } = await withThinRange();
  const out = join(dir, "flat.3mf");
  const result = await layers(file, "--nozzle", "0.6", "--layer-height", "0.18", "--out", out);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Every layer is 0\.18 mm, as you chose\. The creator's layer heights set for ranges of an object's height were replaced\./);
  const entries = unzipSync(new Uint8Array(await readFile(out)));
  assert.equal(JSON.parse(strFromU8(entries["Metadata/project_settings.config"])).layer_height, "0.18");
  assert.doesNotMatch(strFromU8(entries["Metadata/layer_config_ranges.xml"]), /opt_key="layer_height"/);
});

test("says which heights the nozzle's profiles have when the one given isn't among them, and exits 2", async () => {
  const { file } = await withThinRange();
  const result = await layers(file, "--nozzle", "0.6", "--layer-height", "0.15");
  assert.equal(result.code, 2);
  assert.match(result.stderr, /no U1 profile with a 0\.15 mm layer height for a 0\.6 mm nozzle; its profiles have 0\.18, 0\.24, 0\.3 mm/);
});

test("says what is wrong with a file it can't read, and exits 2", async () => {
  const result = await layers(join(tmpdir(), "missing-project.3mf"));
  assert.equal(result.code, 2);
  assert.match(result.stderr, /missing-project\.3mf: can't be read \(ENOENT\)/);
  assert.equal((await layers()).code, 2);
});
