// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  convertAndWait,
  demoModel,
  file,
  openProject,
  removeSavePicker,
  SCHEMES,
  settingsOf,
  stampOf,
  waitForAnimations,
} from "./helpers";
import { FILAMENT_COMPLIANCE_OPTIONS } from "../src/lib/filamentComplianceCopy";

const PRUSA_SCENE_PATH = fileURLToPath(
  new URL("../../../packages/core/src/test-fixtures/prusaslicer/prusaslicer-2.9.6-scene.3mf", import.meta.url),
);
const PRUSA_BEDS_296_PATH = fileURLToPath(
  new URL("../../../packages/core/src/test-fixtures/prusaslicer/prusaslicer-2.9.6-beds.3mf", import.meta.url),
);
const PRUSA_BEDS_297_PATH = fileURLToPath(
  new URL("../../../packages/core/src/test-fixtures/prusaslicer/prusaslicer-2.9.7-beds.3mf", import.meta.url),
);

const prusaScene = readFileSync(PRUSA_SCENE_PATH);
const prusaBeds296 = readFileSync(PRUSA_BEDS_296_PATH);
const prusaBeds297 = readFileSync(PRUSA_BEDS_297_PATH);

test.describe("PrusaSlicer projects through the web app", { tag: "@appearance" }, () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");
  });

  test("1. prusaslicer-2.9.6-scene.3mf converts with Snapmaker U1 printer model, four extruder colors in order, and prusaslicer 2.9.6 source stamp", async ({
    page,
  }) => {
    await openProject(page, "prusaslicer-2.9.6-scene.3mf", prusaScene);
    await convertAndWait(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-button").click(),
    ]);
    const output = new Uint8Array(readFileSync((await download.path())!));
    const settings = settingsOf(output);
    const stamp = stampOf(output) as { source?: unknown } | null;

    expect(settings.printer_model).toBe("Snapmaker U1");
    expect(settings.filament_colour).toEqual(["#000000", "#0000FF", "#21FF06", "#FB0207"]);
    expect(stamp?.source).toEqual({ format: "prusaslicer", slicerVersion: "2.9.6" });
  });

  test("2. converting prusaslicer-2.9.6-scene.3mf shows notes about extruder colors, settings with no Snapmaker Orca counterpart, and color changes becoming pauses", async ({
    page,
  }) => {
    await openProject(page, "prusaslicer-2.9.6-scene.3mf", prusaScene);
    await convertAndWait(page);

    const notes = page.getByTestId("status-warning");
    await expect(notes).toBeVisible();
    await expect(notes).toContainText("taken from the printer's extruder colors");
    await expect(notes).toContainText("PrusaSlicer settings have no Snapmaker Orca counterpart");
    await expect(notes).toContainText("color change(s) at set heights become pauses at the same heights");
  });

  test("3. prusaslicer-2.9.6-beds.3mf shows four plate tabs and converts into four plates with no_brim and snug supports", async ({
    page,
  }) => {
    await openProject(page, "prusaslicer-2.9.6-beds.3mf", prusaBeds296);

    const plateTabs = page.locator(".plate-tabs .tab-btn");
    await expect(plateTabs).toHaveCount(4);
    for (let i = 1; i <= 4; i++) {
      await expect(plateTabs.nth(i - 1)).toContainText(`Plate ${i}`);
    }

    await convertAndWait(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-button").click(),
    ]);
    const output = new Uint8Array(readFileSync((await download.path())!));
    const entries = unzipSync(output);
    const modelSettings = strFromU8(entries["Metadata/model_settings.config"]!);
    const settings = settingsOf(output);

    expect((modelSettings.match(/<plate>/g) ?? []).length).toBe(4);
    expect(settings.brim_type).toBe("no_brim");
    expect(settings.enable_support).toBe("1");
    expect(settings.support_style).toBe("snug");
  });

  test("4. prusaslicer-2.9.7-beds.3mf converts with no note about settings it doesn't know", async ({
    page,
  }) => {
    await openProject(page, "prusaslicer-2.9.7-beds.3mf", prusaBeds297);
    await convertAndWait(page);

    const notes = page.getByTestId("status-warning");
    await expect(notes).toBeVisible();
    await expect(notes).not.toContainText("aren't known here");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-button").click(),
    ]);
    const output = new Uint8Array(readFileSync((await download.path())!));
    const stamp = stampOf(output) as { source?: unknown } | null;
    expect(stamp?.source).toEqual({ format: "prusaslicer", slicerVersion: "2.9.7" });
  });

  test("5. batch mode converts a PrusaSlicer project and a Bambu Studio project and stamps each with its own source", async ({
    page,
  }) => {
    await page.getByTestId("file-input").setInputFiles([
      file("prusa-scene.3mf", prusaScene),
      file("bambu-demo.3mf", demoModel),
    ]);

    const batchView = page.getByTestId("batch-view");
    await expect(batchView).toBeVisible();
    await expect(
      batchView.getByText(FILAMENT_COMPLIANCE_OPTIONS[0].description),
    ).toBeVisible();

    const convertAllBtn = page.getByRole("button", { name: /convert all/i });
    await expect(convertAllBtn).toBeVisible();
    await convertAllBtn.click();

    const downloadZipBtn = page.getByTestId("download-batch-zip");
    await expect(downloadZipBtn).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadZipBtn.click(),
    ]);
    const zipBytes = new Uint8Array(readFileSync((await download.path())!));
    const archive = unzipSync(zipBytes);

    expect(Object.keys(archive).sort()).toEqual(["bambu-demo_U1.3mf", "prusa-scene_U1.3mf"]);

    const prusaStamp = stampOf(archive["prusa-scene_U1.3mf"]!) as { source?: { format?: string; slicerVersion?: string } } | null;
    const bambuStamp = stampOf(archive["bambu-demo_U1.3mf"]!) as { source?: { format?: string } } | null;

    expect(prusaStamp?.source).toEqual({ format: "prusaslicer", slicerVersion: "2.9.6" });
    expect(bambuStamp?.source?.format).toBe("bambu-family");
  });

  test("6. after converting prusaslicer-2.9.6-beds.3mf, What changed panel lists brim type and support settings among settings carried", async ({
    page,
  }) => {
    await openProject(page, "prusaslicer-2.9.6-beds.3mf", prusaBeds296);
    await convertAndWait(page);

    await page.getByTestId("what-changed-trigger").click();
    const panel = page.getByTestId("what-changed-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("From the creator's file");
    await expect(panel).toContainText("Others > Brim > Brim type");
    await expect(panel).toContainText("no_brim");
    await expect(panel).toContainText("Support > Enable support");
    await expect(panel).toContainText("Support > On build plate only");
    await expect(panel).toContainText("Support > Style");
    await expect(panel).toContainText("snug");
    await expect(panel).toContainText("Support > Type");
  });

  test("7. refuses a SuperSlicer project built on PrusaSlicer, naming SuperSlicer and the supported slicers without offering a download", async ({
    page,
  }) => {
    const entries = unzipSync(new Uint8Array(prusaScene));
    const config = strFromU8(entries["Metadata/Slic3r_PE.config"]!).replace(
      /^; generated by PrusaSlicer [^\n]*/m,
      "; generated by SuperSlicer 2.5.59.13 on 2026-01-01 at 00:00:00 UTC",
    );
    entries["Metadata/Slic3r_PE.config"] = strToU8(config);
    const superSlicerBuf = Buffer.from(zipSync(entries));

    await page.getByTestId("file-input").setInputFiles(file("superslicer.3mf", superSlicerBuf));

    const errorBanner = page.getByTestId("status-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("SuperSlicer");
    for (const slicer of [
      "Bambu Studio",
      "Creality Print",
      "Anycubic Slicer Next",
      "ElegooSlicer",
      "Flash Studio",
      "QIDI Studio",
      "PrusaSlicer",
    ]) {
      await expect(errorBanner).toContainText(slicer);
    }
    await expect(page.getByTestId("convert-button")).toBeHidden();
    await expect(page.getByTestId("download-button")).toBeHidden();
  });

  for (const scheme of SCHEMES) {
    test.describe(`${scheme} theme`, () => {
      test.use({ colorScheme: scheme });

      test("converted PrusaSlicer multi-bed project, FAQ answers, and filament names setting pass axe at 1440px and 390px", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/faq");

        // Verify updated FAQ answers on /faq
        await page.locator("#faq-question-convert-bambu-3mf-to-u1").click();
        await expect(
          page.getByText("Drag any Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI or Prusa"),
        ).toBeVisible();

        await page.locator("#faq-question-compliance-mode").click();
        await expect(page.locator("#faq-answer-compliance-mode").getByText("Prusament PLA", { exact: true })).toBeVisible();

        await page.goto("/");
        await openProject(page, "prusaslicer-2.9.6-beds.3mf", prusaBeds296);

        await convertAndWait(page);
        await page.getByTestId("what-changed-trigger").click();
        await expect(page.getByTestId("what-changed-panel")).toBeVisible();
        await waitForAnimations(page);

        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations).toEqual([]);

        for (const width of [1440, 390] as const) {
          await page.setViewportSize({ width, height: 900 });
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `no horizontal overflow at ${width}px (${scheme})`).toBeLessThanOrEqual(0);
        }
      });
    });
  }
});
