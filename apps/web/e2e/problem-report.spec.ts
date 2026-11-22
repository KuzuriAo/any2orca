// SPDX-License-Identifier: AGPL-3.0-or-later
// The "Copy report" buttons on the result card and the error banner: a text summary for a bug report, copied only
// when asked for, with nothing of the file's name in it and no request made.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, waitForAnimations } from "./helpers";

const sevenPlates = readFileSync(
  fileURLToPath(new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url)),
);

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

const clipboard = (page: import("@playwright/test").Page) => page.evaluate(() => navigator.clipboard.readText());

test("the result card's Copy report puts a report on the clipboard, with no file name in it and no request made", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "reading the clipboard back needs Chromium's permission");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openProject(page, "my-private-model-name.3mf", sevenPlates);
  await convertAndWait(page);

  const button = page.getByTestId("copy-report-result");
  await expect(button).toBeVisible();
  await expect(button).toHaveText("Copy report");

  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
  await button.click();
  await expect(page.getByTestId("copy-report-result-status")).toHaveText("Copied. Paste it into the bug report.");

  const text = await clipboard(page);
  const lines = text.split("\n");
  expect(lines[0]).toBe("any2orca problem report");
  expect(lines).toContain("App: any2orca web app");
  expect(lines.some((l) => /^Ran on: (Chrome|Edge|a browser)/.test(l))).toBe(true);
  expect(lines.some((l) => /^Profile data: \d+\.\d+\.\d+, for Snapmaker Orca \d/.test(l))).toBe(true);
  expect(lines).toContain("Project: 7 plates; 18 objects; 6 filaments; 1.1 MB unpacked; nozzle 0.4 mm; layer height 0.2 mm");
  expect(lines.some((l) => l.startsWith("Options: nozzle 0.4; "))).toBe(true);
  expect(lines.some((l) => l.startsWith("Result: converted with snapmaker-u1-0.4-standard"))).toBe(true);
  expect(lines.some((l) => l.startsWith("  [plate-filaments] Plate 6 needs 5 filaments at the same height"))).toBe(true);
  expect(text).not.toContain("my-private-model-name");
  expect(text).not.toContain(".3mf");
  // Copying asks nothing of the network beyond, at most, the report's own script from this site.
  expect(requests.filter((r) => !r.startsWith("GET ") || !new URL(r.slice(4)).pathname.startsWith("/assets/"))).toEqual([]);
});

test("the error banner's Copy report gives the error's code and step, not the file's name", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "reading the clipboard back needs Chromium's permission");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("file-input").setInputFiles(file("broken-private-name.3mf", Buffer.from("not a zip at all")));
  await expect(page.getByTestId("status-error")).toBeVisible();

  const button = page.getByTestId("copy-report-error");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId("copy-report-error-status")).toHaveText("Copied. Paste it into the bug report.");
  const text = await clipboard(page);
  expect(text.split("\n")).toContain("Result: error invalid_file at opening");
  expect(text).toContain("App: any2orca web app");
  expect(text).not.toContain("broken-private-name");
});

test("when the clipboard can't be written, the report is shown to select by hand", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    delete (window.Navigator.prototype as unknown as { clipboard?: unknown }).clipboard;
    document.execCommand = () => false;
  });
  await page.goto("/");
  await openProject(page, "demo-model.3mf", demoModel);
  await convertAndWait(page);
  await page.getByTestId("copy-report-result").click();
  await expect(page.getByTestId("copy-report-result-status")).toHaveText("Couldn't copy. Select the text below instead.");
  const shown = page.getByTestId("copy-report-result-text");
  await expect(shown).toBeVisible();
  expect(await shown.inputValue()).toMatch(/^any2orca problem report\n[\s\S]*Result: converted with /);
});

test("a new conversion replaces the report, and a new file clears it", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "reading the clipboard back needs Chromium's permission");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openProject(page, "demo-model.3mf", demoModel);
  await expect(page.getByTestId("copy-report-result")).toHaveCount(0);
  await convertAndWait(page);
  await page.getByTestId("copy-report-result").click();
  const first = await clipboard(page);
  expect(first).toContain("3 filaments");

  await openProject(page, "seven-plates.3mf", sevenPlates);
  await expect(page.getByTestId("copy-report-result")).toHaveCount(0);
  await convertAndWait(page);
  await page.getByTestId("copy-report-result").click();
  await expect(page.getByTestId("copy-report-result-status")).toHaveText("Copied. Paste it into the bug report.");
  expect(await clipboard(page)).toContain("6 filaments");
});

test("the result card with its report row, and the error banner with its button, have no accessibility violations @appearance", async ({ page }) => {
  await openProject(page, "demo-model.3mf", demoModel);
  await convertAndWait(page);
  await expect(page.getByTestId("copy-report-result")).toBeVisible();
  await waitForAnimations(page);
  expect((await new AxeBuilder({ page }).include(".complete-wrapper").analyze()).violations).toEqual([]);

  await page.getByTestId("file-input").setInputFiles(file("broken.3mf", Buffer.from("not a zip at all")));
  await expect(page.getByTestId("copy-report-error")).toBeVisible();
  await waitForAnimations(page);
  expect((await new AxeBuilder({ page }).include('[data-testid="status-error"]').analyze()).violations).toEqual([]);
});

test("each converted file in the batch view offers its own Copy report button with no file name", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "reading the clipboard back needs Chromium's permission");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.getByTestId("file-input").setInputFiles([
    file("secret-batch-one.3mf", demoModel),
    file("secret-batch-two.3mf", sevenPlates),
  ]);
  await expect(page.getByRole("button", { name: /Convert All/i })).toBeVisible();
  await page.getByRole("button", { name: /Convert All/i }).click();
  await expect(page.getByTestId("download-batch-zip")).toBeVisible({ timeout: 30_000 });

  // Ensure the first batch row is expanded and copy its report
  const firstExpandBtn = page.locator(".card-expand-btn").first();
  if ((await firstExpandBtn.getAttribute("aria-expanded")) !== "true") {
    await firstExpandBtn.click();
  }
  const copyBtn = page.getByTestId("batch-copy-report-result-0");
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(page.getByTestId("batch-copy-report-result-0-status")).toHaveText("Copied. Paste it into the bug report.");

  const text = await clipboard(page);
  expect(text).toMatch(/^any2orca problem report\n/);
  expect(text).toContain("App: any2orca web app");
  expect(text).toContain("Result: converted with ");
  expect(text).not.toContain("secret-batch-one");
  expect(text).not.toContain("secret-batch-two");
});
