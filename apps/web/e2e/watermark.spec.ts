// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { openProject, convertAndWait, removeSavePicker } from "./helpers";

test("bed preview renders neutral text watermark and no drawn logo paths", async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
  await openProject(page);

  // Pre-conversion (Bambu source): renders text and no drawn logo paths
  const watermarkText = page.getByTestId("bed-watermark-text");
  await expect(watermarkText).toBeVisible();
  await expect(watermarkText).toHaveText("Bambu Lab");

  // No vendor logo paths
  await expect(page.locator(".bed-svg path[d*='M -16 -20.5']")).toHaveCount(0);
  await expect(page.locator(".bed-svg path[d*='M 15.23']")).toHaveCount(0);
  await expect(page.locator(".bed-svg polygon")).toHaveCount(0);
  await expect(page.locator(".bed-svg path[d*='M937.97']")).toHaveCount(0);

  // Post-conversion: renders Snapmaker text and no drawn logo paths
  await convertAndWait(page);
  await expect(watermarkText).toHaveText("Snapmaker");
  await expect(page.locator(".bed-svg path[d*='M937.97']")).toHaveCount(0);
});
