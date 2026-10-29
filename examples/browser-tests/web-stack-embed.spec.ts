// SPDX-License-Identifier: MIT
import { expect, test } from "@playwright/test";
import { entriesOf, expectOnlyOwnFiles, sampleModel, watchRequests, WEB_STACK_EMBED } from "./helpers";

test("web-stack-embed: the added button converts a file in place", async ({ page }) => {
  const requests = watchRequests(page);
  await page.goto(WEB_STACK_EMBED);

  await page.setInputFiles("#convert-input", { name: "desk-set.3mf", mimeType: "application/octet-stream", buffer: sampleModel });
  const link = page.locator("#convert-results a").first();
  await expect(link).toHaveText("Download desk-set_U1.3mf");

  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(Object.keys(entriesOf((await download.path())!))).toContain("Metadata/any2orca.json");

  expectOnlyOwnFiles(requests, WEB_STACK_EMBED);
});
