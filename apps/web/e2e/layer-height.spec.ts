// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { strToU8, unzipSync, zipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { SCHEMES, convertAndWait, demoModel, file, openProject, removeSavePicker, waitForAnimations } from "./helpers";

const sevenPlates = readFileSync(
  fileURLToPath(new URL("../../../packages/core/src/test-fixtures/sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf", import.meta.url)),
);

const RANGES_XML =
  '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="3">\n  <range min_z="5" max_z="10">\n   <option opt_key="extruder">2</option>\n   <option opt_key="layer_height">0.1</option>\n  </range>\n </object>\n</objects>\n';

function buildThinRangeFixture(): Buffer {
  const entries = unzipSync(new Uint8Array(sevenPlates));
  entries["Metadata/layer_config_ranges.xml"] = strToU8(RANGES_XML);
  return Buffer.from(zipSync(entries, { level: 0 }));
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test("0.6 mm nozzle warns about 0.1 mm layers, offers 0.18 mm beside the note, and choosing 0.18 mm replaces the note; 0.4 mm nozzle needs none", async ({ page }) => {
  const fixture = buildThinRangeFixture();
  await openProject(page, "thin-range.3mf", fixture);

  const nozzleSelect = page.getByTestId("nozzle-size-select");
  const layerSelect = page.getByTestId("layer-height-select");

  // 1. On 0.4 mm nozzle (supports 0.1 mm layers): default is "Keep the creator's layers", no layer note, no banner offer
  await expect(layerSelect).toHaveValue("");
  await expect(layerSelect.locator("option").first()).toHaveText("Keep the creator's layers");
  await convertAndWait(page);
  const banner = page.getByTestId("status-warning");
  await expect(banner).not.toContainText("The project has layers as");
  await expect(page.getByTestId("layer-height-banner-action")).toHaveCount(0);

  // HelpTip (?) explains what the control does in plain words and closes on Escape
  const helpBtn = page.getByTestId("helptip-btn-layer-height");
  await helpBtn.click();
  const helpPopover = page.locator("#helptip-popover-layer-height");
  await expect(helpPopover).toBeVisible();
  await expect(helpPopover).toContainText("Converts the project with one layer height for every layer");
  await page.keyboard.press("Escape");
  await expect(helpPopover).toBeHidden();
  await expect(helpBtn).toBeFocused();

  // 2. Switch to 0.6 mm nozzle: dropdown updates to 0.6 mm heights (0.18, 0.24, 0.30 mm), auto-reconverts, shows 0.1 mm note + banner button
  await nozzleSelect.selectOption("0.6");
  const optionLabels = await layerSelect.locator("option").allTextContents();
  expect(optionLabels).toEqual(["Keep the creator's layers", "0.18 mm", "0.24 mm", "0.30 mm"]);

  await expect(banner).toContainText("as thin as 0.1 mm", { timeout: 20_000 });
  const bannerAction = page.getByTestId("layer-height-banner-action");
  await expect(bannerAction).toBeVisible();
  const applyBtn = page.getByTestId("apply-nearest-layer-height");
  await expect(applyBtn).toHaveText("Use 0.18 mm for every layer");

  // 3. Click the banner button to apply 0.18 mm -> re-converts, shows profile note, hides layer-outside note & banner action
  await applyBtn.click();
  await expect(layerSelect).toHaveValue("0.18");
  await expect(banner).toContainText("Every layer is 0.18 mm, as you chose.", { timeout: 20_000 });
  await expect(banner).not.toContainText("The project has layers as");
  await expect(bannerAction).toHaveCount(0);

  // 4. Reach the dropdown by keyboard (Tab right after its help button) and switch back to "Keep the creator's layers"
  await helpBtn.focus();
  await page.keyboard.press("Tab");
  await expect(layerSelect).toBeFocused();
  await layerSelect.selectOption("");
  await expect(layerSelect).toHaveValue("");
  await expect(banner).toContainText("as thin as 0.1 mm", { timeout: 20_000 });
  await expect(bannerAction).toBeVisible();
});

test("batch view takes the global layer height setting for every file", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([
    file("batch-one.3mf", demoModel),
    file("batch-two.3mf", buildThinRangeFixture()),
  ]);
  await expect(page.getByRole("button", { name: /Convert All/i })).toBeVisible();

  await page.getByTestId("nozzle-size-select").selectOption("0.6");
  await page.getByTestId("layer-height-select").selectOption("0.18");
  await page.getByRole("button", { name: /Convert All/i }).click();
  await expect(page.getByTestId("download-batch-zip")).toBeVisible({ timeout: 30_000 });

  // Second file had 0.1 mm range; with 0.18 mm chosen, its Conversion Notes show "Every layer is 0.18 mm, as you chose."
  const secondExpand = page.locator(".card-expand-btn").nth(1);
  if ((await secondExpand.getAttribute("aria-expanded")) !== "true") {
    await secondExpand.click();
  }
  const secondCard = page.locator(".staged-card").nth(1);
  await expect(secondCard).toContainText("Every layer is 0.18 mm, as you chose.");
});

test("layer height control and out-of-range banner pass axe and wrap cleanly in light and dark themes at 1440px and 390px @appearance", async ({ page }) => {
  const fixture = buildThinRangeFixture();
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await openProject(page, "thin-range.3mf", fixture);
    await page.getByTestId("nozzle-size-select").selectOption("0.6");
    await convertAndWait(page);
    await expect(page.getByTestId("layer-height-banner-action")).toBeVisible({ timeout: 20_000 });

    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await waitForAnimations(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal overflow at ${width}px (${scheme})`).toBeLessThanOrEqual(0);
      const bannerAxe = await new AxeBuilder({ page }).include('[data-testid="status-warning"]').analyze();
      expect(bannerAxe.violations, `axe clean on banner at ${width}px (${scheme})`).toEqual([]);
      const controlAxe = await new AxeBuilder({ page }).include(".layer-height-card").analyze();
      expect(controlAxe.violations, `axe clean on layer height control at ${width}px (${scheme})`).toEqual([]);
    }
  }
});
