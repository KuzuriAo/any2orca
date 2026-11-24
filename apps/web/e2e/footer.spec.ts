// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { removeSavePicker } from "./helpers";

async function setHtmlDataHide(page: Page, hideValue: string) {
  await page.route("**/*", async (route) => {
    try {
      const url = route.request().url();
      if (url.endsWith("/") || url.includes("index.html")) {
        const response = await route.fetch();
        let body = await response.text();
        body = body.replace(/(<html\b[^>]*)(>)/i, `$1 data-hide="${hideValue}"$2`);
        await route.fulfill({ response, body });
      } else {
        await route.continue();
      }
    } catch (err) {
      if (page.isClosed()) return;
      throw err;
    }
  });
}

test.describe("footer layout, consistency, and accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("layout adapts across 1440, 1024, 768, and 390 px with no overflow and consistent separators", { tag: "@appearance" }, async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900, expectSideBySide: true },
      { width: 1024, height: 900, expectSideBySide: true },
      { width: 768, height: 900, expectSideBySide: false },
      { width: 390, height: 844, expectSideBySide: false },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      const footer = page.locator("footer.app-footer");
      await expect(footer).toBeVisible();

      const leftBox = await footer.locator(".footer-left").boundingBox();
      const rightBox = await footer.locator(".footer-right").boundingBox();
      const kofiBox = await footer.locator(".kofi-badge-link").boundingBox();
      const footerBox = await footer.boundingBox();
      expect(leftBox && rightBox && kofiBox && footerBox).toBeTruthy();

      // Zero horizontal overflow
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);

      if (vp.expectSideBySide) {
        // Two columns side by side
        expect(rightBox!.x).toBeGreaterThanOrEqual(leftBox!.x + leftBox!.width - 1);
        expect(Math.abs(rightBox!.y - leftBox!.y)).toBeLessThanOrEqual(4);
        // Ko-fi aligned to the right edge of the right column
        expect(Math.abs((kofiBox!.x + kofiBox!.width) - (rightBox!.x + rightBox!.width))).toBeLessThanOrEqual(2);
      } else {
        // Stacked vertically and left-aligned (including Ko-fi)
        expect(rightBox!.y).toBeGreaterThanOrEqual(leftBox!.y + leftBox!.height - 1);
        expect(Math.abs(rightBox!.x - leftBox!.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(kofiBox!.x - leftBox!.x)).toBeLessThanOrEqual(2);
      }

      // Exactly one separator character across both rows
      const seps = await footer.locator(".sep").allTextContents();
      expect(seps.length).toBeGreaterThan(0);
      expect(new Set(seps.map((s) => s.trim()))).toEqual(new Set(["·"]));

      // Ko-fi link at full opacity
      const kofiOpacity = await footer.locator(".kofi-badge-link").evaluate((el) => parseFloat(getComputedStyle(el).opacity));
      expect(kofiOpacity).toBe(1);
    }

    // Axe passes on footer in both dark and light mode
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(200);
      const violations = (await new AxeBuilder({ page }).include("footer.app-footer").analyze()).violations;
      expect(violations).toEqual([]);
    }
  });

  test("no separator hangs at the end of a wrapped line at 390 px and 768 px", { tag: "@appearance" }, async ({ page }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("/");

      const footer = page.locator("footer.app-footer");
      await expect(footer).toBeVisible();

      const sepChecks = await footer.locator(".sep").evaluateAll((seps) =>
        seps.map((sep) => {
          const next = sep.nextElementSibling;
          const sepTop = sep.getBoundingClientRect().top;
          const nextTop = next ? next.getBoundingClientRect().top : null;
          return {
            hasNext: Boolean(next),
            nextText: next?.textContent?.trim() ?? "",
            sepTop,
            nextTop,
            topDiff: nextTop === null ? null : Math.abs(sepTop - nextTop),
          };
        }),
      );

      expect(sepChecks.length).toBeGreaterThan(0);
      for (const check of sepChecks) {
        expect(check.hasNext).toBe(true);
        expect(check.topDiff).not.toBeNull();
        expect(check.topDiff!).toBeLessThanOrEqual(4);
      }
    }
  });

  test("hiding integrate and support leaves no stray separator at a row edge", async ({ page }) => {
    await setHtmlDataHide(page, "integrate,support");
    await page.goto("/");

    const footer = page.locator("footer.app-footer");
    await expect(footer.locator('a[href="#integration"]')).toHaveCount(0);
    await expect(footer.locator('a[href="https://ko-fi.com/kuzuriao"]')).toHaveCount(0);

    const items = await footer.locator(".footer-links > .footer-item").evaluateAll((els) =>
      els.map((el) => ({
        hasSep: Boolean(el.querySelector(".sep")),
        childCount: el.children.length,
        lastChildIsSep: el.lastElementChild?.classList.contains("sep") ?? false,
      })),
    );
    expect(items.length).toBeGreaterThan(0);
    // First item has no leading separator
    expect(items[0].hasSep).toBe(false);
    // Every subsequent item has a separator followed by the item itself (never ending on a separator)
    for (let i = 1; i < items.length; i++) {
      expect(items[i].hasSep).toBe(true);
      expect(items[i].lastChildIsSep).toBe(false);
    }
  });
});
