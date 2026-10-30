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

  it("publish.yml releases on push to main only, after the tests and the release plan, profiles before the core", () => {
    const publish = Object.fromEntries(workflows)["publish.yml"];
    const on = publish.split(/^permissions:/m)[0];
    assert.match(on, /^\s+push:\n\s+branches: \[main\]$/m, "runs on pushes to main");
    assert.doesNotMatch(on, /tags:/, "no longer runs on tags");
    assert.match(publish, /merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/, "a real release checks the commit is on main");
    const at = (text) => {
      const i = publish.indexOf(text);
      assert.ok(i > 0, `has: ${text}`);
      return i;
    };
    const job = publish.slice(at("\n  publish:"));
    assert.ok(job.indexOf("npm test") < job.indexOf("node scripts/release-plan.mjs --notes-dir"), "tests before the final plan");
    assert.ok(job.indexOf("release-plan.mjs --notes-dir") < job.indexOf("npm publish"), "planned before anything is published");
    assert.ok(job.indexOf("npm publish -w any2orca-profiles") < job.indexOf("npm publish -w any2orca "), "profiles before the core");
  });

  it("publish.yml publishes nothing for real in a dry run", () => {
    const publish = Object.fromEntries(workflows)["publish.yml"];
    const steps = publish.split(/\n      - /);
    const publishSteps = steps.filter((s) => /^name: Publish any2orca/.test(s));
    assert.equal(publishSteps.length, 2, "one publish step per package");
    for (const step of publishSteps) {
      assert.match(step, /if \[ "\$DRY_RUN" = true \]; then npm publish [^;]*--dry-run;/, step.split("\n")[0]);
    }
    for (const step of steps.filter((s) => /gh release create|attest-build-provenance/.test(s))) {
      assert.match(step, /env\.DRY_RUN != 'true'/, step.split("\n")[0]);
    }
  });

  it("publish.yml attests the web tarball and SHA256SUMS before attaching them to the core's release", () => {
    const publish = Object.fromEntries(workflows)["publish.yml"];
    const job = publish.split(/^jobs:/m)[1];
    assert.match(job, /^\s+attestations: write$/m, "the publish job can write attestations");
    const attest = publish.indexOf("actions/attest-build-provenance@");
    assert.ok(attest > 0, "an attestation step");
    const step = publish.slice(attest, publish.indexOf("\n      - ", attest));
    assert.match(step, /any2orca-web-\$\{\{ env\.CORE_VERSION \}\}\.tgz/);
    assert.match(step, /SHA256SUMS/);
    assert.ok(attest < publish.indexOf('gh release create "$TAG" --target "$GITHUB_SHA" $FLAGS --title "any2orca $CORE_VERSION"'), "attested before the core release is created");
  });
});
