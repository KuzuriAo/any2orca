// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { removeSavePicker, openProject } from "./helpers";

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test.describe("SEO crawler fallback and OrcaSlicer absence", () => {
  test("raw HTML serves the semantic fallback h1 and contains no OrcaSlicer", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBe(true);
    const html = await res.text();

    // Semantic crawler fallback inside #app
    expect(html).toContain("<h1>any2orca — Bambu Studio to Snapmaker U1 3MF Converter</h1>");
    expect(html).toContain("any2orca converts Bambu Studio, Creality Print, Anycubic, ELEGOO and Flashforge .3mf projects for the Snapmaker U1");

    // Head meta description is updated
    expect(html).toContain(
      'content="Convert Bambu Studio, Creality Print, Anycubic, ELEGOO and Flashforge .3mf projects for the Snapmaker U1. Painting, supports and print settings kept. No uploads, no account."'
    );

    // No keywords or HowTo block
    expect(html).not.toContain('<meta name="keywords"');
    expect(html).not.toContain('"@type": "HowTo"');

    // No OrcaSlicer anywhere in the raw index.html
    expect(html).not.toContain("OrcaSlicer");
  });

  test("built page and all FAQ sections contain zero mentions of OrcaSlicer", async ({ page }) => {
    await page.goto("/");

    // Expand all FAQ accordion items to inspect their rendered content
    const triggers = page.locator(".faq-trigger");
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const trigger = triggers.nth(i);
      const isExpanded = await trigger.getAttribute("aria-expanded");
      if (isExpanded !== "true") {
        await trigger.click();
      }
    }

    // Check visible text across the entire page body
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("OrcaSlicer");

    // Check FAQ container HTML specifically
    const faqHtml = await page.locator("#faq").innerHTML();
    expect(faqHtml).not.toContain("OrcaSlicer");
  });

  test("brand wordmark is not clipped at 390px viewport width", { tag: "@appearance" }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const brandBadgeLink = page.locator(".brand-badge-link");
    const brandText = page.locator(".brand-text");
    await openProject(page);
    const isVisible = await brandText.isVisible();
    if (isVisible) {
      const info = await page.evaluate(() => {
    const el = document.querySelector(".brand-text");
    const link = document.querySelector(".brand-badge-link");
    const nav = document.querySelector(".app-nav");
    return {
      text: el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: el.textContent } : null,
      link: link ? { scrollWidth: link.scrollWidth, clientWidth: link.clientWidth, width: link.getBoundingClientRect().width } : null,
      nav: nav ? { scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth } : null
    };
  });
    const isClipped = await brandText.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(isClipped, "brand text scrollWidth should be <= clientWidth").toBe(false);
    } else {
      expect(isVisible).toBe(false);
    }
  });

  test("default build omits the analytics beacon sentence in FAQ and PrivacyModal", async ({ page }) => {
    await page.goto("/");

    // Check FAQ 1
    const faqItem1 = page.locator("#faq-answer-privacy-guarantee");
    // Ensure open
    const isExpanded = await page.locator("#faq-question-privacy-guarantee").getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await page.locator("#faq-question-privacy-guarantee").click();
    }
    await expect(faqItem1).toBeVisible();
    await expect(faqItem1).not.toContainText("Cloudflare Web Analytics");
    await expect(faqItem1).not.toContainText("static.cloudflareinsights.com");

    // Check PrivacyModal
    await page.getByTestId("privacy-open").click();
    const modal = page.locator(".modal-card");
    await expect(modal).toBeVisible();
    await expect(modal).not.toContainText("Cloudflare Web Analytics");
    await expect(modal).not.toContainText("static.cloudflareinsights.com");
    await expect(modal).toContainText("Runs in your browser");
    await expect(modal).toContainText("Uploads your whole .3mf file to a server.");
    await expect(modal).toContainText("ready to download");
  });

  test("serves brand-specific favicon.svg, favicon.ico and logo.png", { tag: "@appearance" }, async ({ request }, testInfo) => {
    const svgRes = await request.get("/favicon.svg");
    expect(svgRes.ok()).toBe(true);
    const svgText = await svgRes.text();
    const expectedColor = testInfo.project.name === "a2o" ? "#8b5cf6" : "#0284c7";
    expect(svgText).toContain(expectedColor);

    const icoRes = await request.get("/favicon.ico");
    expect(icoRes.ok()).toBe(true);
    const icoBuf = await icoRes.body();
    expect(icoBuf.length).toBeGreaterThan(0);

    const pngRes = await request.get("/logo.png");
    expect(pngRes.ok()).toBe(true);
    const pngBuf = await pngRes.body();
    expect(pngBuf.length).toBeGreaterThan(0);
  });


  test("privacy FAQ entry covers command line and links to privacy guide", async ({ page, request }) => {
    const res = await request.get("/");
    const html = await res.text();
    expect(html).toContain("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>.");
    expect(html).toContain("The command line works the same way:");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md" target="_blank" rel="noopener noreferrer">privacy guide</a>');

    await page.goto("/");
    const faqContainer = page.locator("#faq");
    const privacyTrigger = page.locator("#faq-question-privacy-guarantee");
    const isExpanded = await privacyTrigger.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await privacyTrigger.click();
    }
    const faqItem1 = page.locator("#faq-answer-privacy-guarantee");
    await expect(faqItem1).toContainText("The command line works the same way:");
    const privacyLink = faqItem1.locator('a[href="https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute("target", "_blank");
    await expect(privacyLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(privacyLink).toHaveText("privacy guide");
  });

  test("accessibility FAQ entry links to accessibility.md with external link attributes", async ({ page, request }) => {
    const res = await request.get("/");
    const html = await res.text();
    expect(html).toContain("Can I use any2orca without a mouse?");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md" target="_blank" rel="noopener noreferrer">accessibility guide</a>');

    await page.goto("/");
    const faqContainer = page.locator("#faq");
    const a11yTrigger = page.locator(".faq-trigger").filter({ hasText: "without a mouse" });
    await a11yTrigger.click();
    await expect(faqContainer).toContainText("Everything works from the keyboard");
    const a11yLink = faqContainer.locator('a[href="https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"]');
    await expect(a11yLink).toBeVisible();
    await expect(a11yLink).toHaveAttribute("target", "_blank");
    await expect(a11yLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(a11yLink).toHaveText("accessibility guide");
  });

  test("Part 2 copy follow-ups: no Snorca parentheticals, CAD 3MF explanation, and hotend shop link", async ({ page, request }) => {
    const res = await request.get("/");
    const html = await res.text();
    expect(html).not.toContain("Snorca");
    expect(html).toContain("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile.");
    expect(html).toContain('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>');

    await page.goto("/");
    const faqContainer = page.locator("#faq");
    const cadTrigger = page.locator(".faq-trigger").filter({ hasText: "slicers other than Bambu Studio" });
    await cadTrigger.click();
    await expect(faqContainer).toContainText("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile.");

    const hotendTrigger = page.locator(".faq-trigger").filter({ hasText: "High Flow Hotend" });
    await hotendTrigger.click();
    const hotendLink = faqContainer.locator('a[href="https://shop.snapmaker.com/products/liber-high-flow-hotend"]');
    await expect(hotendLink).toHaveAttribute("target", "_blank");
    await expect(hotendLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(hotendLink).toHaveText("Snapmaker Liber High Flow Hotend");

    const fullPageText = await page.locator("body").innerText();
    expect(fullPageText).not.toContain("Snorca");
  });

  test("FAQ transparency updates: large-files limits with CLI link, and bambu2orca named in older presets", async ({ page, request }) => {
    const res = await request.get("/");
    const html = await res.text();
    expect(html).toContain("projects that unpack to up to 2 GB convert here");
    expect(html).toContain("Above 1 GB you'll see a note before converting");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md" target="_blank" rel="noopener noreferrer">CLI reference</a>');
    expect(html).toContain("Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces), use the old names, so Snapmaker Orca can't match them to a system preset.");

    await page.goto("/");
    const faqContainer = page.locator("#faq");

    const largeFilesTrigger = page.locator(".faq-trigger").filter({ hasText: "handle very large files" });
    await largeFilesTrigger.click();
    await expect(faqContainer).toContainText("projects that unpack to up to 2 GB convert here");
    const cliLink = faqContainer.locator('a[href="https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md"]');
    await expect(cliLink).toBeVisible();
    await expect(cliLink).toHaveAttribute("target", "_blank");
    await expect(cliLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(cliLink).toHaveText("CLI reference");

    const presetTrigger = page.locator(".faq-trigger").filter({ hasText: "Project-inside presets" });
    await presetTrigger.click();
    await expect(faqContainer).toContainText("Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces)");
  });

});
