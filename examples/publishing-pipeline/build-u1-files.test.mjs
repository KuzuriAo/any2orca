// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./build-u1-files.mjs", import.meta.url));
const sample = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));

async function build(source, out, ...extra) {
  return run("node", [script, source, out, ...extra]).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );
}

test("converts, writes a manifest, and skips unchanged files on the next run", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await mkdir(source);
  await copyFile(sample, join(source, "desk-set.3mf"));

  const first = await build(source, out);
  assert.equal(first.code, 0);
  assert.match(first.stdout, /ok\s+desk-set\.3mf/);

  const manifest = JSON.parse(await readFile(join(out, "u1-files.json"), "utf-8"));
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].file, "desk-set_U1.3mf");
  assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/);

  const before = (await stat(join(out, "desk-set_U1.3mf"))).mtimeMs;
  await utimes(join(out, "desk-set_U1.3mf"), new Date(1_000_000), new Date(1_000_000));
  const second = await build(source, out);
  assert.equal(second.code, 0);
  assert.match(second.stdout, /skip\s+desk-set\.3mf \(unchanged\)/);
  assert.equal((await stat(join(out, "desk-set_U1.3mf"))).mtimeMs, 1_000_000, "the unchanged output was not rewritten");
  assert.ok(before > 0);
});

test("a broken source fails the build but keeps the manifest of the good ones", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await mkdir(source);
  await copyFile(sample, join(source, "good.3mf"));
  await writeFile(join(source, "bad.3mf"), "nope");

  const result = await build(source, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FAILED\s+bad\.3mf\s+\[invalid_file\]/);
  const manifest = JSON.parse(await readFile(join(out, "u1-files.json"), "utf-8"));
  assert.deepEqual(manifest.files.map((f) => f.source), ["good.3mf"]);
});

test("--filaments snapmaker sets each filament to a Snapmaker preset with its own settings, and says what that replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await mkdir(source);
  await copyFile(fileURLToPath(new URL("../../packages/core/src/test-fixtures/sources/bambu-studio-2.8.4.57-beta.3mf", import.meta.url)), join(source, "scene.3mf"));
  const first = await build(source, out, "--filaments", "snapmaker");
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /Filaments 3 and 4 use Snapmaker PLA SnapSpeed @U1's own settings instead of the creator's: nozzle temperature 225 °C → 220 °C/);
  const manifest = JSON.parse(await readFile(join(out, "u1-files.json"), "utf-8"));
  assert.equal(manifest.files[0].filaments, "snapmaker");
  assert.ok(manifest.files[0].filamentNotes.length > 0);
  // Changing the option converts again; keeping it skips.
  assert.match((await build(source, out, "--filaments", "snapmaker")).stdout, /skip/);
  assert.match((await build(source, out)).stdout, /ok {6}scene\.3mf/);
  assert.equal((await build(source, out, "--filaments", "sideways")).code, 2);
});

test("--filaments snapmaker gives a Polymaker PLA the Polymaker preset Snapmaker Orca ships, and the rest Snapmaker's or Generic's", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await mkdir(source);
  // The shared scene saved with Bambu Studio's Polymaker presets: PolyTerra PLA, PolyLite PLA, PolyLite PETG, Bambu PLA Basic, PolyLite ABS, PolyLite ASA.
  await copyFile(fileURLToPath(new URL("../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url)), join(source, "scene.3mf"));
  const result = await build(source, out, "--filaments", "snapmaker");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Filaments 1 and 2 use Polymaker General PLA Family @U1's own settings instead of the creator's: /);
  assert.match(result.stdout, /Filament 3 uses Generic PETG's own settings/);
  assert.match(result.stdout, /Filament 5 uses Snapmaker ABS @U1 0\.4 nozzle's own settings/);
});

test("--filaments polymaker gives every PLA a Polymaker preset, and the rest what --filaments snapmaker gives them", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await mkdir(source);
  // The same scene: filament 4 is Bambu PLA Basic, which takes Polymaker's General PLA Family too under this option.
  await copyFile(fileURLToPath(new URL("../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url)), join(source, "scene.3mf"));
  const result = await build(source, out, "--filaments", "polymaker");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Filaments 1, 2 and 4 use Polymaker General PLA Family @U1's own settings instead of the creator's: /);
  assert.match(result.stdout, /Polymaker makes no U1 preset for PETG, ABS and ASA at this nozzle size, so those get the preset the Snapmaker option gives them\./);
  const manifest = JSON.parse(await readFile(join(out, "u1-files.json"), "utf8"));
  assert.equal(manifest.files[0].filaments, "polymaker");
});
