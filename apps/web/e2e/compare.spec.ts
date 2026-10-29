// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { demoModel, file, removeSavePicker } from "./helpers";

function customModel(changes: Record<string, unknown>): Buffer {
  const files = unzipSync(new Uint8Array(demoModel));
  const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
  Object.assign(settings, changes);
  const flagged = String(settings.different_settings_to_system?.[0] || "").split(";");
  settings.different_settings_to_system = [[...flagged, ...Object.keys(changes)].filter(Boolean).join(";")];
  files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(files));
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test("can switch between Presets and Compare from the Advanced screen", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Tuned Print Presets")).toBeVisible();

  // Switch to Compare tab
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();
  await expect(dialog.getByText("Settings Compare")).toBeVisible();

  // Switch back to Presets tab
  await dialog.getByRole("tab", { name: "Presets" }).click();
  await expect(dialog.getByText("Tuned Print Presets")).toBeVisible();
});

test("Compare defaults stock profile to the auto-matched profile of the file", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  // Upload file A
  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("demo.3mf", Buffer.from(demoModel)));

  // Stock profile should automatically match the file (0.4 nozzle standard)
  const stockSelect = dialog.locator(".compare-select").first();
  await expect(stockSelect).toHaveValue("snapmaker-u1-0.4-standard");
});

test("Compare legend uses accurate wording", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("demo.3mf", Buffer.from(demoModel)));

  await expect(dialog.getByText("Not a Snapmaker Orca setting").first()).toBeVisible();
  await expect(dialog.getByText("Only in source (A)").first()).toBeVisible();
  await expect(dialog.getByText("Only in target (B)").first()).toBeVisible();
  await expect(dialog.getByText("Material mismatch")).toHaveCount(0);
  await expect(dialog.getByText("Above U1 limit (capped)").first()).toBeVisible();
  await expect(dialog.getByText("Above stock").first()).toBeVisible();
});

test("Compare tables display all rows across groups without clipping", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("demo.3mf", Buffer.from(demoModel)));

  // Wait for diff results
  await expect(dialog.locator(".diff-summary-card")).toBeVisible();

  // Uncheck differences-only to see all groups and rows
  const diffOnlyCheckbox = dialog.locator('input[type="checkbox"]').first();
  if (await diffOnlyCheckbox.isChecked()) {
    await diffOnlyCheckbox.uncheck();
  }

  // Print settings, filament slot and machine settings groups should all be present
  await expect(dialog.locator(".group-section").first()).toBeVisible();
  const count = await dialog.locator(".group-section").count();
  expect(count).toBeGreaterThan(1);
});

test("the compare screen passes axe", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("demo.3mf", Buffer.from(demoModel)));
  await expect(dialog.locator(".diff-summary-card")).toBeVisible();

  const violations = (await new AxeBuilder({ page }).include(".compare-modal").analyze()).violations;
  expect(violations).toEqual([]);
});

test("at 1440 pixels wide every status chip height equals a single line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("demo.3mf", Buffer.from(demoModel)));
  await expect(dialog.locator(".diff-summary-card")).toBeVisible();

  // Dialog width on 1440px wide viewport should expand up to 1200px
  const modalBox = await dialog.boundingBox();
  expect(modalBox).not.toBeNull();
  expect(modalBox!.width).toBeGreaterThanOrEqual(1000);

  // Uncheck differences only to inspect status badges of all types
  const diffOnlyCheckbox = dialog.locator('input[type="checkbox"]').first();
  if (await diffOnlyCheckbox.isChecked()) {
    await diffOnlyCheckbox.uncheck();
  }

  // One call for all of them: with the unchanged rows listed there are hundreds, and a round trip each is slow under load.
  const heights = await dialog.locator(".status-cell .badge").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  // A single line badge at 0.675rem with padding is ~18px to 24px; wrapping to two lines is >= 32px
  expect(Math.max(...heights)).toBeLessThanOrEqual(28);
});

test("values needing attention appear first with chips, filterable and sortable by keyboard", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  // Create file with inner wall speed > 500 (machine limit) and outer wall speed > 200 (above stock)
  const testFile = file("speeds.3mf", customModel({
    inner_wall_speed: "600",
    outer_wall_speed: "250",
  }));
  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(testFile);
  await expect(dialog.locator(".diff-summary-card")).toBeVisible();

  const printTable = dialog.locator('table[aria-label="Print Settings"]');
  await expect(printTable).toBeVisible();

  // Needs a look heading appears above pages with count
  await expect(printTable.locator(".needs-look-row")).toBeVisible();
  await expect(printTable.locator(".needs-look-row")).toContainText("Needs a look (2)");

  // Default order in Needs a look: inner wall speed (above-limit) first with red chip, then outer wall speed (above-stock) with amber chip
  const attentionRows = printTable.locator("tbody tr.diff-row");
  await expect(attentionRows.nth(0)).toContainText("Inner wall");
  await expect(attentionRows.nth(0).locator(".badge-above-limit")).toHaveText("Above U1 limit (capped)");

  await expect(attentionRows.nth(1)).toContainText("Outer wall");
  await expect(attentionRows.nth(1).locator(".badge-above-stock")).toHaveText("Above stock");

  // Page headings appear below Needs a look with count
  await expect(printTable.locator(".page-heading-row").first()).toBeVisible();

  // Section heading exists, e.g. Speed > Other layers speed or Speed > Acceleration
  const sectionToggleBtn = printTable.locator(".section-toggle-btn").first();
  await expect(sectionToggleBtn).toBeVisible();
  await expect(sectionToggleBtn).toHaveAttribute("aria-expanded", "true");

  // Clicking section toggle collapses it
  await sectionToggleBtn.click();
  await expect(sectionToggleBtn).toHaveAttribute("aria-expanded", "false");
  // Clicking again expands it
  await sectionToggleBtn.click();
  await expect(sectionToggleBtn).toHaveAttribute("aria-expanded", "true");

  // Axe passes with attention chips
  const violations = (await new AxeBuilder({ page }).include(".compare-modal").analyze()).violations;
  expect(violations).toEqual([]);

  // Filter: Only values above stock or the U1 limits
  const filterCheckbox = dialog.getByTestId("filter-attention-only");
  await expect(filterCheckbox).toBeVisible();
  await filterCheckbox.check();

  // Filter shows exactly the 2 marked rows in Needs a look
  await expect(printTable.locator("tbody tr.diff-row")).toHaveCount(2);
  await expect(printTable.locator("tbody tr.diff-row").nth(0)).toContainText("Inner wall");
  await expect(printTable.locator("tbody tr.diff-row").nth(1)).toContainText("Outer wall");

  // Uncheck filter
  await filterCheckbox.uncheck();

  // Sorting by Status flattens the grouping into one list
  const sortStatusBtn = printTable.getByTestId("sort-status-btn");
  await sortStatusBtn.click();
  // Subheadings disappear when flattened
  await expect(printTable.locator(".needs-look-row")).toHaveCount(0);
  await expect(printTable.locator(".page-heading-row")).toHaveCount(0);
  await expect(printTable.locator(".section-heading-row")).toHaveCount(0);

  // Reset sort restores the grouping
  const resetSortBtn = dialog.getByTestId("reset-sort-btn");
  await expect(resetSortBtn).toBeVisible();
  await resetSortBtn.click();
  await expect(printTable.locator(".needs-look-row")).toBeVisible();
  await expect(printTable.locator(".page-heading-row").first()).toBeVisible();

  // Keyboard sorting on Setting Parameter header button
  const sortSettingBtn = printTable.getByTestId("sort-setting-btn");
  await sortSettingBtn.focus();
  await page.keyboard.press("Enter");

  // Setting column sorted ascending (A to Z)
  const thParam = printTable.locator(".th-param");
  await expect(thParam).toHaveAttribute("aria-sort", "ascending");
  await expect(printTable.locator(".needs-look-row")).toBeVisible();

  // Setting column sorted descending on second Enter
  await page.keyboard.press("Enter");
  await expect(thParam).toHaveAttribute("aria-sort", "descending");

  // Reset sort button restores default order
  await resetSortBtn.click();
  await expect(thParam).toHaveAttribute("aria-sort", "none");
  await expect(printTable.locator(".needs-look-row")).toBeVisible();
  await expect(printTable.locator("tbody tr.diff-row").nth(0)).toContainText("Inner wall");
});

test("paired-values note uses valueLayoutNotes: no note for 4-filament groups, hotend note for print group", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Compare Settings" }).click();

  const fourFilamentsA = customModel({
    printer_model: "Bambu Lab P1S",
    filament_colour: ["#FFFFFF", "#000000", "#FF0000", "#00FF00"],
    filament_type: ["PLA", "PLA", "PLA", "PLA"],
    nozzle_temperature: ["220", "220", "215", "215"],
    filament_flow_ratio: ["0.95", "0.95", "0.95", "0.95"],
    outer_wall_speed: "200",
  });

  const fourFilamentsB = customModel({
    printer_model: "Snapmaker U1",
    filament_colour: ["#FFFFFF", "#000000", "#FF0000", "#00FF00"],
    filament_type: ["PLA", "PLA", "PLA", "PLA"],
    nozzle_temperature: ["210", "210", "210", "210"],
    filament_flow_ratio: ["0.95", "0.95", "0.95", "0.95"],
    outer_wall_speed: ["200", "500"],
  });

  const fileAInput = dialog.locator('input[type="file"]').first();
  await fileAInput.setInputFiles(file("four-filaments.3mf", fourFilamentsA));

  await dialog.getByRole("tab", { name: "File" }).click();
  const fileBInput = dialog.locator('input[type="file"]').nth(1);
  await fileBInput.setInputFiles(file("four-filaments-u1.3mf", fourFilamentsB));

  const printSection = dialog.locator(".group-section").filter({ has: page.getByRole("heading", { name: "Print Settings" }) });
  await expect(printSection.locator(".paired-values-note")).toHaveText("Two values: standard hotend, then Liber High Flow Hotend.");

  const filamentSections = dialog.locator(".group-section").filter({ has: page.getByRole("heading", { name: /^Filament/ }) });
  await expect(filamentSections.first()).toBeVisible();
  const count = await filamentSections.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(filamentSections.nth(i).locator(".paired-values-note")).toHaveCount(0);
  }
});
