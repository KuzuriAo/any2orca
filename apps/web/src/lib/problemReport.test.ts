// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorForReport, WEB_APP_NAME, webProblemReport } from "./problemReport";

describe("errorForReport", () => {
  it("keeps a library error's code and nothing of its message", () => {
    assert.deepEqual(errorForReport({ code: "invalid_file", message: 'holds "secret.svg" twice' }), { name: "Any2orcaError", code: "invalid_file" });
  });

  it("keeps only the kind of any other error", () => {
    assert.deepEqual(errorForReport(new TypeError("secret detail")), { name: "TypeError" });
    assert.deepEqual(errorForReport("just a string"), { name: "" });
    assert.deepEqual(errorForReport(null), { name: "" });
  });
});

describe("webProblemReport", () => {
  it("names the page as the app and gives the error's code and step, never its message", () => {
    const text = webProblemReport({ error: { code: "too_large", message: "my-private-file.3mf is too large" }, stage: "opening" });
    const lines = text.split("\n");
    assert.equal(lines[0], "any2orca problem report");
    assert.ok(lines.includes(`App: ${WEB_APP_NAME}`));
    assert.ok(lines.includes("Result: error too_large at opening"));
    assert.ok(!text.includes("my-private-file"));
    assert.ok(lines.some((line) => line.startsWith("Ran on: ")));
  });

  it("says an error outside the library's own was unexpected", () => {
    const text = webProblemReport({ error: new RangeError("secret"), stage: "merging" });
    assert.ok(text.includes("Result: error unexpected (RangeError) at merging"));
    assert.ok(!text.includes("secret"));
  });
});
