// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, file, openProject, SCHEMES, VIEWPORTS } from "./helpers";

// Zero axe violations, on every skin, light and dark, for the empty page and
// after converting a file.
for (const scheme of SCHEMES) {
  for (const state of ["empty", "converted"] as const) {
    test.describe(`${scheme} ${state}`, () => {
      test.use({ colorScheme: scheme, reducedMotion: "reduce" });

      test("has no accessibility violations", async ({ page }) => {
        await page.goto("/");
        if (state === "converted") {
          await openProject(page);
          await convertAndWait(page);
        }
        await page.waitForTimeout(1_000); // let any remaining transition finish so colors are measured at rest
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(
          violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
        ).toEqual([]);
      });
    });
  }
}

// The batch view (two or more files), with its first card as loaded and toggled, on
// every skin and scheme, at desktop and phone width.
for (const scheme of SCHEMES) {
  for (const [size, viewport] of [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]] as const) {
    test.describe(`${scheme} ${size} batch`, () => {
      test.use({ colorScheme: scheme, reducedMotion: "reduce", viewport });

      test("has no accessibility violations", async ({ page }) => {
        await page.goto("/");
        await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
        await page.getByTestId("batch-view").waitFor();
        const toggle = page.locator('[data-testid="batch-view"] button[aria-controls^="batch-details-"]').first();
        for (const toggled of [false, true]) {
          const before = await toggle.getAttribute("aria-expanded");
          if (toggled) {
            await toggle.click();
            await expect(toggle).not.toHaveAttribute("aria-expanded", before ?? "");
          }
          await page.waitForTimeout(1_000); // let any remaining transition finish so colors are measured at rest
          const { violations } = await new AxeBuilder({ page }).analyze();
          expect(
            violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
          ).toEqual([]);
        }
      });
    });
  }
}

// The Compare modal, with differences and legend displayed, on both skins and schemes,
// at desktop (1440px) and phone (375px) width.
for (const scheme of SCHEMES) {
  for (const [size, viewport] of [["desktop", VIEWPORTS.desktop], ["phone375", { width: 375, height: 667 }]] as const) {
    test.describe(`${scheme} ${size} compare modal`, () => {
      test.use({ colorScheme: scheme, reducedMotion: "reduce", viewport });

      test("has no accessibility violations with Compare modal open", async ({ page }) => {
        await page.goto("/");
        await page.getByTestId("advanced-tools-btn").click();
        const dialog = page.locator(".presets-modal, .compare-modal");
        await dialog.getByRole("tab", { name: "Compare Settings" }).click();

        const fileAInput = page.locator(".compare-modal input[type=\"file\"]").first();
        await fileAInput.setInputFiles(file("demo.3mf", demoModel));
        await page.locator(".compare-modal .badge-above-limit").first().waitFor();

        await page.waitForTimeout(1_000); // let transitions settle
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(
          violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
        ).toEqual([]);
      });
    });
  }
}

// Skip to the converter keyboard navigation and focus
for (const scheme of SCHEMES) {
  test.describe(`${scheme} skip link`, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("on page load, Tab focuses 'Skip to the converter', Enter moves to converter, next Tab reaches Choose 3MF File..., and passes axe", async ({ page }) => {
      await page.goto("/");
      const skipLink = page.locator(".skip-link");

      // On page load, the first Tab focuses "Skip to the converter" and it is visible
      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeVisible();
      await expect(skipLink).toHaveText("Skip to the converter");

      // Verify the focused link has an opaque background and does not overlap the logo text
      const styleAndPosition = await page.evaluate(() => {
        const skip = document.querySelector(".skip-link");
        const logo = document.querySelector(".brand-text");
        if (!skip) return null;
        const cs = window.getComputedStyle(skip);
        const skipRect = skip.getBoundingClientRect();
        const logoRect = logo && window.getComputedStyle(logo).display !== "none" ? logo.getBoundingClientRect() : null;

        const m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        const alpha = m ? (m[4] !== undefined ? Number(m[4]) : 1) : 0;

        const overlaps = logoRect
          ? !(
              skipRect.right <= logoRect.left ||
              skipRect.left >= logoRect.right ||
              skipRect.bottom <= logoRect.top ||
              skipRect.top >= logoRect.bottom
            )
          : false;

        return {
          bgColor: cs.backgroundColor,
          alpha,
          padding: cs.padding,
          borderWidth: cs.borderWidth,
          overlapsLogo: overlaps,
        };
      });

      expect(styleAndPosition).not.toBeNull();
      expect(styleAndPosition!.bgColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(styleAndPosition!.alpha).toBeGreaterThanOrEqual(0.95);
      expect(styleAndPosition!.overlapsLogo).toBe(false);

      // Both skins pass axe with the link focused
      await page.waitForTimeout(400);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`),
      ).toEqual([]);

      // Enter moves focus into the converter region
      await page.keyboard.press("Enter");
      const converterRegion = page.locator("#converter");
      await expect(converterRegion).toBeFocused();

      // Next Tab reaches Choose 3MF File... without passing through the header
      await page.keyboard.press("Tab");
      const chooseBtn = page.getByRole("button", { name: "Choose 3MF File..." });
      await expect(chooseBtn).toBeFocused();
    });
  });
}
