// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, settingsOf, stampOf } from "./helpers";

// Once a file is converted, changing any setting converts it again, so the download always matches the side panel.

const PRESETS = {
  format: "any2orca-presets",
  version: 1,
  presets: [
    {
      name: "Four walls",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
      changes: { wall_loops: "4" },
      created: "2026-10-31",
    },
  ],
};

async function downloaded(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  return new Uint8Array(readFileSync(await download.path()));
}

/** Polls the download until it shows the change: the new conversion runs in the background. */
async function expectDownload(page: Page, read: (bytes: Uint8Array) => unknown, expected: unknown): Promise<void> {
  await expect.poll(async () => read(await downloaded(page)), { timeout: 30_000 }).toEqual(expected);
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.addInitScript((val) => localStorage.setItem("any2orca_presets", JSON.stringify(val)), PRESETS);
  await page.goto("/");
  await openProject(page);
  await convertAndWait(page);
});

test("hardened nozzles", async ({ page }) => {
  expect(settingsOf(await downloaded(page)).nozzle_type).toBe("stainless_steel");
  await page.getByTestId("hardened-nozzle-toggle").check();
  await expectDownload(page, (b) => settingsOf(b).nozzle_type, "hardened_steel");
});

test("high-flow toolheads", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await page.getByTestId("high-flow-toolhead-1").click();
  await expectDownload(page, (b) => stampOf(b)?.options.highFlowHotends, [true, false, false, false]);
});

test("filament names", async ({ page }) => {
  await page.getByTestId("filament-mode-snapmaker").click();
  await expectDownload(page, (b) => (settingsOf(b).filament_settings_id as string[]).every((name) => name.startsWith("Snapmaker")), true);
});

test("the version note", async ({ page }) => {
  await page.getByTestId("stamp-toggle").uncheck();
  await expectDownload(page, (b) => Object.keys(unzipSync(b)).includes("Metadata/any2orca.json"), false);
});

test("a tuned preset", async ({ page }) => {
  await page.getByTestId("preset-picker").selectOption("Four walls");
  await expectDownload(page, (b) => settingsOf(b).wall_loops, "4");
});

test("converts once per change, then stays done", async ({ page }) => {
  await page.getByTestId("hardened-nozzle-toggle").check();
  await expectDownload(page, (b) => settingsOf(b).nozzle_type, "hardened_steel");
  // No conversion starts again by itself: the finished state holds, with the same file.
  const before = await downloaded(page);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(500);
    await expect(page.getByTestId("download-button")).toBeVisible();
  }
  expect(Buffer.compare(Buffer.from(await downloaded(page)), Buffer.from(before))).toBe(0);
});

test("in the batch view, the zip is rebuilt for the new settings, and can't be downloaded meanwhile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
  await expect(page.getByTestId("batch-view")).toBeVisible();
  await page.getByRole("button", { name: /Convert All/ }).click();
  const zipButton = page.getByTestId("download-batch-zip");
  await expect(zipButton).toBeEnabled({ timeout: 60_000 });
  // The update can be over in a moment for small files, so watch the button from inside the page instead of sampling it.
  await zipButton.evaluate((button) => {
    const seen: boolean[] = [];
    (window as unknown as { zipDisabledStates: boolean[] }).zipDisabledStates = seen;
    new MutationObserver(() => seen.push((button as HTMLButtonElement).disabled)).observe(button, { attributes: true, attributeFilter: ["disabled"] });
  });
  await page.getByTestId("hardened-nozzle-toggle").check();
  // Disabled at some point while it updated, and enabled again at the end (one record per change, read when it lands).
  await expect
    .poll(async () => {
      const states = await page.evaluate(() => (window as unknown as { zipDisabledStates: boolean[] }).zipDisabledStates);
      return states.includes(true) && states.at(-1) === false;
    }, { timeout: 60_000 })
    .toBe(true);
  await expect(zipButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), zipButton.click()]);
  const entries = unzipSync(new Uint8Array(readFileSync(await download.path())));
  const projects = Object.entries(entries).filter(([name]) => name.endsWith(".3mf"));
  expect(projects).toHaveLength(2);
  for (const [name, bytes] of projects) expect(settingsOf(bytes).nozzle_type, name).toBe("hardened_steel");
});
