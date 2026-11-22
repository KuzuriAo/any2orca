// SPDX-License-Identifier: AGPL-3.0-or-later
// The plate view says which filaments the selected plate uses, and marks a plate that needs more at the same height
// than the U1 prints with. The project is the shared scene's seven-plate save: six filaments, a painted face on
// plate 3, and five objects on five filaments on plate 6.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, openProject, removeSavePicker, waitForAnimations } from "./helpers";

const sevenPlates = readFileSync(
  fileURLToPath(new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url)),
);

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

const slotsShown = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="plate-filaments"] .plate-filament-slot').evaluateAll((els) => els.map((el) => el.textContent ?? ""));

test("the plate view lists the selected plate's filaments and marks the plate that needs five at once", async ({ page }) => {
  await openProject(page, "seven-plates.3mf", sevenPlates);

  const row = page.getByTestId("plate-filaments");
  await expect(row).toBeVisible();
  await expect(row.locator(".plate-filaments-label")).toHaveText("Plate 1 uses");
  expect(await slotsShown(page)).toEqual(["filament 1", "filament 2", "filament 3"]);
  await expect(page.getByTestId("plate-filaments-flag")).toHaveCount(0);

  // Plate 3's third filament is painted on a face of its cube.
  await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 3" }).click();
  expect(await slotsShown(page)).toEqual(["filament 1", "filament 2", "filament 3"]);

  await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 2" }).click();
  expect(await slotsShown(page)).toEqual(["filament 4"]);

  await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 6" }).click();
  await expect(row.locator(".plate-filaments-label")).toHaveText("Plate 6 uses");
  expect(await slotsShown(page)).toEqual(["filament 1", "filament 2", "filament 3", "filament 5", "filament 6"]);
  const flag = page.getByTestId("plate-filaments-flag");
  await expect(flag).toHaveText("Needs 5 filaments at the same height; the U1 prints with 4");
  await expect(flag).toHaveClass(/is-over/);

  // Each swatch has its filament's color from the project.
  const colors = await row.locator(".plate-filament-dot").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(colors).toEqual(["rgb(0, 0, 0)", "rgb(255, 255, 255)", "rgb(0, 86, 184)", "rgb(91, 101, 121)", "rgb(236, 0, 140)"]);
});

test("after converting, the plate view still lists them and the notes show filament color chips for the plate that can't print as it is", async ({ page }) => {
  await openProject(page, "seven-plates.3mf", sevenPlates);
  await convertAndWait(page);

  const banner = page.getByTestId("status-warning");
  await expect(banner).toContainText("Plate 6 needs 5 filaments at the same height");
  const warningChips = banner.getByTestId("warning-filaments").first();
  await expect(warningChips).toBeVisible();
  const warningSlots = await warningChips
    .locator(".warning-filament-slot")
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  expect(warningSlots).toEqual(["filament 1", "filament 2", "filament 3", "filament 5", "filament 6"]);
  const warningColors = await warningChips
    .locator(".warning-filament-dot")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(warningColors).toEqual(["rgb(0, 0, 0)", "rgb(255, 255, 255)", "rgb(0, 86, 184)", "rgb(91, 101, 121)", "rgb(236, 0, 140)"]);

  await waitForAnimations(page);
  const axeResults = await new AxeBuilder({ page }).include('[data-testid="status-warning"]').analyze();
  expect(axeResults.violations).toEqual([]);

  await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 6" }).click();
  expect(await slotsShown(page)).toEqual(["filament 1", "filament 2", "filament 3", "filament 5", "filament 6"]);
  await expect(page.getByTestId("plate-filaments-flag")).toHaveText("Needs 5 filaments at the same height; the U1 prints with 4");
});

test("the demo project's plates show their filaments with no mark", async ({ page }) => {
  await openProject(page, "demo-model.3mf", demoModel);
  await expect(page.getByTestId("plate-filaments")).toBeVisible();
  expect((await slotsShown(page)).length).toBeGreaterThan(0);
  await expect(page.getByTestId("plate-filaments-flag")).toHaveCount(0);
});

test("the plate view with its filament row and mark has no accessibility violations @appearance", async ({ page }) => {
  await openProject(page, "seven-plates.3mf", sevenPlates);
  await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 6" }).click();
  await expect(page.getByTestId("plate-filaments-flag")).toBeVisible();
  // The tab just clicked fades to its active color; a check in the middle of that reads a color it never rests on.
  await waitForAnimations(page);
  const results = await new AxeBuilder({ page }).include(".visualizer-container").analyze();
  expect(results.violations).toEqual([]);
});

test("clicking a filament chip in the plate view or warning banner opens the filament detail modal", async ({ page }) => {
  await openProject(page, "seven-plates.3mf", sevenPlates);

  // Click filament 3 chip in the plate view
  await page.locator('[data-testid="plate-filaments"] .plate-filament-btn', { hasText: "filament 3" }).click();
  const dialog = page.locator('[role="dialog"][aria-labelledby="filament-modal-title"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Filament slot 3 (in the source file)");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Convert and click filament 6 chip in the warning banner
  await convertAndWait(page);
  await page.locator('[data-testid="status-warning"] .warning-filament-btn', { hasText: "filament 6" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Filament slot 6 (in the source file)");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
