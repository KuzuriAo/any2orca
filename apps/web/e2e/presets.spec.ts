// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert } from "any2orca";
import { bundledProfileSource } from "any2orca/node";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, settingsOf } from "./helpers";

const STORAGE_KEY = "any2orca_presets";

/** A project as a U1 owner would tune it: the demo converted, then wall loops and sparse infill speed changed in Snapmaker Orca. */
// The demo converted once per file: converting in every test competes for CPU with the browsers when the whole suite runs.
let converted: Promise<Uint8Array> | undefined;

async function tunedMaster(changes: Record<string, string>): Promise<Buffer> {
  converted ??= convert(new Uint8Array(demoModel), { profiles: bundledProfileSource(), stamp: false }).then((r) => r.output);
  const files = unzipSync(await converted);
  const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
  Object.assign(settings, changes);
  files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(files));
}

async function openPresets(page: Page) {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function makePreset(page: Page, name: string, master: Buffer) {
  const dialog = await openPresets(page);
  await dialog.locator('input[type="file"][accept=".3mf"]').setInputFiles(file("tuned.3mf", master));
  await dialog.getByLabel("Preset Name:").fill(name);
  return dialog;
}

const confirmation = (page: Page) => page.getByRole("alertdialog");

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test("presets window shows neutral intro copy without first-person pronouns", async ({ page }) => {
  const dialog = await openPresets(page);
  await expect(dialog.getByText("Your changed walls, infill, supports and speeds become a reusable preset.")).toBeVisible();
  const introText = await dialog.locator(".drop-subtitle").innerText();
  expect(introText).not.toMatch(/\b(we|we'll|us|our|i)\b/i);
});

test("making a preset shows the base profile and each change before saving", async ({ page }) => {
  const dialog = await makePreset(page, "Walls", await tunedMaster({ wall_loops: "4" }));
  await expect(dialog.getByText("snapmaker-u1-0.4-standard")).toBeVisible();
  const row = dialog.getByRole("row", { name: /Wall loops/ });
  await expect(row).toContainText("2");
  await expect(row).toContainText("4");
});

test("speeds above stock need the itemized confirmation, and Cancel or Escape saves nothing", async ({ page }) => {
  const dialog = await makePreset(page, "Fast", await tunedMaster({ sparse_infill_speed: "480" }));
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await expect(confirmation(page)).toContainText("Speed > Other layers speed > Sparse infill: 480 (stock 270)");
  await expect(confirmation(page)).toContainText("Check them with a test print.");
  await expect(confirmation(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation(page)).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();

  await dialog.getByRole("button", { name: /^Save/ }).click();
  await confirmation(page).getByRole("button", { name: "Save anyway" }).click();
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)) ?? "{}");
  expect(stored).toMatchObject({ format: "any2orca-presets", version: 1, presets: [{ name: "Fast", changes: { sparse_infill_speed: "480" } }] });
});

test("Tab stays inside the above-stock confirmation", async ({ page }) => {
  const dialog = await makePreset(page, "Fast", await tunedMaster({ sparse_infill_speed: "480" }));
  await dialog.getByRole("button", { name: /^Save/ }).click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await confirmation(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
});

test("converting with a preset applies it, marks it above stock and records it in the stamp", async ({ page }) => {
  const dialog = await makePreset(page, "Fast walls", await tunedMaster({ wall_loops: "4", sparse_infill_speed: "480" }));
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await confirmation(page).getByRole("button", { name: "Save anyway" }).click();
  await page.keyboard.press("Escape");
  await openProject(page);
  await page.getByTestId("preset-picker").selectOption("Fast walls");
  await expect(page.getByTestId("above-stock-badge")).toBeVisible();
  await convertAndWait(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  expect(settingsOf(bytes)).toMatchObject({ wall_loops: "4" });
  const stamp = JSON.parse(strFromU8(unzipSync(bytes)["Metadata/any2orca.json"]));
  expect(stamp.options.preset).toMatchObject({ base: "snapmaker-u1-0.4-standard", keys: ["sparse_infill_speed", "wall_loops"] });
  expect(JSON.stringify(stamp)).not.toContain("Fast walls");
});

test("unreadable saved presets are reported and never overwritten", async ({ page }) => {
  await page.evaluate((k) => localStorage.setItem(k, '{"format":"any2orca-presets","version":1,"presets":[{"name":"x"'), STORAGE_KEY);
  await page.reload();
  const dialog = await makePreset(page, "Walls", await tunedMaster({ wall_loops: "4" }));
  await expect(dialog.getByRole("alert")).toContainText("couldn't be read");
  await dialog.getByRole("button", { name: /^Save/ }).click().catch(() => {});
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('{"format":"any2orca-presets","version":1,"presets":[{"name":"x"');
});

test("a preset's name is shown as text, never as markup", async ({ page }) => {
  const dialog = await makePreset(page, '<img src=x onerror="window.__hit=1">', await tunedMaster({ wall_loops: "4" }));
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText('<img src=x onerror="window.__hit=1">').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __hit?: number }).__hit)).toBeUndefined();
});

test("the presets screen and its confirmation pass axe", async ({ page }) => {
  const dialog = await makePreset(page, "Fast", await tunedMaster({ sparse_infill_speed: "480" }));
  expect((await new AxeBuilder({ page }).include(".presets-modal").analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: /^Save/ }).click();
  expect((await new AxeBuilder({ page }).include(".confirmation-card").analyze()).violations).toEqual([]);
});

test("already loaded file: picking a loaded Snapmaker Orca project reaches review screen", async ({ page }) => {
  const master = await tunedMaster({ wall_loops: "4" });
  await openProject(page, "tuned-model.3mf", master);

  const dialog = await openPresets(page);
  await expect(dialog.getByTestId("already-loaded-control")).toBeVisible();

  const button = dialog.getByTestId("use-loaded-file-btn");
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button).toContainText("tuned-model.3mf");

  await button.click();

  // Reaches review screen without choosing file again
  await expect(dialog.getByLabel("Preset Name:")).toBeVisible();
  await expect(dialog.getByLabel("Preset Name:")).toHaveValue("tuned-model Tuned");
  await expect(dialog.getByRole("table", { name: "Detected parameter changes" })).toBeVisible();
  const row = dialog.getByRole("row", { name: /Wall loops/ });
  await expect(row).toContainText("4");
});

test("already loaded file: batch mode lists files and choosing second file loads it", async ({ page }) => {
  const master1 = await tunedMaster({ wall_loops: "3" });
  const master2 = await tunedMaster({ wall_loops: "5" });

  await page.getByTestId("file-input").setInputFiles([
    file("batch-first.3mf", master1),
    file("batch-second.3mf", master2),
  ]);
  await page.getByRole("button", { name: /Convert all/i }).waitFor({ timeout: 20_000 });

  const dialog = await openPresets(page);
  await expect(dialog.getByTestId("already-loaded-control")).toBeVisible();

  const select = dialog.getByTestId("loaded-files-select");
  await expect(select).toBeVisible();

  await select.selectOption({ label: "batch-second.3mf" });

  await expect(dialog.getByLabel("Preset Name:")).toBeVisible();
  await expect(dialog.getByLabel("Preset Name:")).toHaveValue("batch-second Tuned");
  const row = dialog.getByRole("row", { name: /Wall loops/ });
  await expect(row).toContainText("5");
});

test("already loaded file: loaded Bambu source file is disabled with guidance reason", async ({ page }) => {
  await openProject(page, "bambu-source.3mf", demoModel);

  const dialog = await openPresets(page);
  await expect(dialog.getByTestId("already-loaded-control")).toBeVisible();

  const button = dialog.getByTestId("use-loaded-file-btn");
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(button).toContainText("Convert it first, then tune it in Snapmaker Orca.");
});

test("detected parameter changes table columns are sortable with aria-sort, reset sort, and preserved data on save", async ({ page }) => {
  const master = await tunedMaster({
    wall_loops: "4",
    sparse_infill_speed: "350",
    outer_wall_speed: "120",
  });
  const dialog = await makePreset(page, "Sorted Test", master);

  const table = dialog.getByRole("table", { name: "Detected parameter changes" });
  await expect(table).toBeVisible();

  const paramTh = table.locator("th.th-param");
  const stockTh = table.locator("th.th-stock");
  const yoursTh = table.locator("th.th-yours");

  // Initial order has aria-sort="none"
  await expect(paramTh).toHaveAttribute("aria-sort", "none");
  await expect(stockTh).toHaveAttribute("aria-sort", "none");
  await expect(yoursTh).toHaveAttribute("aria-sort", "none");
  await expect(dialog.getByTestId("reset-sort-btn")).toBeHidden();

  // 1. Sort by Setting Parameter
  await dialog.getByTestId("sort-param-btn").click();
  await expect(paramTh).toHaveAttribute("aria-sort", "ascending");
  await expect(dialog.getByTestId("reset-sort-btn")).toBeVisible();

  // Check row labels ascending
  let labels = await table.locator("tbody tr .param-label").allInnerTexts();
  const sortedLabelsAsc = [...labels].sort((a, b) => a.localeCompare(b));
  expect(labels).toEqual(sortedLabelsAsc);

  // Click again -> descending
  await dialog.getByTestId("sort-param-btn").click();
  await expect(paramTh).toHaveAttribute("aria-sort", "descending");
  labels = await table.locator("tbody tr .param-label").allInnerTexts();
  const sortedLabelsDesc = [...labels].sort((a, b) => b.localeCompare(a));
  expect(labels).toEqual(sortedLabelsDesc);

  // Click third time -> default engine order
  await dialog.getByTestId("sort-param-btn").click();
  await expect(paramTh).toHaveAttribute("aria-sort", "none");
  await expect(dialog.getByTestId("reset-sort-btn")).toBeHidden();

  // 2. Sort by Your Tuned Value
  await dialog.getByTestId("sort-yours-btn").click();
  await expect(yoursTh).toHaveAttribute("aria-sort", "ascending");
  await expect(dialog.getByTestId("reset-sort-btn")).toBeVisible();

  // Numeric sorting: 4 < 120 < 350
  let values = await table.locator("tbody tr .yours-cell").allInnerTexts();
  expect(values[0]).toContain("4");
  expect(values[1]).toContain("120");
  expect(values[2]).toContain("350");

  // Click Reset sort button
  await dialog.getByTestId("reset-sort-btn").click();
  await expect(yoursTh).toHaveAttribute("aria-sort", "none");
  await expect(dialog.getByTestId("reset-sort-btn")).toBeHidden();

  // 3. Save preset after sorting and verify saved preset holds the same changes
  await dialog.getByTestId("sort-param-btn").click();
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await confirmation(page).getByRole("button", { name: "Save anyway" }).click();

  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)) ?? "{}");
  expect(stored.presets[0].changes).toMatchObject({
    wall_loops: "4",
    sparse_infill_speed: "350",
    outer_wall_speed: "120",
  });
});
