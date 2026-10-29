// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { promisify } from "node:util";
import { convert, loadCatalog } from "any2orca";
import { bundledProfileSource } from "any2orca/node";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./versions.mjs", import.meta.url));
const sample = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));
const versions = (...args) =>
  run("node", [script, ...args]).then(
    (r) => ({ code: 0, stdout: r.stdout }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "a2o-stamps-"));
  const profiles = await loadCatalog(bundledProfileSource());
  const source = new Uint8Array(await readFile(sample));
  await writeFile(join(dir, "plain_U1.3mf"), (await convert(source, { profiles })).output);
  await writeFile(join(dir, "options_U1.3mf"), (await convert(source, { profiles, highFlowHotends: [true, false, true, false], hardenedNozzles: true })).output);
  await writeFile(join(dir, "no-note_U1.3mf"), (await convert(source, { profiles, stamp: false })).output);
  await writeFile(join(dir, "broken.3mf"), "not a zip");
});

test("lists each file's release, profile set and options", async () => {
  const result = await versions(dir);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /plain_U1\.3mf: any2orca \d+\.\d+\.\d+\S*, Snapmaker Orca [\d.]+, snapmaker-u1-0\.4-standard\n/);
  assert.match(result.stdout, /options_U1\.3mf: .*high flow on toolheads 1, 3, hardened nozzles/);
  assert.match(result.stdout, /no-note_U1\.3mf: no version note/);
  assert.match(result.stdout, /broken\.3mf: not a readable 3MF/);
});

test("--older-than flags files made by an earlier release", async () => {
  const flagged = await versions(dir, "--older-than", "999.0.0");
  assert.equal(flagged.code, 1);
  assert.match(flagged.stdout, /2 file\(s\) made before 999\.0\.0/);
  const none = await versions(dir, "--older-than", "0.0.0");
  assert.equal(none.code, 0);
  assert.equal((await versions(dir, "--older-than", "soon")).code, 2);
});
