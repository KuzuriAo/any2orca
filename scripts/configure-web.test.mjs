// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ALLOWED_HIDE_SECTIONS, applyHide, parseHide, readConfig } from "./configure-web.mjs";

const SCRIPT = fileURLToPath(new URL("./configure-web.mjs", import.meta.url));
const PAGE = '<!doctype html>\n<html lang="en">\n<head><title>t</title></head>\n<body><div id="app"></div></body>\n</html>\n';
let dir;
let site;

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf-8" });
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), "a2o-configure-"));
});
after(() => rmSync(dir, { recursive: true, force: true }));

function freshSite() {
  site = mkdtempSync(join(dir, "site-"));
  writeFileSync(join(site, "index.html"), PAGE);
  return site;
}
const html = () => readFileSync(join(site, "index.html"), "utf-8");

describe("applyHide", () => {
  it("adds the attribute to <html> and changes nothing else", () => {
    const out = applyHide(PAGE, ["beyond", "faq"]);
    assert.equal(out, PAGE.replace('<html lang="en">', '<html lang="en" data-hide="beyond,faq">'));
  });

  it("replaces an earlier value, and removes it when nothing is hidden", () => {
    const once = applyHide(PAGE, ["faq"]);
    assert.equal(applyHide(once, ["support"]), PAGE.replace('<html lang="en">', '<html lang="en" data-hide="support">'));
    assert.equal(applyHide(once, []), PAGE);
    assert.equal(applyHide(PAGE, []), PAGE);
  });

  it("is the same when run twice", () => {
    const once = applyHide(PAGE, ["beyond"]);
    assert.equal(applyHide(once, ["beyond"]), once);
  });

  it("refuses a page with no <html> tag", () => {
    assert.throws(() => applyHide("<div></div>", ["faq"]), /no <html> tag/);
  });
});

describe("parseHide and readConfig", () => {
  it("accepts the four names, any case, without repeats", () => {
    assert.deepEqual(parseHide([" Beyond", "FAQ", "faq"], "t"), ["beyond", "faq"]);
    assert.deepEqual(ALLOWED_HIDE_SECTIONS, ["beyond", "faq", "integrate", "support"]);
  });

  it("rejects anything else, including hostile values, naming the allowed ones", () => {
    for (const bad of [["nope"], ["beyond", '"><script>alert(1)</script>'], [5], ["source"], [""], "faq", { 0: "faq" }, Array.from({ length: 21 }, () => "faq")]) {
      assert.throws(() => parseHide(bad, "t"), /t: /, JSON.stringify(bad).slice(0, 40));
    }
    assert.throws(() => parseHide(["x"], "t"), /beyond, faq, integrate, support/);
  });

  it("reads a settings file and rejects other keys, other shapes and big files", () => {
    const file = join(dir, "ok.json");
    writeFileSync(file, '{ "hide": ["faq"] }');
    assert.deepEqual(readConfig(file), ["faq"]);
    writeFileSync(file, "{}");
    assert.deepEqual(readConfig(file), []);
    for (const [text, message] of [
      ['{ "hide": ["faq"], "other": 1 }', /isn't a setting/],
      ['{ "__proto__": {} }', /isn't a setting/],
      ["[]", /must be a JSON object/],
      ["not json", /isn't valid JSON/],
      [" ".repeat(5000), /larger than/],
    ]) {
      writeFileSync(file, text);
      assert.throws(() => readConfig(file), message, text.slice(0, 30));
    }
    assert.throws(() => readConfig(join(dir, "missing.json")), /No settings file/);
  });
});

describe("the command", () => {
  it("applies a settings file kept outside the web root", () => {
    freshSite();
    const config = join(dir, "private.json");
    writeFileSync(config, '{ "hide": ["beyond", "faq"] }');
    const result = run(site, "--config", config);
    assert.equal(result.status, 0, result.stderr);
    assert.match(html(), /<html lang="en" data-hide="beyond,faq">/);
    assert.match(result.stdout, /Hiding beyond, faq/);
  });

  it("refuses a settings file inside the web root, directly or through a link, and changes nothing", () => {
    freshSite();
    const inside = join(site, "any2orca.config.json");
    writeFileSync(inside, '{ "hide": ["faq"] }');
    for (const path of [inside]) {
      const result = run(site, "--config", path);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /anyone could download it/);
    }
    const outside = join(dir, "elsewhere.json");
    writeFileSync(outside, '{ "hide": ["faq"] }');
    mkdirSync(join(site, "sub"), { recursive: true });
    symlinkSync(outside, join(site, "sub", "link.json"));
    // A link from inside the root to a file outside is fine: the file itself isn't served from there.
    assert.equal(run(site, "--config", outside).status, 0);
    assert.equal(html().includes("data-hide"), true);
    freshSite();
    const linkDir = join(dir, "linkdir");
    symlinkSync(site, linkDir);
    writeFileSync(join(site, "c.json"), '{ "hide": ["faq"] }');
    assert.equal(run(site, "--config", join(linkDir, "c.json")).status, 1);
    assert.equal(html(), PAGE);
  });

  it("takes names on the command line, and --clear removes them", () => {
    freshSite();
    assert.equal(run(site, "--hide", "support").status, 0);
    assert.match(html(), /data-hide="support"/);
    assert.equal(run(site, "--clear").status, 0);
    assert.equal(html(), PAGE);
  });

  it("fails with a clear message, and leaves the page alone, on bad input", () => {
    freshSite();
    const cases = [
      [site, "--hide", "faq,sourcecode"],
      [site, "--config", join(dir, "nope.json")],
      [site],
      [site, "--hide", "faq", "--clear"],
      [site, "--hide"],
      [join(dir, "no-such-folder"), "--hide", "faq"],
      [site, "--bogus"],
    ];
    for (const args of cases) {
      const result = run(...args);
      assert.equal(result.status, 1, args.join(" "));
      assert.match(result.stderr, /^Error: /, args.join(" "));
    }
    assert.equal(html(), PAGE);
    const empty = mkdtempSync(join(dir, "empty-"));
    assert.match(run(empty, "--clear").stderr, /no index\.html/);
  });

  it("leaves no temporary file behind", () => {
    freshSite();
    run(site, "--hide", "faq");
    assert.deepEqual(
      execFileSync("ls", [site], { encoding: "utf-8" }).trim().split("\n"),
      ["index.html"],
    );
    assert.equal(existsSync(join(site, "index.html.tmp")), false);
  });
});

describe("the page's own list", () => {
  const module = fileURLToPath(new URL("../apps/web/src/lib/hiddenSections.ts", import.meta.url));
  it("matches the web app's list of names", { skip: !existsSync(module) && "apps/web/src/lib/hiddenSections.ts isn't in this checkout yet" }, () => {
    const names = /ALLOWED_HIDE_SECTIONS\s*=\s*\[([^\]]*)\]/.exec(readFileSync(module, "utf-8"))?.[1].match(/"([a-z]+)"/g)?.map((n) => n.slice(1, -1));
    assert.deepEqual(names, ALLOWED_HIDE_SECTIONS);
  });
});
