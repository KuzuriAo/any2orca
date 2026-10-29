// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dir = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(dir).filter((f) => f.endsWith(".yml")).map((f) => [f, readFileSync(new URL(f, dir), "utf-8")]);

describe("GitHub workflows", () => {
  for (const [name, text] of workflows) {
    it(`${name} pins every action to a full commit SHA with its version noted`, () => {
      for (const line of text.split("\n").filter((l) => /\buses:/.test(l))) {
        assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, line);
      }
    });
    it(`${name} grants no write permission at the workflow level`, () => {
      const top = text.split(/^jobs:/m)[0];
      assert.doesNotMatch(top, /:\s*write/);
    });
  }

  it("publish.yml publishes only tags on main, and the core only after its profiles version", () => {
    const publish = Object.fromEntries(workflows)["publish.yml"];
    assert.match(publish, /merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
    assert.match(publish, /npm view "any2orca-profiles@\$DEP" version/);
    assert.ok(publish.indexOf("npm view \"any2orca-profiles") < publish.indexOf("npm publish"));
  });

  it("publish.yml attests the web tarball and SHA256SUMS before attaching them to the release", () => {
    const publish = Object.fromEntries(workflows)["publish.yml"];
    const job = publish.split(/^jobs:/m)[1];
    assert.match(job, /^\s+attestations: write$/m, "the publish job can write attestations");
    const attest = publish.indexOf("actions/attest-build-provenance@");
    assert.ok(attest > 0, "an attestation step");
    const step = publish.slice(attest, publish.indexOf("\n      - ", attest));
    assert.match(step, /any2orca-web-\$\{\{ env\.VERSION \}\}\.tgz/);
    assert.match(step, /SHA256SUMS/);
    assert.ok(attest < publish.indexOf("gh release create"), "attested before the release is created");
  });
});
