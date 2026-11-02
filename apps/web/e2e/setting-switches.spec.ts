// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoModel, file, openProject, removeSavePicker, SCHEMES, VIEWPORTS, waitForAnimations } from "./helpers";

// The side panel's on/off settings share one control, so they look and behave alike.
const SWITCHES = [
  { testId: "high-flow-toggle", name: "Liber High Flow", on: false },
  { testId: "hardened-nozzle-toggle", name: "Hardened steel nozzles", on: false },
  { testId: "stamp-toggle", name: "Version note", on: true },
];

async function rightEdges(page: Page): Promise<number[]> {
  return Promise.all(
    SWITCHES.map(async ({ testId }) => {
      const box = await page.getByTestId(testId).boundingBox();
      if (!box) throw new Error(`${testId} has no box`);
      return Math.round(box.x + box.width);
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test("each setting is a named switch that its label, a click and the keyboard all turn on and off", async ({ page }) => {
  await page.goto("/");
  await openProject(page);
  for (const { testId, name, on } of SWITCHES) {
    const control = page.getByRole("switch", { name, exact: true });
    await expect(control).toHaveAttribute("data-testid", testId);
    await expect(control).toHaveAttribute("aria-checked", String(on));
    await page.locator(`label[for="${await control.getAttribute("id")}"]`).click();
    await expect(control).toHaveAttribute("aria-checked", String(!on));
    await control.focus();
    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-checked", String(on));
  }
});

test("the switches line up in one column, in the side panel and in the batch view", async ({ page }) => {
  await page.goto("/");
  await openProject(page);
  expect(new Set(await rightEdges(page)).size).toBe(1);

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
  await expect(page.getByTestId("batch-view")).toBeVisible();
  await expect(page.getByTestId("hardened-nozzle-toggle")).toBeVisible();
  expect(new Set(await rightEdges(page)).size).toBe(1);
});

for (const scheme of SCHEMES) {
  test.describe(`${scheme}`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme });

    test("the switches, off and on, have no accessibility violations", async ({ page }) => {
      await page.goto("/");
      await openProject(page);
      await page.getByTestId("hardened-nozzle-toggle").click();
      await waitForAnimations(page);
      const { violations } = await new AxeBuilder({ page }).include(".setting-switch").analyze();
      expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  });
}

test.describe("phone width", { tag: "@appearance" }, () => {
  test.use({ viewport: VIEWPORTS.phone });

  test("the switches fit without sideways scrolling", async ({ page }) => {
    await page.goto("/");
    await openProject(page);
    for (const { testId } of SWITCHES) await page.getByTestId(testId).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(new Set(await rightEdges(page)).size).toBe(1);
  });
});
