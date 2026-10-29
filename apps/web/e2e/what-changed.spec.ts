// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert, decodeStamp } from "any2orca";
import { bundledProfileSource } from "any2orca/node";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, waitForAnimations } from "./helpers";

const STORAGE_KEY = "any2orca_presets";

/** Creates a source 3MF file with custom project settings. */
function customModel(changes: Record<string, string>): Buffer {
  const files = unzipSync(new Uint8Array(demoModel));
  const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
  Object.assign(settings, changes);
  const flagged = String(settings.different_settings_to_system?.[0] || "").split(";");
  settings.different_settings_to_system = [[...flagged, ...Object.keys(changes)].filter(Boolean).join(";")];
  files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(files));
}

let convertedU1: Promise<Uint8Array> | undefined;

/** A project as tuned in Snapmaker Orca on top of converted U1 baseline. */
async function tunedMaster(changes: Record<string, string>): Promise<Buffer> {
  convertedU1 ??= convert(new Uint8Array(demoModel), { profiles: bundledProfileSource(), stamp: false }).then((r) => r.output);
  const files = unzipSync(await convertedU1);
  const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
  Object.assign(settings, changes);
  files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(files));
}

async function openPresetsModal(page: Page) {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page, context }, testInfo) => {
  if (testInfo.project.use.browserName === "chromium" || !testInfo.project.use.browserName) {
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    } catch {
      // Best-effort in headless browsers
    }
  }
  await removeSavePicker(page);
  await page.goto("/");
});

test("shows the real What changed record with profile line, groups, and sentence items", async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  const trigger = page.getByRole("button", { name: "What changed?" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const panel = page.getByTestId("what-changed-panel");
  await expect(panel).toBeVisible();

  // Profile line as first line
  const profileLine = page.getByTestId("what-changed-profile");
  await expect(profileLine).toContainText(/Converted with .+ \(matched to the file\)/);

  // Groups in engine order
  await expect(page.getByTestId("group-creator")).toBeVisible();
  await expect(page.getByTestId("group-stock")).toBeVisible();
  await expect(page.getByTestId("group-layout")).toBeVisible();

  // Sentence items without arrows
  const sentenceRow = panel.locator(".sentence-row").first();
  await expect(sentenceRow).toBeVisible();
  await expect(sentenceRow).not.toContainText("→");
  await expect(sentenceRow).not.toContainText("->");
});

test("toggles All differences full settings diff table and returns to grouped view", async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  await page.getByRole("button", { name: "What changed?" }).click();
  const toggleBtn = page.getByTestId("toggle-all-diffs");
  await expect(toggleBtn).toHaveText("All differences");

  await toggleBtn.click();
  await expect(toggleBtn).toHaveText("Grouped view");

  const allDiffsView = page.getByTestId("all-diffs-view");
  await expect(allDiffsView).toBeVisible();
  await expect(allDiffsView.locator(".diff-table").first()).toBeVisible();

  await toggleBtn.click();
  await expect(toggleBtn).toHaveText("All differences");
  await expect(page.getByTestId("group-creator")).toBeVisible();
});

test("Export JSON downloads what-changed.json matching the real record format", async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  await page.getByRole("button", { name: "What changed?" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-json-button").click(),
  ]);

  expect(download.suggestedFilename()).toBe("demo-model_U1.what-changed.json");
  const text = readFileSync(await download.path(), "utf-8");
  const parsed = JSON.parse(text);
  expect(parsed.format).toBe("any2orca-what-changed");
  expect(parsed.version).toBe(1);
  expect(Array.isArray(parsed.groups)).toBe(true);
  expect(parsed.diff).toBeDefined();
});

test("Copy as text copies formatWhatChanged output with temporary confirmation", async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  await page.getByRole("button", { name: "What changed?" }).click();
  const copyBtn = page.getByTestId("copy-text-button");
  await expect(copyBtn).toHaveText("Copy as text");

  await copyBtn.click();
  await expect(copyBtn).toHaveText("Copied!");
  await page.waitForTimeout(2200);
  await expect(copyBtn).toHaveText("Copy as text");
});

test("when clipboard API is unavailable, falls back to execCommand and handles failure", async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  await page.getByRole("button", { name: "What changed?" }).click();
  const copyBtn = page.getByTestId("copy-text-button");

  // Fallback succeeds on plain HTTP
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    delete (window.Navigator.prototype as any).clipboard;
  });
  await copyBtn.click();
  await expect(copyBtn).toHaveText("Copied!");

  await page.waitForTimeout(2200);
  await expect(copyBtn).toHaveText("Copy as text");

  // If execCommand also fails, displays "Couldn't copy"
  await page.evaluate(() => {
    document.execCommand = () => false;
  });
  await copyBtn.click();
  await expect(copyBtn).toHaveText("Couldn't copy");
});

test("switch appears only on lines with alternative, and applying converts again with aboveStock recorded in stamp", async ({ page }) => {
  const modelWithSpeed = customModel({ outer_wall_speed: "350" });
  await page.getByTestId("file-input").setInputFiles(file("speed-demo.3mf", modelWithSpeed));
  await page.getByTestId("convert-button").waitFor({ timeout: 20_000 });
  await convertAndWait(page);

  await page.getByRole("button", { name: "What changed?" }).click();

  // Sentence items must not have switches
  const sentenceRow = page.locator(".sentence-row").first();
  await expect(sentenceRow.locator("input[type='checkbox']")).toHaveCount(0);

  // outer_wall_speed has alternative: "stock"
  const switchLabel = page.getByTestId("switch-outer_wall_speed");
  await expect(switchLabel).toBeVisible();
  await expect(switchLabel).toContainText("Use Snapmaker's stock value");

  const checkbox = switchLabel.locator("input[type='checkbox']");
  await expect(checkbox).not.toBeChecked();

  // No unapplied changes yet
  await expect(page.getByTestId("apply-bar")).toBeHidden();

  // Toggle switch ON
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(page.getByTestId("apply-bar")).toBeVisible();

  // Apply and convert again
  const applyBtn = page.getByTestId("apply-reconvert-button");
  await applyBtn.click();

  // Wait for re-conversion to complete
  await page.getByTestId("download-button").waitFor({ timeout: 30_000 });

  // Download converted file and check stamp
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);

  const downloadedBytes = new Uint8Array(readFileSync(await download.path()));
  const zip = unzipSync(downloadedBytes);
  const stamp = decodeStamp(zip["Metadata/any2orca.json"]);
  expect(stamp?.options.aboveStock).toEqual({
    keep: [],
    stock: ["outer_wall_speed"],
  });

  // Open what changed again: outer_wall_speed is now under "Your choices" with alternative: "keep"
  await page.getByRole("button", { name: "What changed?" }).click();
  const yourChoicesGroup = page.getByTestId("group-yours");
  await expect(yourChoicesGroup).toBeVisible();
  const newSwitch = page.getByTestId("switch-outer_wall_speed");
  await expect(newSwitch).toContainText("Keep the creator's value");
});

test("presets above-stock confirmation offers per-row choices, shortcuts, and saves with withoutChanges", async ({ page }) => {
  const tunedBytes = await tunedMaster({ wall_loops: "4", sparse_infill_speed: "480" });
  const dialog = await openPresetsModal(page);
  await dialog.locator('input[type="file"][accept=".3mf"]').setInputFiles(file("tuned.3mf", tunedBytes));
  await dialog.getByLabel("Preset Name:").fill("Tuned Speeds");

  await dialog.getByRole("button", { name: /^Save/ }).click();

  const confirmModal = page.getByRole("alertdialog");
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal).toContainText("Speed > Other layers speed > Sparse infill: 480 (stock 270)");

  // Per-row radio choice
  const keepRadio = confirmModal.locator("input[type='radio'][value='keep']");
  const stockRadio = confirmModal.locator("input[type='radio'][value='stock']");
  await expect(keepRadio).toBeChecked();
  await expect(stockRadio).not.toBeChecked();

  // Shortcuts
  await confirmModal.getByRole("button", { name: "Use stock for all" }).click();
  await expect(stockRadio).toBeChecked();
  await expect(keepRadio).not.toBeChecked();

  await confirmModal.getByRole("button", { name: "Keep all" }).click();
  await expect(keepRadio).toBeChecked();

  // Switch to stock for sparse_infill_speed
  await stockRadio.click();

  // Save anyway / Save
  await confirmModal.getByRole("button", { name: "Save anyway" }).click();
  await expect(confirmModal).toBeHidden();

  // Verify stored preset in localStorage: sparse_infill_speed should be left out by withoutChanges
  const storedJson = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(storedJson).not.toBeNull();
  const parsed = JSON.parse(storedJson!);
  expect(parsed.presets[0].changes).toEqual({
    wall_loops: "4",
  });
});

test("What changed panel keyboard navigation and accessibility check", { tag: "@appearance" }, async ({ page }) => {
  await openProject(page);
  await convertAndWait(page);

  const trigger = page.getByRole("button", { name: "What changed?" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const panel = page.getByTestId("what-changed-panel");
  await expect(panel).toBeVisible();
  await waitForAnimations(page);

  // Run Axe accessibility audit on the What Changed panel
  const { violations } = await new AxeBuilder({ page })
    .include("[data-testid='what-changed-panel']")
    .analyze();
  expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
});

test("What changed shows alternative summary bar with filter toggle when alternatives exist", async ({ page }) => {
  // Test with demoModel (0 alternatives)
  await openProject(page);
  await convertAndWait(page);
  const trigger = page.getByTestId("what-changed-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByTestId("alternatives-summary")).toHaveCount(0);

  // Test with custom model that has values above stock (alternatives exist)
  const fileWithAlts = file("high-accel.3mf", customModel({
    outer_wall_acceleration: "6000",
    travel_acceleration: "12000",
  }));
  await page.locator('input[type="file"]').first().setInputFiles(fileWithAlts);
  await convertAndWait(page);
  await page.getByTestId("what-changed-trigger").click();

  const summary = page.getByTestId("alternatives-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("values above Snapmaker's stock can be chosen differently");

  const filterBtn = page.getByTestId("toggle-alternatives-filter");
  await expect(filterBtn).toHaveText("Show them");
  await filterBtn.click();
  await expect(filterBtn).toHaveText("Show all");

  // Every item row currently visible in the panel has an alternative switch
  const rows = page.getByTestId("what-changed-panel").locator(".item-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i).locator(".switch-control")).toBeVisible();
  }

  // Toggle back to Show all
  await filterBtn.click();
  await expect(filterBtn).toHaveText("Show them");
});
