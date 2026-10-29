// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from "@playwright/test";
import { removeSavePicker } from "./helpers";

async function setHtmlDataHide(page: Page, hideValue: string) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.endsWith("/") || url.includes("index.html")) {
      const response = await route.fetch();
      let body = await response.text();
      body = body.replace(/(<html\b[^>]*)(>)/i, `$1 data-hide="${hideValue}"$2`);
      await route.fulfill({ response, body });
    } else {
      await route.continue();
    }
  });
}

test.describe("hide sections via data-hide attribute on <html>", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
  });

  test("setting data-hide=\"beyond,faq\" hides both sections and FAQ button while preserving source link", async ({ page }) => {
    await setHtmlDataHide(page, "beyond,faq");
    await page.goto("/");

    // Beyond section and FAQ section are not rendered
    await expect(page.locator(".beyond-section")).toBeHidden();
    await expect(page.locator("#faq")).toBeHidden();

    // FAQ button in the header is gone
    await expect(page.getByTestId("faq-open")).toBeHidden();

    // Source code link to GitHub in header and footer is still present
    const ghLink = page.locator('a[href="https://github.com/KuzuriAo/any2orca"]');
    await expect(ghLink.first()).toBeVisible();
  });

  test("unknown or hostile data-hide value hides only allowed sections and breaks nothing", async ({ page }) => {
    await setHtmlDataHide(page, "beyond,<script>alert(1)</script>,unknown-foo");
    await page.goto("/");

    // beyond is hidden
    await expect(page.locator(".beyond-section")).toBeHidden();

    // faq was not in the allowed hide set, so it remains visible
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.getByTestId("faq-open")).toBeVisible();

    // GitHub source link is preserved
    const ghLink = page.locator('a[href="https://github.com/KuzuriAo/any2orca"]');
    await expect(ghLink.first()).toBeVisible();
  });

  test("data-hide=\"integrate\" hides partner integration controls", async ({ page }) => {
    await setHtmlDataHide(page, "integrate");
    await page.goto("/");

    // Partner integration links in footer and beyond are hidden
    await expect(page.locator('a[href="#integration"]')).toBeHidden();
  });

  test("data-hide=\"support\" hides Ko-fi link in footer", async ({ page }) => {
    await setHtmlDataHide(page, "support");
    await page.goto("/");

    await expect(page.locator('a[href="https://ko-fi.com/kuzuriao"]')).toBeHidden();
  });

  test("default page without data-hide has all sections, buttons, and source link visible", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".beyond-section")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.getByTestId("faq-open")).toBeVisible();

    const ghLink = page.locator('a[href="https://github.com/KuzuriAo/any2orca"]');
    await expect(ghLink.first()).toBeVisible();
  });
});
