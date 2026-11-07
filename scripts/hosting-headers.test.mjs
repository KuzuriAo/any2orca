// SPDX-License-Identifier: MIT
// The hosted site's security headers (hosting/any2orca.com/_headers): the file's shape, which the deploy
// relies on, and the policy, so a change to what the site allows is deliberate and docs/privacy.md stays true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf-8");

/** The headers in the file's one `/*` block, by name; throws on anything else. */
function parseHeadersFile(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.startsWith("#"));
  assert.equal(lines[0], "/*", "the file has one block, for every path");
  const headers = new Map();
  for (const line of lines.slice(1)) {
    const match = /^ {2}([A-Za-z-]+): (\S.*)$/.exec(line);
    assert.ok(match, `a header line, indented two spaces: ${JSON.stringify(line)}`);
    assert.ok(!headers.has(match[1]), `${match[1]} appears once`);
    headers.set(match[1], match[2]);
  }
  return headers;
}

/** A policy's directives, by name. */
function directives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0])
      .map(([name, ...sources]) => [name, sources.join(" ")]),
  );
}

const hosted = parseHeadersFile(read("hosting", "any2orca.com", "_headers"));
const policy = directives(hosted.get("Content-Security-Policy") ?? "");

test("the hosted site sends every security header", () => {
  assert.deepEqual([...hosted.keys()].sort(), [
    "Content-Security-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
  ]);
  assert.equal(hosted.get("X-Frame-Options"), "DENY");
  assert.equal(hosted.get("X-Content-Type-Options"), "nosniff");
  assert.match(hosted.get("Strict-Transport-Security"), /^max-age=31536000; includeSubDomains$/);
  assert.equal(hosted.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=(), payment=()");
});

test("the hosted policy allows what docs/privacy.md says, and no more", () => {
  assert.equal(policy.get("script-src"), "'self' https://static.cloudflareinsights.com", "scripts: the site and Cloudflare's analytics only");
  assert.equal(policy.get("connect-src"), "'self' https:", "fetches: any https host, for partner hand-offs");
  assert.equal(policy.get("frame-ancestors"), "'none'", "no other site can frame the page");
  assert.equal(policy.get("object-src"), "'none'", "no plugins");
  assert.equal(policy.get("form-action"), "'none'", "no form posts");
  assert.ok(!(policy.get("script-src") ?? "").includes("unsafe-inline"), "no inline scripts");
});

test("the hosted policy is the self-hosting one, apart from the two documented differences", () => {
  const doc = read("docs", "run-the-web-app.md");
  const selfHosting = /^default-src 'self';.*$/m.exec(doc)?.[0];
  assert.ok(selfHosting, "docs/run-the-web-app.md gives a policy");
  const strict = directives(selfHosting);
  assert.equal(strict.get("script-src"), "'self'");
  assert.equal(strict.get("connect-src"), "'self'");
  const without = (map) => [...map].filter(([name]) => name !== "script-src" && name !== "connect-src");
  assert.deepEqual(without(policy), without(strict));
});
