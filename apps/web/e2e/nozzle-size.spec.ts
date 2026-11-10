// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { convertAndWait, openProject, removeSavePicker, settingsOf, stampOf } from "./helpers";

const selector = (page: Page) => page.getByTestId("nozzle-size-select");

async function downloaded(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  return new Uint8Array(readFileSync(await download.path()));
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test("defaults to 0.4 mm with help text in (?) beside it", async ({ page }) => {
  await page.goto("/");
  await openProject(page);

  await expect(selector(page)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Your U1's nozzle size" })).toHaveValue("0.4");
  await expect(selector(page).locator("option")).toHaveText([
    "0.2 mm",
    "0.4 mm",
    "0.6 mm",
    "0.8 mm",
    "Match the file",
  ]);

  await page.getByTestId("helptip-btn-nozzle-size").click();
  const popover = page.locator("#helptip-popover-nozzle-size");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText(
    "The converted file is made for this nozzle size: its profile, layer heights and filament values are the U1's for that size, and the file records it. The U1's stock nozzles are 0.4 mm. Snapmaker Orca uses one size for all four toolheads. A project made for another size is converted anyway and you're told; 'Match the file' converts for the size the creator used.",
  );
});

test("choosing 0.6 converts the 0.4 demo model for 0.6 with a note, persists across reload, and Match the file converts for 0.4 with no note", async ({ page }) => {
  await page.goto("/");
  await openProject(page);

  await selector(page).selectOption("0.6");
  await expect(page.getByTestId("profile-picker")).toHaveValue(/snapmaker-u1-0\.6-/);

  await convertAndWait(page);
  await expect(page.getByTestId("result-profile-line")).toContainText("for 0.6 mm nozzles");
  const warningBox = page.getByTestId("status-warning");
  await expect(warningBox).toBeVisible();
  await expect(warningBox).toContainText("converted for your 0.6 mm nozzles");

  const output06 = await downloaded(page);
  expect(settingsOf(output06).print_settings_id).toContain("0.6 nozzle");
  expect(stampOf(output06)?.options.nozzle).toEqual({ choice: "0.6", size: "0.6" });

  // Reload: choice is still 0.6
  await page.reload();
  await openProject(page);
  await expect(selector(page)).toHaveValue("0.6");

  // Match the file: converts demo (0.4) for 0.4 with no nozzle note
  await selector(page).selectOption("match");
  await expect(page.getByTestId("profile-picker")).toHaveValue("snapmaker-u1-0.4-standard");

  await convertAndWait(page);
  await expect(page.getByTestId("result-profile-line")).toContainText("for 0.4 mm nozzles");
  await expect(page.getByTestId("status-warning")).toHaveCount(0);
  const outputMatch = await downloaded(page);
  expect(stampOf(outputMatch)?.options.nozzle).toEqual({ choice: "match", size: "0.4" });
});

test("converting bambu-studio-2.9.1.70-h3c-mixed.3mf shows mixed nozzle note for 0.4 mm nozzles", async ({ page }) => {
  const mixedFixture = readFileSync(
    new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-h3c-mixed.3mf", import.meta.url),
  );
  await page.goto("/");
  await openProject(page, "bambu-studio-2.9.1.70-h3c-mixed.3mf", mixedFixture);

  await convertAndWait(page);
  const warningBox = page.getByTestId("status-warning");
  await expect(warningBox).toBeVisible();
  await expect(warningBox).toContainText(
    "uses 0.2 and 0.4 mm nozzles (filament 1 on 0.2 mm); converted for your 0.4 mm nozzles",
  );
});

test("a 0.4 mm preset with 0.6 mm nozzle chosen shows the invalid_preset sentence", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "any2orca_presets",
      JSON.stringify({
        format: "any2orca-presets",
        version: 1,
        presets: [
          {
            name: "Four walls",
            base: "snapmaker-u1-0.4-standard",
            baseInferred: false,
            catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
            changes: { wall_loops: "4" },
            created: "2026-10-31",
          },
        ],
      }),
    );
  });
  await page.goto("/");
  await openProject(page);

  await selector(page).selectOption("0.6");
  await page.getByTestId("preset-picker").selectOption("Four walls");
  await page.getByTestId("convert-button").click();

  const errorBox = page.getByTestId("status-error");
  await expect(errorBox).toBeVisible();
  await expect(errorBox).toContainText("This preset was made for 0.4 mm nozzles");
});

test("FAQ includes the nozzle size question and names 0.4 mm and 1.75 mm in its answer", async ({ page }) => {
  await page.goto("/");
  const faqButton = page.locator("#faq").getByRole("button", {
    name: /Which nozzle size is my file converted for, and why did some filaments change\?/,
  });
  await expect(faqButton).toBeVisible();
  await faqButton.click();
  const region = page.locator("#faq-answer-nozzle-size");
  await expect(region).toBeVisible();
  await expect(region).toContainText("0.4 mm");
  await expect(region).toContainText("1.75 mm");
});
