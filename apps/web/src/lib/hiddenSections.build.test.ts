// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("VITE_HIDE_SECTIONS build-time behavior", () => {
  it("rejects unknown section names during build with exact error message", () => {
    let failed = false;
    let output = "";
    try {
      execSync("npx vite build", {
        cwd: process.cwd(),
        env: { ...process.env, VITE_HIDE_SECTIONS: "beyond,unknown-foo" },
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (err: unknown) {
      failed = true;
      const errorObj = err as { stdout?: string; stderr?: string };
      output = `${errorObj.stdout ?? ""} ${errorObj.stderr ?? ""}`;
    }

    assert.equal(failed, true, "build should fail when unknown section name is passed");
    assert.match(
      output,
      /Invalid VITE_HIDE_SECTIONS: "unknown-foo"\. Unknown section name\. Allowed section names are: beyond, faq, integrate, support\./
    );
  });

  it("build with VITE_HIDE_SECTIONS=beyond,faq writes data-hide=\"beyond,faq\" into dist/index.html", () => {
    const tempOutDir = mkdtempSync(join(tmpdir(), "a2o-hide-test-"));
    try {
      execSync(`npx vite build --outDir ${tempOutDir}`, {
        cwd: process.cwd(),
        env: { ...process.env, VITE_HIDE_SECTIONS: "beyond,faq" },
        stdio: "pipe",
        encoding: "utf8",
      });

      const distHtml = readFileSync(join(tempOutDir, "index.html"), "utf8");
      // Verify data-hide attribute is written into <html ...>
      assert.match(distHtml, /<html [^>]*data-hide="beyond,faq"[^>]*>/);

      // Verify FAQ is stripped from crawler fallback
      assert.ok(!distHtml.includes("How does local in-browser conversion protect my 3D models and IP?"));

      const assetsDir = join(tempOutDir, "assets");
      const files = readdirSync(assetsDir);
      const jsFiles = files.filter((f) => f.endsWith(".js") && f.startsWith("index-"));
      assert.ok(jsFiles.length > 0, "should generate index bundle");

      const bundleContent = jsFiles
        .map((f) => readFileSync(join(assetsDir, f), "utf8"))
        .join("\n");

      // Verify source code GitHub link is preserved in bundle
      assert.equal(
        bundleContent.includes("https://github.com/KuzuriAo/any2orca"),
        true
      );
    } finally {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  it("default build with unset VITE_HIDE_SECTIONS leaves dist/index.html without data-hide attribute and unchanged", () => {
    const tempOutDir = mkdtempSync(join(tmpdir(), "a2o-default-build-"));
    try {
      execSync(`npx vite build --outDir ${tempOutDir}`, {
        cwd: process.cwd(),
        env: { ...process.env, VITE_HIDE_SECTIONS: undefined },
        stdio: "pipe",
        encoding: "utf8",
      });

      const distHtml = readFileSync(join(tempOutDir, "index.html"), "utf8");
      assert.equal(distHtml.includes("data-hide"), false, "default build should not have data-hide attribute");
      assert.match(distHtml, /<html lang="en"/);
    } finally {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });
});
