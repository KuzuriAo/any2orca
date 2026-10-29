// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, settingsOf, waitForAnimations, SCHEMES } from "./helpers";

function make06DemoModel(): Buffer {
  const unzipped = unzipSync(new Uint8Array(demoModel));
  const raw = unzipped["Metadata/project_settings.config"];
  if (!raw) throw new Error("Metadata/project_settings.config not found in demoModel");
  const settings = JSON.parse(strFromU8(raw));
  settings.nozzle_diameter = ["0.6"];
  unzipped["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(unzipped));
}

const demo06Model = make06DemoModel();

/** The demo model with plain PETG in slot 2 and PA6-GF in slot 3. */
function makeMixedMaterialsModel(): Buffer {
  const unzipped = unzipSync(new Uint8Array(demoModel));
  const settings = JSON.parse(strFromU8(unzipped["Metadata/project_settings.config"]!));
  settings.filament_type = ["PLA", "PETG", "PA-GF"];
  settings.filament_settings_id = [settings.filament_settings_id[0], "Bambu PETG Basic @BBL X1C", "Bambu PA6-GF @BBL X1C"];
  unzipped["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
  return Buffer.from(zipSync(unzipped));
}

const mixedMaterialsModel = makeMixedMaterialsModel();

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test.describe("Filament names preview and converted file matching (0.4 profile)", () => {
  test("preview matches converted filament_settings_id for Snapmaker, Generic and Original", async ({ page }) => {
    await page.goto("/");
    await openProject(page);

    // Initial state (Original mode): shows creator's names
    const swatches = page.locator(".swatch-name");
    await expect(swatches.nth(0)).toHaveText(/Bambu PLA Basic/);
    await expect(swatches.nth(1)).toHaveText(/Bambu PLA Basic/);
    await expect(swatches.nth(2)).toHaveText(/Bambu PLA Matte/);

    // Switch to Snapmaker mode
    await page.getByTestId("filament-mode-snapmaker").click();
    await expect(swatches.nth(0)).toHaveText("Snapmaker PLA SnapSpeed @U1");
    await expect(swatches.nth(1)).toHaveText("Snapmaker PLA SnapSpeed @U1");
    await expect(swatches.nth(2)).toHaveText("Snapmaker PLA Matte @U1");

    // Convert and verify output matches preview
    await convertAndWait(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
    const output = new Uint8Array(readFileSync(await download.path()));
    const settings = settingsOf(output);
    expect(settings.filament_settings_id).toEqual([
      "Snapmaker PLA SnapSpeed @U1",
      "Snapmaker PLA SnapSpeed @U1",
      "Snapmaker PLA Matte @U1",
    ]);

    // Switch to Generic mode
    await page.getByTestId("filament-mode-generic").click();
    await expect(swatches.nth(0)).toHaveText("Generic PLA");
    await expect(swatches.nth(1)).toHaveText("Generic PLA");
    await expect(swatches.nth(2)).toHaveText("Generic PLA");

    // Switch back to Original mode
    await page.getByTestId("filament-mode-original").click();
    await expect(swatches.nth(0)).toHaveText(/Bambu PLA Basic/);
    await expect(swatches.nth(1)).toHaveText(/Bambu PLA Basic/);
    await expect(swatches.nth(2)).toHaveText(/Bambu PLA Matte/);
  });
});

test.describe("Filament names preview and converted file matching (0.6 profile)", () => {
  test("preview matches converted filament_settings_id for 0.6 nozzle", async ({ page }) => {
    await page.goto("/");
    await openProject(page, "demo06.3mf", demo06Model);

    // Switch to Snapmaker mode on 0.6 profile
    await page.getByTestId("filament-mode-snapmaker").click();
    const swatches = page.locator(".swatch-name");
    await expect(swatches.nth(0)).toHaveText("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    await expect(swatches.nth(1)).toHaveText("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    await expect(swatches.nth(2)).toHaveText("Snapmaker PLA Matte @U1 0.6 nozzle");

    // Convert and verify output matches preview
    await convertAndWait(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
    const output = new Uint8Array(readFileSync(await download.path()));
    const settings = settingsOf(output);
    expect(settings.filament_settings_id).toEqual([
      "Snapmaker PLA SnapSpeed @U1 0.6 nozzle",
      "Snapmaker PLA SnapSpeed @U1 0.6 nozzle",
      "Snapmaker PLA Matte @U1 0.6 nozzle",
    ]);
  });
});

for (const scheme of SCHEMES) {
  test.describe(`Axe accessibility for filament notices (${scheme})`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("a real conversion shows the fallback and unchanged notices, the preview matches the file, and axe is clean", async ({ page }) => {
      await page.goto("/");
      await openProject(page, "mixed-materials.3mf", mixedMaterialsModel);

      // Plain PETG has no Snapmaker preset (Generic); PA6-GF has neither (name stays).
      await page.getByTestId("filament-mode-snapmaker").click();
      const swatches = page.locator(".swatch-name");
      await expect(swatches.nth(0)).toHaveText("Snapmaker PLA SnapSpeed @U1");
      await expect(swatches.nth(1)).toHaveText("Generic PETG");
      await expect(swatches.nth(2)).toHaveText("Bambu PA6-GF @BBL X1C");

      await convertAndWait(page);
      const alert = page.locator(".fallback-alert");
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Snapmaker makes no preset for PETG at this nozzle size, so it uses Generic.");
      await expect(alert).toContainText("No Snapmaker or Generic preset fits PA-GF at this nozzle size, so its name stays as the creator had it.");

      const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
      const settings = settingsOf(new Uint8Array(readFileSync(await download.path())));
      expect(settings.filament_settings_id).toEqual(["Snapmaker PLA SnapSpeed @U1", "Generic PETG", "Bambu PA6-GF @BBL X1C"]);

      await waitForAnimations(page);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
      ).toEqual([]);
    });
  });
}
