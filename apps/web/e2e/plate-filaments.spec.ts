// SPDX-License-Identifier: AGPL-3.0-or-later
// The plate view says which filaments the selected plate uses, and marks a plate that needs more at the same height
// than the U1 prints with. The project is the shared scene's seven-plate save: six filaments, a painted face on
// plate 3, and five objects on five filaments on plate 6.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, waitForAnimations } from "./helpers";

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

function buildSeventeenFilamentFixture(): Buffer {
  const entries = unzipSync(new Uint8Array(sevenPlates));
  const settingsKey = "Metadata/project_settings.config";
  const settings = JSON.parse(strFromU8(entries[settingsKey])) as Record<string, unknown>;
  const n = (settings.filament_colour as unknown[]).length;
  const count = 17;
  for (const [key, value] of Object.entries(settings)) {
    if (!Array.isArray(value)) continue;
    if (key === "flush_volumes_matrix" && value.length === n * n) {
      settings[key] = Array.from({ length: count * count }, (_, i) => (Math.floor(i / count) === i % count ? "0" : "300"));
    } else if (key === "filament_colour" && value.length === n) {
      settings[key] = [...value, ...Array.from({ length: count - n }, (_, idx) => (n + idx === 16 ? "#FF6600" : "#CCCCCC"))];
    } else if (value.length === n) {
      settings[key] = [...value, ...Array.from({ length: count - n }, () => value[0])];
    } else if (value.length === 2 * n) {
      settings[key] = [...value, ...Array.from({ length: count - n }, () => [value[0], value[1]]).flat()];
    }
  }
  entries[settingsKey] = strToU8(JSON.stringify(settings));
  const objKey = "3D/Objects/object_6.model";
  entries[objKey] = strToU8(strFromU8(entries[objKey]).replaceAll('paint_color="0C"', 'paint_color="EC"'));
  return Buffer.from(zipSync(entries, { level: 0 }));
}

test("the filament 17 warning shows color chips for both filament 1 and filament 17", async ({ page }) => {
  const seventeenFilaments = buildSeventeenFilamentFixture();
  await openProject(page, "seventeen-filaments.3mf", seventeenFilaments);
  await convertAndWait(page);

  const banner = page.getByTestId("status-warning");
  await expect(banner).toContainText("Check plate 3 before printing.");
  await expect(banner).toContainText("can skip filament 17 on some layers when filament 1 is on the same plate");

  const firstChips = banner.getByTestId("warning-filaments").first();
  await expect(firstChips).toBeVisible();
  const slots = await firstChips
    .locator(".warning-filament-slot")
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  expect(slots).toEqual(["filament 1", "filament 17"]);
  const colors = await firstChips
    .locator(".warning-filament-dot")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(colors).toEqual(["rgb(0, 0, 0)", "rgb(255, 102, 0)"]);
});

test("opening the filament detail modal by keyboard from a plate or banner chip returns focus on Escape and Close", async ({ page }) => {
  await openProject(page, "seven-plates.3mf", sevenPlates);

  const dialog = page.locator('[role="dialog"][aria-labelledby="filament-modal-title"]');

  // Keyboard-only flow from plate view chip -> Enter -> Escape -> focus returns to chip
  const plateChip = page.locator('[data-testid="plate-filaments"] .plate-filament-btn', { hasText: "filament 3" });
  await plateChip.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Filament slot 3 (in the source file)");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(plateChip).toBeFocused();

  // Keyboard-only flow from warning banner chip -> Enter -> Close button -> focus returns to chip
  await convertAndWait(page);
  const bannerChip = page.locator('[data-testid="status-warning"] .warning-filament-btn', { hasText: "filament 6" });
  await bannerChip.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Filament slot 6 (in the source file)");
  await dialog.getByRole("button", { name: "Close filament details" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bannerChip).toBeFocused();
});

test("in the batch view, plate chips open the right file's filament modal and conversion notes show chips", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([
    file("batch-demo.3mf", demoModel),
    file("batch-seven.3mf", sevenPlates),
  ]);
  await expect(page.getByRole("button", { name: /Convert All/i })).toBeVisible();

  // Expand the second staged file (sevenPlates) and click filament 6 on Plate 6
  const secondExpandBtn = page.locator(".card-expand-btn").nth(1);
  await secondExpandBtn.click();
  const secondCard = page.locator(".staged-card").nth(1);
  await secondCard.locator(".plate-tabs .tab-btn", { hasText: "Plate 6" }).click();
  const slot6Chip = secondCard.locator('[data-testid="plate-filaments"] .plate-filament-btn', { hasText: "filament 6" });
  await slot6Chip.click();

  const dialog = page.locator('[role="dialog"][aria-labelledby="filament-modal-title"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Filament slot 6 (in the source file)");
  await expect(dialog).toContainText("#EC008C");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(slot6Chip).toBeFocused();

  // Convert batch and verify second file's Conversion Notes show filament chips
  await page.getByRole("button", { name: /Convert All/i }).click();
  await expect(page.getByTestId("download-batch-zip")).toBeVisible({ timeout: 30_000 });
  const batchWarningChips = secondCard.getByTestId("batch-warning-filaments").first();
  await expect(batchWarningChips).toBeVisible();
  const batchSlots = await batchWarningChips
    .locator(".batch-warning-filament-slot")
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  expect(batchSlots).toEqual(["filament 1", "filament 2", "filament 3", "filament 5", "filament 6"]);
});
