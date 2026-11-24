// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
    const filamentIds = settings.filament_settings_id as string[];
    const previewNames = await swatches.allTextContents();
    expect(filamentIds.slice(0, 3)).toEqual(previewNames.map((n) => n.trim()));
    expect(filamentIds.slice(0, 3)).toEqual([
      "Snapmaker PLA SnapSpeed @U1",
      "Snapmaker PLA SnapSpeed @U1",
      "Snapmaker PLA Matte @U1",
    ]);
    expect(filamentIds[3]).toBe(filamentIds[2]);

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
  test("converting bambu-studio-2.8.4.57-beta.3mf with Snapmaker shows preset settings note and with Original shows no filament note", async ({ page }) => {
    const bambuFixture = readFileSync(
      new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.8.4.57-beta.3mf", import.meta.url),
    );
    await page.goto("/");
    await openProject(page, "bambu-studio-2.8.4.57-beta.3mf", bambuFixture);

    // 1. Original: no filament note shows
    await expect(page.locator(".fallback-alert")).toHaveCount(0);
    await convertAndWait(page);
    await expect(page.locator(".fallback-alert")).toHaveCount(0);

    // 2. Snapmaker: shows filamentNotes sentence with replaced settings
    await page.getByTestId("filament-mode-snapmaker").click();
    await expect(page.getByTestId("download-button")).toBeVisible({ timeout: 30_000 });
    const alert = page.locator(".fallback-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(
      "Filaments 3 and 4 use Snapmaker PLA SnapSpeed @U1's own settings instead of the creator's: nozzle temperature 225 °C → 220 °C",
    );
  });
});


test.describe("Filament names preview and converted file matching (0.6 profile)", () => {
  test("preview matches converted filament_settings_id for 0.6 nozzle", async ({ page }) => {
    await page.goto("/");
    await openProject(page, "demo06.3mf", demo06Model);

    // Default nozzle size (0.4 mm) shows the 0.4 names even for a 0.6 project
    await page.getByTestId("filament-mode-snapmaker").click();
    const swatches = page.locator(".swatch-name");
    await expect(swatches.nth(0)).toHaveText("Snapmaker PLA SnapSpeed @U1");
    await expect(swatches.nth(1)).toHaveText("Snapmaker PLA SnapSpeed @U1");
    await expect(swatches.nth(2)).toHaveText("Snapmaker PLA Matte @U1");

    // Under "Match the file", preview and converted file use the 0.6 names
    await page.getByTestId("nozzle-size-select").selectOption("match");
    await expect(swatches.nth(0)).toHaveText("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    await expect(swatches.nth(1)).toHaveText("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    await expect(swatches.nth(2)).toHaveText("Snapmaker PLA Matte @U1 0.6 nozzle");

    // Convert and verify output matches preview
    await convertAndWait(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
    const output = new Uint8Array(readFileSync(await download.path()));
    const settings = settingsOf(output);
    const filamentIds = settings.filament_settings_id as string[];
    const previewNames = await swatches.allTextContents();
    expect(filamentIds.slice(0, 3)).toEqual(previewNames.map((n) => n.trim()));
    expect(filamentIds.slice(0, 3)).toEqual([
      "Snapmaker PLA SnapSpeed @U1 0.6 nozzle",
      "Snapmaker PLA SnapSpeed @U1 0.6 nozzle",
      "Snapmaker PLA Matte @U1 0.6 nozzle",
    ]);
    expect(filamentIds[3]).toBe(filamentIds[2]);
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
      await expect(alert).toContainText("No Snapmaker or Generic preset fits PA-GF at this nozzle size, so its name and settings stay as the creator had them. Snapmaker Space may refuse this file.");

      const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
      const settings = settingsOf(new Uint8Array(readFileSync(await download.path())));
      const filamentIds = settings.filament_settings_id as string[];
      const previewNames = await swatches.allTextContents();
      expect(filamentIds.slice(0, 3)).toEqual(previewNames.map((n) => n.trim()));
      expect(filamentIds.slice(0, 3)).toEqual(["Snapmaker PLA SnapSpeed @U1", "Generic PETG", "Bambu PA6-GF @BBL X1C"]);
      expect(filamentIds[3]).toBe(filamentIds[2]);

      await waitForAnimations(page);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
      ).toEqual([]);
    });
  });
}


test.describe("Polymaker filament option", () => {
  const sevenPlates = readFileSync(
    fileURLToPath(
      new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url),
    ),
  );

  test("order is Original, Snapmaker, Polymaker, Generic in inspector and batch; 0.4 mm Polymaker converts PLAs to Polymaker and falls back others; 0.6 mm disables Polymaker and switches to Snapmaker", async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");
    await openProject(page, "seven-plates.3mf", sevenPlates);

    // 1. Exact option order in inspector
    const inspectorLabels = await page
      .locator(".compliance-wrapper .segment-btn .segment-label")
      .allTextContents();
    expect(inspectorLabels).toEqual(["Original", "Snapmaker", "Polymaker", "Generic"]);

    // Keyboard through all four choices at 0.4 mm
    const origBtn = page.getByTestId("filament-mode-original");
    const snapBtn = page.getByTestId("filament-mode-snapmaker");
    const polyBtn = page.getByTestId("filament-mode-polymaker");
    const genBtn = page.getByTestId("filament-mode-generic");
    await origBtn.focus();
    await page.keyboard.press("Tab");
    await expect(snapBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(polyBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(genBtn).toBeFocused();

    // 2. At 0.4 mm with Polymaker: PLAs -> Polymaker General PLA Family @U1, PETG -> Generic PETG, ABS/ASA -> Snapmaker ABS/ASA
    await polyBtn.click();
    await expect(polyBtn).toHaveAttribute("aria-checked", "true");
    await convertAndWait(page);

    const swatchNames = await page.locator(".swatch-card .swatch-name").allTextContents();
    expect(swatchNames[0]).toBe("Polymaker General PLA Family @U1");
    expect(swatchNames[1]).toBe("Polymaker General PLA Family @U1");
    expect(swatchNames[2]).toContain("Generic PETG");
    expect(swatchNames[3]).toBe("Polymaker General PLA Family @U1");
    expect(swatchNames[4]).toContain("Snapmaker ABS");
    expect(swatchNames[5]).toContain("Snapmaker ASA");

    await expect(page.locator(".compliance-wrapper .fallback-alert")).toContainText(
      "Polymaker makes no U1 preset for PETG, ABS and ASA at this nozzle size, so those get the preset the Snapmaker option gives them.",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-button").click(),
    ]);
    const outBytes = new Uint8Array(readFileSync((await download.path())!));
    const convertedNames = settingsOf(outBytes).filament_settings_id as string[];
    expect(convertedNames[0]).toBe("Polymaker General PLA Family @U1");
    expect(convertedNames[1]).toBe("Polymaker General PLA Family @U1");
    expect(convertedNames[2]).toContain("Generic PETG");
    expect(convertedNames[3]).toBe("Polymaker General PLA Family @U1");
    expect(convertedNames[4]).toContain("Snapmaker ABS");
    expect(convertedNames[5]).toContain("Snapmaker ASA");

    // 3. Switching to 0.6 mm while Polymaker is selected disables Polymaker with reason and switches to Snapmaker
    await page.getByTestId("nozzle-size-select").selectOption("0.6");
    await expect(polyBtn).toBeDisabled();
    await expect(page.getByTestId("polymaker-disabled-reason")).toHaveText(
      "Snapmaker Orca has Polymaker presets for the 0.4 mm nozzle only.",
    );
    await expect(snapBtn).toHaveAttribute("aria-checked", "true");

    // 4. Batch view shows the same Original, Snapmaker, Polymaker, Generic order
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles([
      { name: "batch-a.3mf", mimeType: "application/octet-stream", buffer: sevenPlates },
      { name: "batch-b.3mf", mimeType: "application/octet-stream", buffer: sevenPlates },
    ]);
    await expect(page.getByRole("button", { name: /Convert All/i })).toBeVisible();
    const batchLabels = await page
      .locator(".compliance-wrapper")
      .first()
      .locator(".segment-btn .segment-label")
      .allTextContents();
    expect(batchLabels).toEqual(["Original", "Snapmaker", "Polymaker", "Generic"]);
  });

  test("Filament section with Polymaker passes axe in light and dark themes at 1440px and 390px @appearance", async ({ page }) => {
    await removeSavePicker(page);
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await openProject(page, "seven-plates.3mf", sevenPlates);
      await page.getByTestId("filament-mode-polymaker").click();
      await convertAndWait(page);

      for (const width of [1440, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        await waitForAnimations(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal overflow at ${width}px (${scheme})`).toBeLessThanOrEqual(0);
        const axe = await new AxeBuilder({ page }).include(".compliance-wrapper").analyze();
        expect(axe.violations, `axe clean on Filament section at ${width}px (${scheme})`).toEqual([]);
      }
    }
  });
});
