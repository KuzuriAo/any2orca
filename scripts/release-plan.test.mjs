// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRelease } from "./release-plan.mjs";

const changelog = (version) => `# pkg\n\n## ${version}\n\n### Fixes\n\n- Something.\n\n## 0.0.1\n\n- Older.\n`;
const profiles = (version, log = changelog(version)) => ({ name: "any2orca-profiles", dir: "packages/profiles", key: "profiles", version, changelog: log });
const core = (version, pinnedProfiles, log = changelog(version)) => ({ name: "any2orca", dir: "packages/core", key: "core", version, changelog: log, pinnedProfiles });
const onNpm = (...specs) => (name, version) => specs.includes(`${name}@${version}`);

describe("planRelease", () => {
  it("releases nothing when every version is already on npm", () => {
    const plan = planRelease([profiles("0.1.0"), core("0.2.0", "0.1.0")], onNpm("any2orca-profiles@0.1.0", "any2orca@0.2.0"));
    assert.deepEqual(plan, { publish: [], errors: [] });
  });

  it("releases only the core when only its version is new, with its changelog section as notes", () => {
    const { publish, errors } = planRelease([profiles("0.1.0"), core("0.2.0", "0.1.0")], onNpm("any2orca-profiles@0.1.0", "any2orca@0.1.0"));
    assert.deepEqual(errors, []);
    assert.deepEqual(publish.map((p) => p.tag), ["any2orca@0.2.0"]);
    assert.equal(publish[0].notes, "### Fixes\n\n- Something.");
  });

  it("releases profiles before the core when both are new, and accepts a pin on the profiles in the same release", () => {
    const { publish, errors } = planRelease([profiles("0.2.0"), core("0.3.0", "0.2.0")], onNpm("any2orca-profiles@0.1.0", "any2orca@0.2.0"));
    assert.deepEqual(errors, []);
    assert.deepEqual(publish.map((p) => p.tag), ["any2orca-profiles@0.2.0", "any2orca@0.3.0"]);
  });

  it("refuses the core when it pins a profiles version that is neither on npm nor in this release", () => {
    const { publish, errors } = planRelease([profiles("0.1.0"), core("0.2.0", "0.9.0")], onNpm("any2orca-profiles@0.1.0"));
    assert.deepEqual(publish, []);
    assert.match(errors[0], /pins any2orca-profiles 0\.9\.0, which is neither on npm nor in this release/);
  });

  it("refuses everything when a version to release has no changelog section", () => {
    const { publish, errors } = planRelease([profiles("0.2.0", changelog("0.1.0")), core("0.3.0", "0.2.0")], onNpm());
    assert.deepEqual(publish, []);
    assert.match(errors.join("\n"), /any2orca-profiles 0\.2\.0 has no section/);
  });

  it("refuses a version that isn't plain semver, so nothing odd reaches the workflow", () => {
    for (const bad of ["0.2", "v0.2.0", "0.2.0; rm -rf /", "0.2.0\nX=1", "01.2.0"]) {
      const { publish, errors } = planRelease([profiles("0.1.0"), core(bad, "0.1.0")], onNpm("any2orca-profiles@0.1.0"));
      assert.deepEqual(publish, [], bad);
      assert.match(errors[0], /isn't a plain semver version/, bad);
    }
  });

  it("allows a prerelease version", () => {
    const { publish } = planRelease([profiles("0.1.0"), core("0.3.0-beta.1", "0.1.0")], onNpm("any2orca-profiles@0.1.0"));
    assert.deepEqual(publish.map((p) => p.tag), ["any2orca@0.3.0-beta.1"]);
  });
});
