// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openProject, removeSavePicker } from "./helpers";

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
});

test.describe("Modal focus trapping, Escape handling, and accessibility", () => {
  test("Privacy modal: keyboard open, focus inside, Tab trapped 10x, Escape closes and returns focus, axe clean", async ({ page }) => {
    const opener = page.getByTestId("privacy-open");
    await opener.focus();
    await page.keyboard.press("Enter");

    const modal = page.locator(".modal-card").filter({ hasText: /Privacy Guarantee/i });
    await expect(modal).toBeVisible();

    // Assert focus is inside the modal
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Axe check for aria-dialog-name
    const { violations } = await new AxeBuilder({ page }).include(".modal-card").analyze();
    const nameViolations = violations.filter((v) => v.id === "aria-dialog-name");
    expect(nameViolations).toEqual([]);

    // Tab 10 times, focus never leaves
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // Escape closes modal
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();

    // Focus returned to opener
    await expect(opener).toBeFocused();
  });

  test("Advanced (Presets) modal: keyboard open, focus inside, Tab trapped 10x, Escape closes and returns focus", async ({ page }) => {
    const opener = page.getByRole("button", { name: /^Advanced$/ });
    await opener.focus();
    await page.keyboard.press("Enter");

    const modal = page.locator(".presets-modal");
    await expect(modal).toBeVisible();

    // Focus inside
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Axe check for aria-dialog-name
    const { violations } = await new AxeBuilder({ page }).include(".presets-modal").analyze();
    const nameViolations = violations.filter((v) => v.id === "aria-dialog-name");
    expect(nameViolations).toEqual([]);

    // Tab 10 times, focus never leaves
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // Escape closes modal
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();

    // Focus returned to opener
    await expect(opener).toBeFocused();
  });

  test("Compare modal: keyboard open, focus inside, Tab trapped 10x, Escape closes and returns focus", async ({ page }) => {
    // Open Advanced then switch to Compare
    const opener = page.getByRole("button", { name: /^Advanced$/ });
    await opener.focus();
    await page.keyboard.press("Enter");

    const compareTab = page.getByRole("tab", { name: "Compare Settings" });
    await compareTab.click();

    const modal = page.locator(".compare-modal");
    await expect(modal).toBeVisible();

    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Axe check for aria-dialog-name
    const { violations } = await new AxeBuilder({ page }).include(".compare-modal").analyze();
    const nameViolations = violations.filter((v) => v.id === "aria-dialog-name");
    expect(nameViolations).toEqual([]);

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
});
