// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convert } from "any2orca";
import { bundledProfileSource } from "any2orca/node";
import { demoModel, file, openProject, removeSavePicker } from "./helpers";

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

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test("Compare works with a project already open, from the Advanced screen and from the footer", async ({ page }) => {
  await openProject(page);
  for (const open of [
    async () => {
      await page.getByTestId("advanced-tools-btn").click();
      await page.getByRole("tab", { name: /Compare/ }).first().click();
    },
    async () => page.locator(".footer-link-btn", { hasText: "Compare" }).click(),
  ]) {
    await open();
    const dialog = page.getByRole("dialog").filter({ hasText: "Settings Compare" });
    await expect(dialog.locator('select[aria-label*="stock"]')).toHaveValue("snapmaker-u1-0.4-standard");
    await expect(dialog.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/No profile found/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close modal" }).click();
  }
});

test("after Cancel in the above-stock confirmation, focus returns to Save and Escape closes the presets screen", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await dialog.locator('input[type="file"][accept=".3mf"]').setInputFiles(file("tuned.3mf", await tunedMaster({ sparse_infill_speed: "480" })));
  await dialog.getByLabel("Preset Name:").fill("Fast");
  const save = dialog.getByRole("button", { name: /^Save/ });
  await save.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(save).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Escape closes the presets screen wherever focus is, including right after saving", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await expect(dialog).toBeVisible();
  // Focus outside the screen (for example right after a save, before focus is moved back in).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("a loaded master survives switching tabs, inside Presets and between Presets and Compare", async ({ page }) => {
  await page.getByTestId("advanced-tools-btn").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await dialog.locator('input[type="file"][accept=".3mf"]').setInputFiles(file("tuned.3mf", await tunedMaster({ wall_loops: "4" })));
  await dialog.getByLabel("Preset Name:").fill("My walls");
  await dialog.getByRole("tab", { name: /Saved Presets/ }).click();
  await dialog.getByRole("tab", { name: /Make Preset/ }).click();
  await expect(dialog.getByLabel("Preset Name:")).toHaveValue("My walls");
  await page.getByRole("tab", { name: /Compare/ }).first().click();
  await page.getByRole("tab", { name: /^Presets$/ }).first().click();
  const back = page.getByRole("dialog").filter({ hasText: "Tuned Print Presets" });
  await expect(back.getByRole("row", { name: /Wall loops/ })).toBeVisible();
  await expect(back.getByLabel("Preset Name:")).toHaveValue("My walls");
});
