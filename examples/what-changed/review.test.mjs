// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { promisify } from "node:util";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert, loadCatalog } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const run = promisify(execFile);
const script = new URL("./review.mjs", import.meta.url).pathname;
const sample = new URL("../../apps/web/public/demo-model.3mf", import.meta.url).pathname;
const SETTINGS = "Metadata/project_settings.config";
const review = (...args) =>
  run("node", [script, ...args]).then(
    (r) => ({ code: 0, stdout: r.stdout }),
    (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

let input;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "a2o-what-changed-"));
  input = join(dir, "in");
  await mkdir(input);
  await copyFile(sample, join(input, "plain.3mf"));
  // A project whose inner wall speed is above the U1's 500 mm/s limit.
  const { output } = await convert(new Uint8Array(await readFile(sample)), { profiles: await loadCatalog(bundledProfileSource()), stamp: false });
  const files = unzipSync(output);
  const settings = JSON.parse(strFromU8(files[SETTINGS]));
  settings.inner_wall_speed = ["900", "900"];
  files[SETTINGS] = strToU8(JSON.stringify(settings));
  await writeFile(join(input, "fast.3mf"), zipSync(files));
});

test("writes each file's record next to it, in the shared format", async () => {
  const out = join(input, "..", "out-all");
  const result = await review(input, out);
  assert.equal(result.code, 0);
  assert.deepEqual((await readdir(out)).sort(), ["fast_U1.3mf", "fast_U1.what-changed.json", "plain_U1.3mf", "plain_U1.what-changed.json"]);
  const record = JSON.parse(await readFile(join(out, "fast_U1.what-changed.json"), "utf-8"));
  assert.equal(record.format, "any2orca-what-changed");
  const capped = record.groups.find((group) => group.reason === "capped");
  const innerWall = capped.items.find((item) => item.key === "inner_wall_speed");
  assert.equal(innerWall.before, "900");
  assert.equal(innerWall.after, "500");
  assert.ok(record.diff, "explain: true includes the full settings difference");
  assert.match(result.stdout, /choice: .*Inner wall: 900 -> 500/);
});

test("--fail-on flags files with changes for those reasons", async () => {
  const result = await review(input, join(input, "..", "out-flag"), "--fail-on", "capped");
  assert.equal(result.code, 1);
  assert.match(result.stdout, /fast\.3mf[\s\S]*flagged: has capped changes/);
  assert.doesNotMatch(result.stdout, /plain\.3mf[^\n]*\n\s+flagged/);
  assert.match(result.stdout, /2 converted, 0 failed, 1 flagged/);
  assert.equal((await review(input, join(input, "..", "out-bad"), "--fail-on", "nonsense")).code, 2);
});
