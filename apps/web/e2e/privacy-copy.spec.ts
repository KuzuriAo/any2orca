// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { demoModel, file, removeSavePicker, waitForAnimations, SCHEMES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test.describe("Manifest address cleanup (?manifest=)", () => {
  test("removes manifest from address immediately at startup while keeping ref, and confirm/cancel work", async ({ page }) => {
    // Intercept mock model fetch
    await page.route("https://models.example/test.3mf", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: demoModel,
      });
    });

    const manifestObj = [{ name: "test.3mf", url: "https://models.example/test.3mf" }];
    const manifestParam = encodeURIComponent(JSON.stringify(manifestObj));

    // 1. Test cancel path
    await page.goto(`/?manifest=${manifestParam}&ref=test-partner`);
    // Before clicking anything, location.search should only have ?ref=test-partner
    expect(await page.evaluate(() => window.location.search)).toBe("?ref=test-partner");
    await expect(page.getByTestId("manifest-confirm")).toBeVisible();

    // Cancel importing
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("manifest-confirm")).toBeHidden();
    await expect(page.getByTestId("convert-button")).toBeHidden();

    // 2. Test confirm path
    await page.goto(`/?manifest=${manifestParam}&ref=test-partner`);
    expect(await page.evaluate(() => window.location.search)).toBe("?ref=test-partner");
    await expect(page.getByTestId("manifest-confirm")).toBeVisible();

    // Confirm importing
    await page.getByRole("button", { name: "Load files" }).click();
    await expect(page.getByTestId("manifest-confirm")).toBeHidden();
    await expect(page.getByTestId("convert-button")).toBeVisible();
    await expect(page.getByText("test.3mf").first()).toBeVisible();
  });
});

test.describe("One-time b2o migration notice (?from=b2o)", () => {
  test("shows notice when from=b2o, strips parameter, hides on dismiss, and remembers dismissal across reloads", async ({ page }) => {
    // Fresh visit with ?from=b2o&ref=my-site
    await page.goto("/?from=b2o&ref=my-site");

    // Parameter from=b2o is removed immediately, keeping ref
    expect(await page.evaluate(() => window.location.search)).toBe("?ref=my-site");

    // Notice is visible
    const notice = page.getByTestId("b2o-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      "bambu2orca is now any2orca. Same converter, now running entirely on your device: no account, no limits."
    );

    const link = notice.getByRole("link", { name: "What changed" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://github.com/KuzuriAo/any2orca#readme");

    // Dismiss notice
    await page.getByTestId("b2o-notice-dismiss").click();
    await expect(notice).toBeHidden();

    // Reload with ?from=b2o should NOT show notice again
    await page.goto("/?from=b2o");
    await expect(page.getByTestId("b2o-notice")).toBeHidden();
  });

  test("does not show notice without from=b2o", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("b2o-notice")).toBeHidden();
  });
});

for (const scheme of SCHEMES) {
  test.describe(`Axe accessibility for b2o notice (${scheme})`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("notice renders cleanly with zero axe violations", async ({ page }) => {
      await page.goto("/?from=b2o");
      await expect(page.getByTestId("b2o-notice")).toBeVisible();
      await waitForAnimations(page);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)
      ).toEqual([]);
    });
  });
}

test.describe("Footer disclaimer (Not affiliated with Snapmaker, Bambu Lab, Creality, Anycubic or any other printer maker.)", () => {
  test("disclaimer is visible in footer", async ({ page }) => {
    await page.goto("/");
    const disclaimer = page.locator(".app-footer .disclaimer");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toHaveText("Not affiliated with Snapmaker, Bambu Lab, Creality, Anycubic or any other printer maker.");
  });

  test("disclaimer stays when every hideable section is hidden", async ({ page }) => {
    // The app reads data-hide once at startup, so it has to be in the page as served (as configure-web writes it).
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (!url.endsWith("/") && !url.includes("index.html")) return route.continue();
      const response = await route.fetch();
      const body = (await response.text()).replace(/(<html\b[^>]*)(>)/i, '$1 data-hide="beyond,faq,integrate,support"$2');
      await route.fulfill({ response, body });
    });
    await page.goto("/");
    // The attribute took effect: the Ko-fi link ("support") is gone.
    await expect(page.locator('a[href="https://ko-fi.com/kuzuriao"]')).toBeHidden();
    const disclaimer = page.locator(".app-footer .disclaimer");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toHaveText("Not affiliated with Snapmaker, Bambu Lab, Creality, Anycubic or any other printer maker.");
  });

  test("license line has link to third-party licenses", async ({ page }) => {
    await page.goto("/");
    const licenseLink = page.locator('.app-footer a[href$="third-party-licenses.txt"]');
    await expect(licenseLink).toBeVisible();
    await expect(licenseLink).toHaveText("Third-party licenses");
  });
});
