// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";
import { entriesOf, expectOnlyOwnFiles, MINIMAL_UI, sampleModel, watchRequests } from "./helpers";

test("minimal-ui: inspect, convert and download, with nothing leaving the page", async ({ page }) => {
  const requests = watchRequests(page);
  await page.goto(MINIMAL_UI);

  await page.setInputFiles("#file", { name: "desk-set.3mf", mimeType: "application/octet-stream", buffer: sampleModel });
  await expect(page.locator("#project")).toBeVisible();
  await expect(page.locator("#facts")).toContainText("Plates");
  await expect(page.locator("#profile option")).not.toHaveCount(0);

  await page.click("#convert");
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#download")).toHaveText("Download desk-set_U1.3mf");

  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  expect(download.suggestedFilename()).toBe("desk-set_U1.3mf");
  expect(Object.keys(entriesOf((await download.path())!))).toContain("Metadata/any2orca.json");

  expectOnlyOwnFiles(requests, MINIMAL_UI);
});

test("minimal-ui: a file that isn't a 3MF gets a clear message", async ({ page }) => {
  await page.goto(MINIMAL_UI);
  await page.setInputFiles("#file", { name: "broken.3mf", mimeType: "application/octet-stream", buffer: Buffer.from("not a zip") });
  await expect(page.locator("#status")).toContainText("can't be read as a 3MF project");
  await expect(page.locator("#project")).toBeHidden();
});
