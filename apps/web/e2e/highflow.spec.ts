// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { convertAndWait, openProject, removeSavePicker, SCHEMES, settingsOf, stampOf, VIEWPORTS } from "./helpers";

// Stock U1: every toolhead has the standard hotend; a high-flow choice changes only the toolheads picked.
const STOCK = ["standard", "standard", "standard", "standard"];

async function convertedOutput(page: Page): Promise<Uint8Array> {
  await convertAndWait(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  return new Uint8Array(readFileSync(await download.path()));
}

const chip = (page: Page, n: number) => page.getByTestId(`high-flow-toolhead-${n}`);

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
  await openProject(page);
});

test("the control starts off, with no toolheads recorded", async ({ page }) => {
  await expect(page.getByTestId("high-flow-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(chip(page, 1)).toBeHidden();
  const output = await convertedOutput(page);
  expect(settingsOf(output).nozzle_volume_type).toEqual(STOCK);
  expect(stampOf(output)?.options.highFlowHotends).toBe(false);
});

test("turning it on offers T1 to T4 and All, none selected, and sends nothing until one is picked", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  for (const n of [1, 2, 3, 4]) await expect(chip(page, n)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("high-flow-all")).toBeVisible();
  const output = await convertedOutput(page);
  expect(settingsOf(output).nozzle_volume_type).toEqual(STOCK);
  expect(stampOf(output)?.options.highFlowHotends).toBe(false);
});

test("the chosen toolheads end up in the converted file and its stamp", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 1).click();
  await chip(page, 3).click();
  await expect(chip(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, 2)).toHaveAttribute("aria-pressed", "false");
  const output = await convertedOutput(page);
  const settings = settingsOf(output);
  expect(settings.nozzle_volume_type).toEqual(["high_flow", "standard", "high_flow", "standard"]);
  expect(settings.process_flow_support).toEqual(["standard", "high_flow"]);
  expect(stampOf(output)?.options.highFlowHotends).toEqual([true, false, true, false]);
});

test("All selects all four toolheads", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await page.getByTestId("high-flow-all").click();
  for (const n of [1, 2, 3, 4]) await expect(chip(page, n)).toHaveAttribute("aria-pressed", "true");
  const output = await convertedOutput(page);
  expect(settingsOf(output).nozzle_volume_type).toEqual(["high_flow", "high_flow", "high_flow", "high_flow"]);
  expect(stampOf(output)?.options.highFlowHotends).toEqual([true, true, true, true]);
});

test("switching it off sends nothing but remembers the selection", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 2).click();
  await page.getByTestId("high-flow-toggle").click();
  await expect(chip(page, 2)).toBeHidden();
  expect(settingsOf(await convertedOutput(page)).nozzle_volume_type).toEqual(STOCK);
  await page.getByTestId("high-flow-toggle").click();
  await expect(chip(page, 2)).toHaveAttribute("aria-pressed", "true");
});

test("the selection survives a reload", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 4).click();
  await page.reload();
  await openProject(page);
  await expect(page.getByTestId("high-flow-toggle")).toHaveAttribute("aria-checked", "true");
  await expect(chip(page, 4)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, 1)).toHaveAttribute("aria-pressed", "false");
});

test("a stored selection that isn't exactly four booleans is ignored, not trusted", async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem("any2orca_high_flow_toolheads", JSON.stringify([true, "yes", 1, null, true]));
    sessionStorage.setItem("any2orca_high_flow_installed", "true");
  });
  await page.reload();
  await openProject(page);
  for (const n of [1, 2, 3, 4]) await expect(chip(page, n)).toHaveAttribute("aria-pressed", "false");
});

test("a new visit starts with nothing selected, and old saved settings are ignored", async ({ page, context }) => {
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 2).click();
  await page.evaluate(() => {
    localStorage.setItem("any2orca_high_flow_hotend", "true");
    localStorage.setItem("any2orca_high_flow_toolheads", JSON.stringify([true, true, true, true]));
    localStorage.setItem("any2orca_high_flow_installed", "true");
  });
  const nextVisit = await context.newPage(); // a new tab is a new visit: it gets its own session storage
  await removeSavePicker(nextVisit);
  await nextVisit.goto("/");
  await openProject(nextVisit);
  await expect(nextVisit.getByTestId("high-flow-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(nextVisit.getByTestId("high-flow-summary")).toContainText(/none/i);
  await nextVisit.getByTestId("high-flow-toggle").click();
  for (const n of [1, 2, 3, 4]) await expect(nextVisit.getByTestId(`high-flow-toolhead-${n}`)).toHaveAttribute("aria-pressed", "false");
});

test("the summary near Convert always shows the current choice", async ({ page }) => {
  const summary = page.getByTestId("high-flow-summary");
  await expect(summary).toContainText(/none/i);
  await page.getByTestId("high-flow-toggle").click();
  await expect(summary).toContainText(/none/i);
  await chip(page, 1).click();
  await chip(page, 3).click();
  await expect(summary).toContainText("T1");
  await expect(summary).toContainText("T3");
  await expect(summary).not.toContainText("T2");
  await chip(page, 1).click();
  await expect(summary).not.toContainText("T1");
  await page.getByTestId("high-flow-toggle").click(); // switch off: nothing is sent, so the summary says none
  await expect(summary).toContainText(/none/i);
});

test("the High-Flow Speeds badge does not overflow the inspector card at 1440px wide", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 1).click();
  const badge = page.locator(".badge-high-flow");
  await expect(badge).toBeVisible();
  const card = page.locator(".inspector-panel");
  const badgeBox = await badge.boundingBox();
  const cardBox = await card.boundingBox();
  expect(badgeBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(badgeBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
});

test("the High-Flow Speeds badge does not overflow the inspector card at 390px wide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 1).click();
  const badge = page.locator(".badge-high-flow");
  await expect(badge).toBeVisible();
  const card = page.locator(".inspector-panel");
  const badgeBox = await badge.boundingBox();
  const cardBox = await card.boundingBox();
  expect(badgeBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  expect(badgeBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
});

test("the chips work from the keyboard", async ({ page }) => {
  await page.getByTestId("high-flow-toggle").click();
  await chip(page, 2).focus();
  await page.keyboard.press("Space");
  await expect(chip(page, 2)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(chip(page, 2)).toHaveAttribute("aria-pressed", "false");
});

for (const scheme of SCHEMES) {
  test.describe(`${scheme}, control open with toolheads selected`, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("has no accessibility violations", async ({ page }) => {
      await page.getByTestId("high-flow-toggle").click();
      await chip(page, 1).click();
      await chip(page, 3).click();
      await page.waitForTimeout(500);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  });
}

test.describe("phone width", () => {
  test.use({ viewport: VIEWPORTS.phone });

  test("the chips fit without horizontal scrolling", async ({ page }) => {
    await page.getByTestId("high-flow-toggle").click();
    await chip(page, 1).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const n of [1, 2, 3, 4]) await expect(chip(page, n)).toBeVisible();
  });
});
