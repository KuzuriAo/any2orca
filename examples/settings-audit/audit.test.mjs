// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert, extractPreset, loadCatalog, serializePresets } from "any2orca";
import { bundledProfileSource } from "any2orca/node";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./audit.mjs", import.meta.url));
const sample = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));
const SETTINGS = "Metadata/project_settings.config";

let dir;
let converted;
let tuned;

/** The same project with some print settings changed, as if tuned in Snapmaker Orca. */
function edit(bytes, change) {
  const files = unzipSync(bytes);
  const settings = JSON.parse(strFromU8(files[SETTINGS]));
  Object.assign(settings, change);
  files[SETTINGS] = strToU8(JSON.stringify(settings));
  return zipSync(files);
}

const audit = (...args) =>
  run("node", [script, ...args]).then(
    (r) => ({ code: 0, stdout: r.stdout }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "a2o-audit-"));
  const catalog = await loadCatalog(bundledProfileSource());
  ({ output: converted } = await convert(new Uint8Array(await readFile(sample)), { profiles: catalog, stamp: false }));
  tuned = edit(converted, { wall_loops: "4" });
});

test("passes a project that matches Snapmaker's stock profile", async () => {
  const folder = join(dir, "clean");
  await mkdir(folder);
  await writeFile(join(folder, "model.3mf"), converted);
  const result = await audit(folder);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /ok\s+model\.3mf\s+\(against stock 0\.20mm Standard/);
});

test("explains paired values, such as the U1's standard and high-flow speeds", async () => {
  const folder = join(dir, "paired");
  await mkdir(folder);
  await writeFile(join(folder, "model.3mf"), edit(converted, { outer_wall_speed: ["150", "500"] }));
  const result = await audit(folder);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /\[outer_wall_speed\]: 200, 500 -> 150, 500/);
  assert.match(result.stdout, /Two values: standard hotend, then Liber High Flow Hotend\./);
});

test("fails on a setting nobody allowed, and names it with both values", async () => {
  const folder = join(dir, "tuned");
  await mkdir(folder);
  await writeFile(join(folder, "model.3mf"), tuned);
  const result = await audit(folder);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /DIFFERS model\.3mf/);
  assert.match(result.stdout, /Wall loops \[wall_loops\]: 2 -> 4/);

  assert.doesNotMatch(result.stdout, /Two values/, "no note when no listed value is a pair");

  const allowed = await audit(folder, "--allow", "wall_loops");
  assert.equal(allowed.code, 0);
  assert.match(allowed.stdout, /1 allowed/);
});

test("checks against a house preset instead of stock", async () => {
  const catalog = await loadCatalog(bundledProfileSource());
  const { preset } = await extractPreset(tuned, { profiles: catalog });
  const presetFile = join(dir, "house.json");
  await writeFile(presetFile, serializePresets([{ ...preset, name: "House" }]));

  const folder = join(dir, "house");
  await mkdir(folder);
  await writeFile(join(folder, "follows-house.3mf"), tuned);
  await writeFile(join(folder, "plain-stock.3mf"), converted);
  const result = await audit(folder, "--preset", presetFile);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /ok\s+follows-house\.3mf\s+\(against Your preset House/);
  assert.match(result.stdout, /DIFFERS plain-stock\.3mf[\s\S]*wall_loops\]: 4 -> 2/);
});

test("reports a file it can't read, and a usage error", async () => {
  const folder = join(dir, "broken");
  await mkdir(folder);
  await writeFile(join(folder, "broken.3mf"), "not a zip");
  const broken = await audit(folder);
  assert.equal(broken.code, 1);
  assert.match(broken.stdout, /FAILED\s+broken\.3mf\s+\[invalid_file\]/);
  assert.equal((await audit()).code, 2);
});
