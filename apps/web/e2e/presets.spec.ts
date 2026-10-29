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
