// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { unzipSync } from "fflate";

const run = promisify(execFile);
const script = new URL("./convert-all.mjs", import.meta.url).pathname;
const sample = new URL("../../apps/web/public/demo-model.3mf", import.meta.url).pathname;

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

test("reads a relative folder from where npm was run, not from the example's folder", async () => {
  // `npm run start -w ... -- ./my-models` runs the script inside examples/batch-script, with INIT_CWD set to where you typed it.
  const root = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await mkdir(join(root, "my-models"));
  await copyFile(sample, join(root, "my-models", "a.3mf"));
  const { stdout } = await run("node", [script, "./my-models"], { cwd: new URL(".", import.meta.url).pathname, env: { ...process.env, INIT_CWD: root } });
  assert.match(stdout, /1 converted, 0 failed/);
  assert.deepEqual(await readdir(join(root, "my-models", "converted")), ["a_U1.3mf"]);
});

test("the command line expands a wildcard itself, as Command Prompt and PowerShell need", async () => {
  // execFile starts the program without a shell, so the `*` reaches it unexpanded, exactly as on Windows.
  const cli = new URL("../../packages/core/dist/cli.js", import.meta.url).pathname;
  const dir = await mkdtemp(join(tmpdir(), "a2o-batch-"));
  await copyFile(sample, join(dir, "one.3mf"));
  await copyFile(sample, join(dir, "two.3mf"));
  await writeFile(join(dir, "notes.txt"), "not a 3mf");
  const env = { ...process.env, NO_UPDATE_NOTIFIER: "1", ANY2ORCA_CONFIG_DIR: join(dir, "config") };
  await run("node", [cli, "convert", join(dir, "*.3mf"), "--out-dir", join(dir, "out")], { env });
  assert.deepEqual(await readdir(join(dir, "out")), ["one_U1.3mf", "two_U1.3mf"]);
});
