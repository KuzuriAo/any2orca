// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./build-u1-files.mjs", import.meta.url));
const sample = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));

async function build(source, out) {
  return run("node", [script, source, out]).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );
}

test("converts, writes a manifest, and skips unchanged files on the next run", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2o-pipeline-"));
  const source = join(root, "src");
  const out = join(root, "out");
  await run("mkdir", [source]);
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
  await run("mkdir", [source]);
  await copyFile(sample, join(source, "good.3mf"));
  await writeFile(join(source, "bad.3mf"), "nope");

  const result = await build(source, out);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FAILED\s+bad\.3mf\s+\[invalid_file\]/);
  const manifest = JSON.parse(await readFile(join(out, "u1-files.json"), "utf-8"));
  assert.deepEqual(manifest.files.map((f) => f.source), ["good.3mf"]);
});
