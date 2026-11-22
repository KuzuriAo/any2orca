// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./loading-plan.mjs", import.meta.url));
// Seven plates and six filaments; plate 6 has five objects on five filaments, plate 3 a painted face.
const sevenPlates = fileURLToPath(new URL("../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url));
const demo = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));
const plan = (...args) =>
  run(process.execPath, [script, ...args]).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

test("lists each plate's filaments, how each is used, and the plate that needs more than the U1 prints with", async () => {
  const result = await plan(sevenPlates);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /: 7 plates with objects, 6 filaments\n/);
  assert.match(result.stdout, / {2}Plate 1: load 3 filaments\n {5}1 {2}#000000 {2}PLA {2}PolyTerra PLA @BBL X1C {2}\(its objects; 0 to 25\.6 mm\)\n/);
  assert.match(result.stdout, / {2}Plate 2: load 1 filament\n/);
  assert.match(result.stdout, / {2}Plate 3: load 3 filaments\n(.*\n){2} {5}3 {2}#0056B8 {2}PETG {2}PolyLite PETG @BBL X1C {2}\(paint; 0 to 25\.6 mm\)\n/);
  assert.match(result.stdout, / {2}Plate 6: needs 5 filaments at the same height; the U1 prints with 4\n/);
});

test("exits 0 for a project every plate of which the U1 can print", async () => {
  const result = await plan(demo);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Plate 1: load \d filaments?\n/);
});

test("--json prints the same as data", async () => {
  const result = await plan(sevenPlates, "--json");
  assert.equal(result.code, 1);
  const [project] = JSON.parse(result.stdout);
  assert.equal(project.filaments.length, 6);
  assert.deepEqual(
    project.plates.map((p) => [p.plate, p.verdict, p.filaments.map((f) => f.slot)]),
    [
      [1, "fits", [1, 2, 3]],
      [2, "fits", [4]],
      [3, "fits", [1, 2, 3]],
      [4, "fits", [1, 2]],
      [5, "fits", [1, 2]],
      [6, "too-many-at-once", [1, 2, 3, 5, 6]],
      [7, "fits", [1, 2]],
    ],
  );
  assert.deepEqual(project.plates[2].filaments[2], { slot: 3, uses: ["paint"], from: 0, to: 25.6 });
});

test("says what is wrong with a file it can't read, and exits 2", async () => {
  const dir = await mkdtemp(join(tmpdir(), "a2o-plan-"));
  const broken = join(dir, "broken.3mf");
  await writeFile(broken, "not a zip");
  const result = await plan(broken, join(dir, "missing.3mf"));
  assert.equal(result.code, 2);
  assert.match(result.stderr, /broken\.3mf: This file can't be read as a 3MF project/);
  assert.match(result.stderr, /missing\.3mf: can't be read \(ENOENT\)/);
  assert.equal((await plan()).code, 2);
});
