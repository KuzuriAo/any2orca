// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { buildStatsEvent } from "any2orca";
import { createCollector, readAccessFromEnv, startupMessages } from "./collector.mjs";

const run = promisify(execFile);
const event = buildStatsEvent({
  profileId: "snapmaker-u1-0.4-standard",
  profileMatch: { matchSource: "auto-exact" },
  plates: 2,
  objects: 5,
  filamentSlots: 3,
  sourceVendor: "bambu",
  ref: "my-site",
  date: new Date("2026-10-20T12:00:00Z"),
});

let dir;
let file;
let server;
let url;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "a2o-collector-"));
  file = join(dir, "events.jsonl");
  server = createCollector({ file, allowOrigin: "https://example.com" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/event`;
});
after(() => server.close());

const post = (body, headers = { "content-type": "application/json" }) => fetch(url, { method: "POST", headers, body });

test("stores a valid event and answers 204", async () => {
  const response = await post(JSON.stringify(event));
  assert.equal(response.status, 204);
  const lines = (await readFile(file, "utf-8")).trim().split("\n");
  assert.deepEqual(JSON.parse(lines.at(-1)), event);
});

test("rejects an event with an extra field, and stores nothing for it", async () => {
  const before = await readFile(file, "utf-8");
  const response = await post(JSON.stringify({ ...event, fileName: "secret.3mf" }));
  assert.equal(response.status, 400);
  assert.equal(await readFile(file, "utf-8"), before);
});

test("rejects malformed JSON, wrong content type and wrong methods", async () => {
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post(JSON.stringify(event), { "content-type": "text/plain" })).status, 415);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url.replace("/event", "/other"), { method: "POST" })).status, 404);
});

test("rejects an oversized body with 413", async () => {
  const response = await post(JSON.stringify({ ...event, padding: "x".repeat(10_000) }));
  assert.equal(response.status, 413);
});

test("answers a browser preflight only for the allowed origin", async () => {
  const allowed = await fetch(url, { method: "OPTIONS", headers: { origin: "https://example.com" } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://example.com");
  const other = await fetch(url, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
  assert.equal(other.status, 405);
});

test("rate limits across all senders", async () => {
  const limited = createCollector({ file: join(dir, "limited.jsonl"), maxEventsPerMinute: 3 });
  await new Promise((resolve) => limited.listen(0, "127.0.0.1", resolve));
  try {
    const limitedUrl = `http://127.0.0.1:${limited.address().port}/event`;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await fetch(limitedUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) })).status);
    }
    assert.deepEqual(statuses, [204, 204, 204, 429, 429]);
  } finally {
    limited.close();
  }
});

test("the summary counts valid lines and skips bad ones", async () => {
  const sample = join(dir, "sample.jsonl");
  await writeFile(sample, `${JSON.stringify(event)}\n${JSON.stringify(event)}\nnot json\n${JSON.stringify({ ...event, extra: 1 })}\n`);
  const { stdout } = await run("node", [new URL("./summarize.mjs", import.meta.url).pathname, sample, "--json"]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.events, 2);
  assert.equal(summary.skipped, 2);
  assert.deepEqual(summary.sourceVendor, { bambu: 2 });
  assert.deepEqual(summary.ref, { "my-site": 2 });
});

test("the real command-line tool sends its event here, and only when opted in", async () => {
  const cli = join(createRequire(import.meta.url).resolve("any2orca/package.json"), "..", "dist", "cli.js");
  const project = join(dir, "model.3mf");
  await copyFile(new URL("../../apps/web/public/demo-model.3mf", import.meta.url).pathname, project);
  const env = (extra) => ({ PATH: process.env.PATH, ANY2ORCA_CONFIG_DIR: join(dir, "config"), NO_UPDATE_NOTIFIER: "1", ...extra });
  const count = async () => (await readFile(file, "utf-8")).trim().split("\n").length;

  const before = await count();
  await run("node", [cli, "convert", project, "--out-dir", dir, "--stats-endpoint", url], { env: env({}) });
  assert.equal(await count(), before, "nothing is sent unless the user opted in");

  await run("node", [cli, "convert", project, "--out-dir", dir, "--stats-endpoint", url], { env: env({ ANY2ORCA_TELEMETRY: "1" }) });
  assert.equal(await count(), before + 1, "an opted-in conversion sends exactly one event");
  const sent = JSON.parse((await readFile(file, "utf-8")).trim().split("\n").at(-1));
  assert.deepEqual(Object.keys(sent).sort(), ["core", "day", "filamentSlots", "matchSource", "objects", "plates", "profileId", "sourceVendor", "v"]);
});

const TOKEN = "a".repeat(16) + "0123456789abcdef0123";

/** A collector with the given read access, listening on a free port; returns its base URL and a stopper. */
async function withCollector(read, name) {
  const collector = createCollector({ file: join(dir, name), read });
  await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${collector.address().port}`, close: () => collector.close() };
}

test("GET /summary is off unless a token or READ_AUTH=none is set", async () => {
  const { base, close } = await withCollector({}, "off.jsonl");
  try {
    assert.equal((await fetch(`${base}/summary`)).status, 404);
    assert.equal((await fetch(`${base}/summary`, { headers: { authorization: `Bearer ${TOKEN}` } })).status, 404);
  } finally {
    close();
  }
});

test("GET /summary needs the right token, and returns the counts", async () => {
  const { base, close } = await withCollector({ token: TOKEN }, "read.jsonl");
  try {
    await fetch(`${base}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
    const missing = await fetch(`${base}/summary`);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") ?? "", /^Bearer/);
    assert.equal((await fetch(`${base}/summary`, { headers: { authorization: `Bearer ${TOKEN}x` } })).status, 401);
    assert.equal((await fetch(`${base}/summary`, { headers: { authorization: TOKEN } })).status, 401);
    assert.equal((await fetch(`${base}/summary`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } })).status, 405);

    const ok = await fetch(`${base}/summary`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const summary = await ok.json();
    assert.equal(summary.events, 1);
    assert.deepEqual(summary.ref, { "my-site": 1 });

    // A new event shows up in the next read.
    await fetch(`${base}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
    const again = await (await fetch(`${base}/summary`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    assert.equal(again.events, 2);
  } finally {
    close();
  }
});

test("READ_AUTH=none reads with no token", async () => {
  const { base, close } = await withCollector({ open: true }, "open.jsonl");
  try {
    const ok = await fetch(`${base}/summary`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).events, 0);
  } finally {
    close();
  }
});

test("read access from the environment refuses weak or contradictory setups", async () => {
  const tokenFile = join(dir, "read-token");
  await writeFile(tokenFile, `${TOKEN}\n`);
  assert.deepEqual(readAccessFromEnv({}), {});
  assert.deepEqual(readAccessFromEnv({ READ_TOKEN: TOKEN }), { token: TOKEN });
  assert.deepEqual(readAccessFromEnv({ READ_TOKEN_FILE: tokenFile }), { token: TOKEN });
  assert.deepEqual(readAccessFromEnv({ READ_AUTH: "none" }), { open: true });
  assert.throws(() => readAccessFromEnv({ READ_TOKEN: "short" }), /at least 32 characters/);
  assert.throws(() => readAccessFromEnv({ READ_TOKEN: TOKEN, READ_TOKEN_FILE: tokenFile }), /not both/);
  assert.throws(() => readAccessFromEnv({ READ_AUTH: "none", READ_TOKEN: TOKEN }), /contradict/);
  assert.throws(() => readAccessFromEnv({ READ_AUTH: "yes" }), /can only be "none"/);
  assert.throws(() => createCollector({ file: join(dir, "x.jsonl"), read: { token: "short" } }), /at least 32/);
});

test("READ_AUTH=none warns at every start, on loopback too, because a reverse proxy in front makes it public", () => {
  for (const host of ["127.0.0.1", "localhost", "::1", "0.0.0.0", "192.168.1.20"]) {
    const { warnings } = startupMessages({ file: "events.jsonl", host, port: 8788, read: { open: true } });
    assert.equal(warnings.length, 1, host);
    assert.match(warnings[0], /anyone who can reach/);
    assert.match(warnings[0], /reverse proxy/);
  }
  assert.deepEqual(startupMessages({ file: "events.jsonl", host: "127.0.0.1", port: 8788, read: { token: TOKEN } }).warnings, []);
  assert.deepEqual(startupMessages({ file: "events.jsonl", host: "127.0.0.1", port: 8788, read: {} }).warnings, []);
});

test("summarize.mjs says when the events file is missing, without a stack trace", async () => {
  const result = await run("node", [new URL("./summarize.mjs", import.meta.url).pathname, "/nonexistent/events.jsonl"]).then(
    () => ({ code: 0, stderr: "" }),
    (e) => ({ code: e.code, stderr: e.stderr }),
  );
  assert.equal(result.code, 1);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.match(result.stderr, /events\.jsonl/);
});

test("reads relative paths from where npm was run, not from the example's folder", async () => {
  // `STATS_FILE=./events.jsonl READ_TOKEN_FILE=./read-token npm start -w ...` runs the script here, with INIT_CWD set to where you typed it.
  const root = await mkdtemp(join(tmpdir(), "a2o-collector-cwd-"));
  await writeFile(join(root, "read-token"), "a".repeat(64));
  await writeFile(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`);
  const here = new URL(".", import.meta.url).pathname;
  const { stdout } = await run("node", ["summarize.mjs", "./events.jsonl"], { cwd: here, env: { ...process.env, INIT_CWD: root } });
  assert.match(stdout, /^1 event\(s\)/);
  // The collector resolves the token file the same way; a wrong base would fail to start with ENOENT.
  const child = execFile("node", ["collector.mjs"], { cwd: here, env: { ...process.env, INIT_CWD: root, PORT: "0", STATS_FILE: "./events.jsonl", READ_TOKEN_FILE: "./read-token" } });
  const output = await new Promise((resolve) => {
    let text = "";
    const done = () => resolve(text);
    child.stdout.on("data", (d) => { text += d; if (text.includes("Counts:")) done(); });
    child.stderr.on("data", (d) => { text += d; });
    child.on("exit", done);
  });
  child.kill();
  assert.doesNotMatch(output, /Not started/);
  assert.ok(output.includes(join(root, "events.jsonl")), output);
});
