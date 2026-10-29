// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { convertAndWait, entryNames, openProject, removeSavePicker } from "./helpers";

const LIBRARY_VERSION = /VERSION = "([^"]+)"/.exec(
  readFileSync(fileURLToPath(new URL("../../../packages/core/src/version.ts", import.meta.url)), "utf8"),
)![1];

test("the footer shows the library version, so bug reports can name it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("footer")).toContainText(`v${LIBRARY_VERSION}`);
});

test("conversion runs in a Web Worker, not on the page's main thread", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await removeSavePicker(page);
  await page.goto("/");
  await openProject(page);
  await convertAndWait(page);
  expect(workers.length, "a worker was started").toBeGreaterThan(0);
  expect(workers.some((url) => /worker/i.test(url))).toBe(true);
});

test("copying from the Integrate panel makes no network request", async ({ page, context }, testInfo) => {
  if (testInfo.project.use.browserName === "chromium" || !testInfo.project.use.browserName) {
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    } catch {
      // Best-effort in headless browsers
    }
  }
  await page.goto("/");
  await page.getByRole("button", { name: /integrate/i }).first().click();
  const copyButtons = page.getByRole("button", { name: /copy/i });
  await expect(copyButtons.first()).toBeVisible();

  const requests: { method: string; url: string }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
  const count = await copyButtons.count();
  for (let i = 0; i < count; i++) {
    if (await copyButtons.nth(i).isVisible()) await copyButtons.nth(i).click().catch(() => {});
  }
  await page.waitForTimeout(500);
  expect(requests.filter((r) => r.method !== "GET"), "no POST or other write requests").toEqual([]);
  expect(requests.filter((r) => /ui-event|\/v1\//.test(r.url)), "no unexpected remote API calls").toEqual([]);
});

// Needs a big real project, so it only runs when you point it at one:
//   LARGE_3MF=/path/to/50MB-plus.3mf npm run test:e2e -w @any2orca/web -- e2e/launch.spec.ts
test("a 50 MB+ project converts without freezing the page", async ({ page }) => {
  const file = process.env.LARGE_3MF;
  test.skip(!file, "set LARGE_3MF to a .3mf over 50 MB to run this");
  test.setTimeout(300_000);
  expect(statSync(file!).size).toBeGreaterThan(50 * 1024 * 1024);
  await removeSavePicker(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  // A 100 ms heartbeat on the page's main thread: if conversion blocked it, ticks would be missing.
  await page.evaluate(() => {
    (window as unknown as { __ticks: number }).__ticks = 0;
    setInterval(() => (window as unknown as { __ticks: number }).__ticks++, 100);
  });
  await page.getByTestId("file-input").setInputFiles(file!);
  await page.getByTestId("convert-button").waitFor({ timeout: 120_000 });
  const before = await page.evaluate(() => (window as unknown as { __ticks: number }).__ticks);
  const started = Date.now();
  await page.getByTestId("convert-button").click();
  await page.getByTestId("download-button").waitFor({ timeout: 240_000 });
  const elapsed = Date.now() - started;
  const ticks = (await page.evaluate(() => (window as unknown as { __ticks: number }).__ticks)) - before;
  const expected = elapsed / 100;
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  const output = new Uint8Array(readFileSync(await download.path()));
  expect(entryNames(output)).toContain("Metadata/any2orca.json");
  expect(ticks, "the main thread kept running while the worker converted").toBeGreaterThan(expected * 0.6);
  expect(errors).toEqual([]);
});
