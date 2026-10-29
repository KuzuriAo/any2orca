// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, entryNames, layerHeightOf, openProject, removeSavePicker, SCHEMES, VIEWPORTS } from "./helpers";

// One conversion per skin x light/dark x desktop/tablet/phone.
for (const scheme of SCHEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${scheme} ${viewportName}`, () => {
      test.use({ colorScheme: scheme, viewport, acceptDownloads: true });

      test("opens in the system theme, converts, and downloads on request", async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        let downloads = 0;
        page.on("download", () => downloads++);
        await removeSavePicker(page);

        await page.goto("/");
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(scheme);
        expect(await page.evaluate(() => document.documentElement.dataset.brand)).toBe(testInfo.project.name);

        await openProject(page);
        await convertAndWait(page);
        expect(downloads, "converting must not start a download by itself").toBe(0);

        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
        const output = new Uint8Array(readFileSync(await download.path()));
        expect(download.suggestedFilename()).toBe("demo-model_U1.3mf");
        expect(entryNames(output)).toContain("Metadata/any2orca.json");
        expect(layerHeightOf(output)).toBe(layerHeightOf(new Uint8Array(demoModel)));

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    });
  }
}

test.describe("saved theme", () => {
  test.use({ colorScheme: "light" });

  test("a saved theme choice wins over the system setting", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await page.getByTestId("theme-toggle").click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });
});

test("profile catalog load failure shows error banner and disables Convert", async ({ page }) => {
  await page.route("**/profiles/index.json", (route) => route.abort());
  await page.goto("/");
  const banner = page.locator(".alert-box.alert-error");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("The printer profiles couldn't be loaded. Check your connection, or, on your own copy, that /profiles/ is served.");
  await openProject(page);
  const convertBtn = page.getByTestId("convert-button");
  await expect(convertBtn).toBeDisabled();
});
