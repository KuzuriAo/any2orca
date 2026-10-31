// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./convert-all.mjs", import.meta.url));
const sample = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));

test("converts good files, reports bad ones, and exits 1 when any failed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await copyFile(sample, join(dir, "good.3mf"));
  await writeFile(join(dir, "broken.3mf"), "not a zip at all");
  await writeFile(join(dir, "ignored.txt"), "not a 3mf");

  const result = await run("node", [script, dir, join(dir, "out")]).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ok\s+good\.3mf/);
  assert.match(result.stderr, /FAILED\s+broken\.3mf\s+\[invalid_file\]/);
  assert.deepEqual(await readdir(join(dir, "out")), ["good_U1.3mf"]);

  const entries = unzipSync(new Uint8Array(await readFile(join(dir, "out", "good_U1.3mf"))));
  assert.ok(entries["Metadata/any2orca.json"], "the output carries the version note");
});

test("exits 0 when everything converts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await copyFile(sample, join(dir, "a.3mf"));
  const { stdout } = await run("node", [script, dir, join(dir, "out")]);
  assert.match(stdout, /1 converted, 0 failed/);
});

test("converts for each Snapmaker Orca release the catalog holds, and refuses one it doesn't", async () => {
  const index = JSON.parse(await readFile(fileURLToPath(new URL("../../packages/profiles/data/index.json", import.meta.url)), "utf-8"));
  for (const release of index.releases) {
    const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
    await copyFile(sample, join(dir, "a.3mf"));
    const { stdout } = await run("node", [script, dir, join(dir, "out"), "--snapmaker-orca-version", release.version]);
    assert.match(stdout, new RegExp(`Converting for Snapmaker Orca ${release.version.replaceAll(".", "\\.")}\\.`));
    const model = new TextDecoder().decode(unzipSync(new Uint8Array(await readFile(join(dir, "out", "a_U1.3mf"))))["3D/3dmodel.model"]);
    assert.match(model, new RegExp(`<metadata name="Application">${release.application}</metadata>`));
  }
  const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await copyFile(sample, join(dir, "a.3mf"));
  const refused = await run("node", [script, dir, join(dir, "out"), "--snapmaker-orca-version", "1.0.0"]).catch((e) => e);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /isn't one of the releases this profile catalog holds/);
});

test("reads a relative folder from where npm was run, not from the example's folder", async () => {
  // `npm run start -w ... -- ./my-models` runs the script inside examples/batch-script, with INIT_CWD set to where you typed it.
  const root = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await mkdir(join(root, "my-models"));
  await copyFile(sample, join(root, "my-models", "a.3mf"));
  const { stdout } = await run("node", [script, "./my-models"], { cwd: fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, INIT_CWD: root } });
  assert.match(stdout, /1 converted, 0 failed/);
  assert.deepEqual(await readdir(join(root, "my-models", "converted")), ["a_U1.3mf"]);
});

test("the command line expands a wildcard itself, as Command Prompt and PowerShell need", async () => {
  // execFile starts the program without a shell, so the `*` reaches it unexpanded, exactly as on Windows.
  const cli = fileURLToPath(new URL("../../packages/core/dist/cli.js", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await copyFile(sample, join(dir, "one.3mf"));
  await copyFile(sample, join(dir, "two.3mf"));
  await writeFile(join(dir, "notes.txt"), "not a 3mf");
  const env = { ...process.env, NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") };
  await run("node", [cli, "convert", join(dir, "*.3mf"), "--out-dir", join(dir, "out")], { env });
  assert.deepEqual(await readdir(join(dir, "out")), ["one_U1.3mf", "two_U1.3mf"]);
});
