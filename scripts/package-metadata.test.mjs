// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf-8");
const OVERBROAD = /any slicer|Orca-family printer|each target printer/i;

describe("published package descriptions", () => {
  for (const path of ["packages/core/package.json", "packages/profiles/package.json"]) {
    it(`${path} names the Snapmaker U1 and promises no other sources or targets`, () => {
      const { description } = JSON.parse(read(path));
      assert.match(description, /Snapmaker U1/);
      assert.doesNotMatch(description, OVERBROAD);
    });
  }

  it("the core's module doc says the same", () => {
    const doc = read("packages/core/src/index.ts").split("*/")[0];
    assert.match(doc, /Snapmaker U1/);
    assert.doesNotMatch(doc, /Orca-family printer formats/);
  });
});

describe("published READMEs", () => {
  // npm shows each package's README, and the core's is also the API reference's front page, which copies a
  // relatively linked file as-is (so a .md link opens raw text). Absolute links work in all three places.
  for (const path of ["packages/core/README.md", "packages/profiles/README.md"]) {
    it(`${path} links with absolute URLs or in-page anchors only`, () => {
      const relative = [...read(path).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((target) => !/^(https?:|mailto:|#)/.test(target));
      assert.deepEqual(relative, []);
    });
  }
});
