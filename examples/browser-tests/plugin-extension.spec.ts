// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";
import { entriesOf, sampleModel } from "./helpers";
import { withoutZodEvalProbe } from "../plugin-extension/withoutZodEvalProbe";

const extensionPath = fileURLToPath(new URL("../plugin-extension/dist", import.meta.url));

test("plugin-extension: the manifest asks for no permissions", () => {
  const manifest = JSON.parse(readFileSync(join(extensionPath, "manifest.json"), "utf-8")) as Record<string, unknown>;
  for (const key of ["permissions", "host_permissions", "optional_permissions", "optional_host_permissions", "content_scripts"]) {
    expect(manifest, key).not.toHaveProperty(key);
  }
});

// zod's check for whether it may compile parsers (the Function constructor) is what store linters flag.
const zodUtil = fileURLToPath(new URL("../../node_modules/zod/v4/core/util.js", import.meta.url));
const rewrite = (code: string, id: string) => {
  const hook = withoutZodEvalProbe().transform as (code: string, id: string) => { code: string } | null;
  return hook(code, id);
};

test("plugin-extension: the build plugin replaces zod's eval check, and only that", () => {
  const original = readFileSync(zodUtil, "utf-8");
  const result = rewrite(original, zodUtil);
  expect(original).toContain('new F("")');
  expect(result?.code).not.toContain('new F("")');
  expect(result?.code.length).toBeLessThan(original.length);
  expect(rewrite(original, "/project/src/convert.ts")).toBeNull();
  // If zod's code changes, the build stops instead of shipping the check.
  expect(() => rewrite(original.replace('new F("")', 'new F("x")'), zodUtil)).toThrow(/zod's eval check has changed/);
});

test("plugin-extension: the built worker holds no eval check", () => {
  const assets = join(extensionPath, "assets");
  const workers = readdirSync(assets).filter((name) => name.startsWith("worker-entry") && name.endsWith(".js"));
  expect(workers).toHaveLength(1);
  const code = readFileSync(join(assets, workers[0]!), "utf-8");
  // The minified check, as Vite writes it: Function(``) or new X("") inside a try.
  expect(code).not.toMatch(/Function\(\s*(``|""|'')\s*\)/);
  expect(code).not.toMatch(/new [A-Za-z_$][\w$]*\(\s*(``|""|'')\s*\)/);
});

test("plugin-extension: converts a file inside the extension, offline", async () => {
  // Extensions need a persistent context and the full (new headless) Chromium.
  const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "a2o-ext-")), {
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    acceptDownloads: true,
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;

    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${extensionOrigin}/convert.html`);

    await page.setInputFiles("#file", { name: "desk-set.3mf", mimeType: "application/octet-stream", buffer: sampleModel });
    const link = page.locator("#results a").first();
    await expect(link).toHaveText("Download desk-set_U1.3mf");

    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(Object.keys(entriesOf((await download.path())!))).toContain("Metadata/any2orca.json");

    // Every request was to the extension's own files: nothing touched the network.
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      if (url.startsWith("blob:") || url.startsWith("data:")) continue;
      expect(url.startsWith(`${extensionOrigin}/`), url).toBe(true);
    }
  } finally {
    await context.close();
  }
});
