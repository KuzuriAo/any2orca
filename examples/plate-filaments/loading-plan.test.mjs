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
  // Each plate also gives its thinnest and thickest layer, to compare with what the nozzle takes.
  assert.equal(result.stdout.match(/^ {4}Layers: 0\.2 mm$/gm)?.length, 7);
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
  assert.deepEqual(project.plates[2].filaments[2], { slot: 3, uses: ["paint"], from: 0, to: 25.6, firstLayer: 1, lastLayer: 128 });
  assert.equal(project.plates[5].swapPlan, null);
  assert.deepEqual(project.plates[5].layerHeights, { thinnest: 0.2, thickest: 0.2 });
});

test("says how a plate with more filaments than toolheads prints on them, and where its pause is", async () => {
  // Plate 2 prints with filament 4; tool changes bring in 1, 2, 3 and 5 by height, and a pause sits at 12 mm.
  const entries = unzipSync(new Uint8Array(await readFile(sevenPlates)));
  const changes = [[5, 1], [10, 2], [15, 3], [20, 5]].map(([z, f]) => `<layer top_z="${z}" type="2" extruder="${f}" color="" extra="" gcode="tool_change"/>`).join("");
  entries["Metadata/custom_gcode_per_layer.xml"] = strToU8(
    `<custom_gcodes_per_layer><plate><plate_info id="2"/>${changes}<layer top_z="12" type="1" extruder="1" color="" extra="" gcode="M601"/><mode value="MultiAsSingle"/></plate></custom_gcodes_per_layer>`,
  );
  const dir = await mkdtemp(join(tmpdir(), "a2o-plan-"));
  const project = join(dir, "changes.3mf");
  await writeFile(project, zipSync(entries));

  const result = await plan(project);
  assert.match(
    result.stdout,
    / {2}Plate 2: 5 filaments, 2 at the same height: prints with filament changes at pauses\n {4}Load 1, 2, 3, 4 to start\n {4}Filaments 4, then 5 share a toolhead; 4 to 5: a pause on a layer from 26 to 100 \(already at layer 60\)\n/,
  );
  const [data] = JSON.parse((await plan(project, "--json")).stdout);
  assert.deepEqual(data.plates[1].swapPlan.shared[0].filaments, [4, 5]);
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

test("says when a plate uses a filament above the number the release prints in shared layers", async () => {
  // The seven-plate project with 17 filaments, plate 3's painted face on filament 17 instead of 3.
  const entries = unzipSync(new Uint8Array(await readFile(sevenPlates)));
  const settings = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]));
  for (const key of ["filament_colour", "filament_settings_id", "filament_type"]) settings[key] = Array.from({ length: 17 }, (_, i) => settings[key][i] ?? settings[key][0]);
  entries["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  entries["3D/Objects/object_6.model"] = strToU8(strFromU8(entries["3D/Objects/object_6.model"]).replaceAll('paint_color="0C"', 'paint_color="EC"'));
  const dir = await mkdtemp(join(tmpdir(), "a2o-plan-"));
  const project = join(dir, "seventeen.3mf");
  await writeFile(project, zipSync(entries));

  const result = await plan(project);
  assert.match(result.stdout, / {2}Plate 3: load 3 filaments\n {4}Snapmaker Orca \d+\.\d+\.\d+ can leave filament 17 out of some layers here, since the filament 16 numbers below prints on this plate too: check the sliced preview\n/);
  // Only plate 3 uses it.
  assert.equal(result.stdout.match(/can leave filament/g).length, 1);

  const older = await plan(project, "--snapmaker-orca-version", "2.4.0", "--json");
  assert.deepEqual(JSON.parse(older.stdout)[0].plates.map((p) => p.aboveSharedLayerLimit), [[], [], [17], [], [], [], []]);

  const unknown = await plan(project, "--snapmaker-orca-version", "9.9.9");
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Snapmaker Orca "9\.9\.9" isn't one of the releases/);
});
