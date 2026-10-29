// SPDX-License-Identifier: MIT
// Runs the nginx and Apache configs for real against a small stand-in site and
// checks the headers, caching and 404s. A server that isn't installed is
// skipped. Also checks the configs carry the same policy as the docs, and that
// configure-web applies the sample settings file.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const here = (path) => new URL(path, import.meta.url).pathname;
const run = promisify(execFile);
const docsCsp = (await readFile(here("../../docs/run-the-web-app.md"), "utf-8")).split("\n").find((line) => line.startsWith("default-src "));

/** The first of these programs found on PATH or at an absolute path, or undefined. */
function which(...names) {
  for (const name of names) {
    if (name.startsWith("/")) {
      if (existsSync(name)) return name;
      continue;
    }
    try {
      return execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf-8" }).trim() || undefined;
    } catch {
      // not installed
    }
  }
  return undefined;
}

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** A stand-in for a built copy: the page, a hashed script and the profile catalog. */
async function site(dir) {
  const root = join(dir, "site");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "profiles"), { recursive: true });
  await writeFile(join(root, "index.html"), '<!doctype html>\n<html lang="en"><head><title>any2orca</title></head><body></body></html>\n');
  await writeFile(join(root, "assets", "index-abc123.js"), "console.log(1);\n");
  await writeFile(join(root, "profiles", "index.json"), '{"schema":1}\n');
  return root;
}

/** Waits until the server answers, or gives up after a few seconds. */
async function ready(base) {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`no answer from ${base}`);
}

/** The checks both servers must pass. */
async function check(base, { hidden }) {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-security-policy"), docsCsp);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(page.headers.get("cache-control") ?? "", /no-cache/);
  const html = await page.text();
  if (hidden) assert.match(html, /<html lang="en" data-hide="beyond,faq"/);
  else assert.doesNotMatch(html, /data-hide/);

  const asset = await fetch(`${base}/assets/index-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control") ?? "", /max-age=31536000/);
  assert.equal(asset.headers.get("content-security-policy"), docsCsp, "the policy also applies to assets");

  const profiles = await fetch(`${base}/profiles/index.json`);
  assert.equal(profiles.status, 200);
  assert.match(profiles.headers.get("cache-control") ?? "", /no-cache/);

  assert.equal((await fetch(`${base}/.env`)).status, 404, "unknown paths get a real 404");
}

test("both configs carry the policy from the docs", async () => {
  assert.ok(docsCsp, "the docs show the policy");
  for (const conf of ["nginx/any2orca.conf", "apache/any2orca.conf"]) {
    assert.ok((await readFile(here(conf), "utf-8")).includes(`"${docsCsp}"`), conf);
  }
});

const nginx = which("nginx", "/usr/sbin/nginx", "/opt/homebrew/bin/nginx");
for (const hidden of [false, true]) {
  test(`nginx serves the site with the right headers${hidden ? ", hiding sections" : ""}`, { skip: nginx ? false : "nginx isn't installed" }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "a2o-nginx-"));
    const root = await site(dir);
    const port = await freePort();
    let conf = (await readFile(here("nginx/any2orca.conf"), "utf-8")).replace("listen 80;", `listen 127.0.0.1:${port};`).replace("root /var/www/any2orca;", `root ${root};`);
    if (hidden) conf = conf.replace("# sub_filter '", "sub_filter '").replace("# sub_filter_once on;", "sub_filter_once on;");
    await writeFile(join(dir, "site.conf"), conf);
    const temp = (name) => `${name}_temp_path ${join(dir, name)};`;
    await writeFile(
      join(dir, "nginx.conf"),
      `pid ${join(dir, "nginx.pid")};\nerror_log ${join(dir, "error.log")};\ndaemon off;\nevents {}\nhttp {\n  types { text/html html; application/javascript js; application/json json; }\n  access_log off;\n  ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map(temp).join("\n  ")}\n  include ${join(dir, "site.conf")};\n}\n`,
    );
    await run(nginx, ["-t", "-p", dir, "-c", join(dir, "nginx.conf")]);
    const server = spawn(nginx, ["-p", dir, "-c", join(dir, "nginx.conf")], { stdio: "ignore" });
    try {
      await ready(`http://127.0.0.1:${port}/`);
      await check(`http://127.0.0.1:${port}`, { hidden });
    } finally {
      server.kill();
    }
  });
}

const apache = which("httpd", "apache2", "/usr/sbin/httpd", "/usr/sbin/apache2");
const modules = ["/usr/libexec/apache2", "/usr/lib/apache2/modules", "/usr/lib64/httpd/modules", "/opt/homebrew/lib/httpd/modules"].find((dir) => existsSync(join(dir, "mod_headers.so")));
for (const hidden of [false, true]) {
  test(`Apache serves the site with the right headers${hidden ? ", hiding sections" : ""}`, { skip: apache && modules ? false : "Apache isn't installed" }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "a2o-apache-"));
    const root = await site(dir);
    const port = await freePort();
    let conf = (await readFile(here("apache/any2orca.conf"), "utf-8")).replace("<VirtualHost *:80>", `<VirtualHost 127.0.0.1:${port}>`).replaceAll("/var/www/any2orca", root);
    if (hidden) conf = conf.replace("# AddOutputFilterByType SUBSTITUTE", "AddOutputFilterByType SUBSTITUTE").replace('# Substitute "', 'Substitute "');
    await writeFile(join(dir, "site.conf"), conf);
    // Some distributions compile modules such as unixd and log_config into the binary, and loading those again is an error.
    const builtIn = execFileSync(apache, ["-l"], { encoding: "utf-8" });
    const load = ["mpm_prefork", "unixd", "authz_core", "mime", "dir", "headers", "filter", "substitute", "log_config"]
      .filter((name) => !builtIn.includes(`mod_${name}.c`))
      .map((name) => `LoadModule ${name}_module ${join(modules, `mod_${name}.so`)}`)
      .join("\n");
    await writeFile(
      join(dir, "httpd.conf"),
      `ServerRoot "${dir}"\nServerName localhost\nKeepAlive Off\nTypesConfig /dev/null\nListen 127.0.0.1:${port}\n${load}\nPidFile "${join(dir, "httpd.pid")}"\nErrorLog "${join(dir, "error.log")}"\nAddType text/html .html\nAddType application/javascript .js\nAddType application/json .json\nInclude "${join(dir, "site.conf")}"\n`,
    );
    await run(apache, ["-t", "-f", join(dir, "httpd.conf")]);
    const server = spawn(apache, ["-X", "-f", join(dir, "httpd.conf")], { stdio: "ignore" });
    try {
      await ready(`http://127.0.0.1:${port}/`);
      await check(`http://127.0.0.1:${port}`, { hidden });
    } finally {
      server.kill();
    }
  });
}

test("configure-web applies the sample settings file from outside the web root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "a2o-configure-"));
  const root = await site(dir);
  await run("node", [here("../../scripts/configure-web.mjs"), root, "--config", here("any2orca.json")]);
  assert.match(await readFile(join(root, "index.html"), "utf-8"), /<html lang="en" data-hide="beyond,faq"/);
});
