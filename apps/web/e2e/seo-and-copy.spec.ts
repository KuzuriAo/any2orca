// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FAQ_GROUPS, STARTER_FAQ_IDS, getFaqItems } from "../src/lib/faq";
import { convertAndWait, openProject, removeSavePicker, settingsOf } from "./helpers";

const QIDI_FIXTURE_PATH = fileURLToPath(
  new URL("../../../packages/core/src/test-fixtures/sources/qidi-studio-2.7.2.73-reset.3mf", import.meta.url),
);

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
});

test.describe("SEO crawler fallback and OrcaSlicer absence", () => {
  test("raw HTML serves the semantic fallback h1 and contains no OrcaSlicer", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBe(true);
    const html = await res.text();

    const faqRes = await request.get("/faq");
    expect(faqRes.ok()).toBe(true);
    const faqHtml = await faqRes.text();
    expect(faqHtml).toContain("<h1>Frequently Asked Questions — any2orca</h1>");
    expect(faqHtml).not.toContain("OrcaSlicer");

    // Semantic crawler fallback inside #app
    expect(html).toContain("<h1>any2orca — Bambu Studio &amp; PrusaSlicer 3MF to Snapmaker U1</h1>");
    expect(html).toContain("any2orca converts Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects for the Snapmaker U1");

    // Head meta description is updated
    expect(html).toContain(
      'content="Convert Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects for the Snapmaker U1. Painting, supports and print settings kept. No uploads, no account."'
    );

    // No keywords or HowTo block
    expect(html).not.toContain('<meta name="keywords"');
    expect(html).not.toContain('"@type": "HowTo"');

    // No OrcaSlicer anywhere in the raw index.html
    expect(html).not.toContain("OrcaSlicer");
  });

  test("built page and all FAQ sections contain zero mentions of OrcaSlicer", async ({ page }) => {
    await page.goto("/faq");

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
    const res = await request.get("/faq");
    const html = await res.text();
    expect(html).toContain("Can I use any2orca without a mouse?");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md" target="_blank" rel="noopener noreferrer">accessibility guide</a>');

    await page.goto("/faq");
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
    const res = await request.get("/faq");
    const html = await res.text();
    expect(html).not.toContain("Snorca");
    expect(html).toContain("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile.");
    expect(html).toContain('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>');

    await page.goto("/faq");
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
    const res = await request.get("/faq");
    const html = await res.text();
    expect(html).toContain("projects that unpack to up to 2 GB convert here");
    expect(html).toContain("Above 1 GB you'll see a note before converting");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md" target="_blank" rel="noopener noreferrer">CLI reference</a>');
    expect(html).toContain("Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces), use the old names, so Snapmaker Orca can't match them to a system preset.");

    await page.goto("/faq");
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

  test(
    "FAQ slicer answers name QIDI Studio, badge says Seven Slicers, issue form link is present, and QIDI Studio fixture converts in the web app",
    { tag: "@appearance" },
    async ({ page }) => {
      await page.goto("/faq");

      const whatAnyTrigger = page.locator("#faq-question-what-any-covers");
      await expect(whatAnyTrigger.locator(".badge")).toHaveText("Seven Slicers");
      await whatAnyTrigger.click();

      const whatAnyAnswer = page.locator("#faq-answer-what-any-covers");
      await expect(whatAnyAnswer).toBeVisible();
      await expect(whatAnyAnswer).toContainText(
        "Creality Print, Anycubic Slicer Next, ElegooSlicer, Flash Studio and QIDI Studio",
      );
      await expect(whatAnyAnswer).toContainText("Those seven are what any2orca converts today");
      await expect(whatAnyAnswer).toContainText(
        "Projects that other slicers built on Bambu Studio save in its format are read the same way, but they aren't tested.",
      );
      await expect(whatAnyAnswer).not.toContainText("A project from any other slicer isn't converted");

      const reportLink = whatAnyAnswer.locator(
        'a[href="https://github.com/KuzuriAo/any2orca/issues/new?template=other_slicer.yml"]',
      );
      await expect(reportLink).toBeVisible();
      await expect(reportLink).toHaveText("Report it on GitHub");
      await expect(reportLink).toHaveAttribute("target", "_blank");
      await expect(reportLink).toHaveAttribute("rel", "noopener noreferrer");

      const supportedTrigger = page.locator("#faq-question-supported-slicers");
      await supportedTrigger.click();
      const supportedAnswer = page.locator("#faq-answer-supported-slicers");
      await expect(supportedAnswer).toBeVisible();
      await expect(supportedAnswer).toContainText(
        "Projects saved by Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer, Flash Studio and QIDI Studio convert; they share one project format.",
      );
      await expect(supportedAnswer).toContainText("QIDI: QIDI Studio (Q1 Pro, Plus4, X series .3mf).");

      await page.goto("/");
      const qidiBuf = readFileSync(QIDI_FIXTURE_PATH);
      await openProject(page, "qidi-studio-2.7.2.73-reset.3mf", qidiBuf);

      await expect(page.getByTestId("bed-watermark-text")).toHaveText("QIDI");
      const plateTabs = page.locator(".plate-tabs .tab-btn");
      await expect(plateTabs).toHaveCount(2);
      await expect(plateTabs.nth(0)).toHaveText("Plate 1");
      await expect(plateTabs.nth(1)).toHaveText("Plate 2");

      const swatches = page.locator(".swatch-card");
      await expect(swatches).toHaveCount(4);
      await expect(swatches.locator(".hex-code")).toHaveText([
        "#000000",
        "#FFFFFF",
        "#0056B8",
        "#C12E1F",
      ]);
      await expect(page.getByTestId("profile-picker")).toHaveValue("snapmaker-u1-0.4-standard");

      await convertAndWait(page);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("download-button").click(),
      ]);
      const output = new Uint8Array(readFileSync((await download.path())!));
      const settings = settingsOf(output);
      expect(settings.printer_model).toBe("Snapmaker U1");
      expect(settings.print_settings_id).toBe("0.20mm Standard @Snapmaker U1 (0.4 nozzle)");
      expect(settings.filament_colour).toEqual(["#000000", "#FFFFFF", "#0056B8", "#C12E1F"]);
    },
  );


  test(
    "/faq renders every question with its group and anchor, main page shows starter questions and All questions link, and loading a file hides the workspace FAQ",
    { tag: "@appearance" },
    async ({ page }) => {
      await page.goto("/");

      // Starter questions and All questions link on main page before loading a file
      await expect(page.locator("#faq")).toBeVisible();
      await expect(page.locator("#faq .faq-item")).toHaveCount(STARTER_FAQ_IDS.length);
      for (const id of STARTER_FAQ_IDS) {
        await expect(page.locator(`#faq #${id}`)).toBeVisible();
      }
      const allLink = page.getByTestId("faq-all-questions");
      await expect(allLink).toBeVisible();
      await expect(allLink).toHaveAttribute("href", "/faq");
      await expect(allLink).toContainText("All questions");

      // Load a file: workspace FAQ disappears, header FAQ link stays visible
      await openProject(page);
      await expect(page.locator("#faq")).toHaveCount(0);
      const headerFaq = page.getByTestId("faq-open");
      await expect(headerFaq).toBeVisible();
      await expect(headerFaq).toHaveAttribute("href", "/faq");

      // Navigate to /faq#nozzle-size: every group and question with its anchor is present, and #nozzle-size is expanded
      await page.goto("/faq#nozzle-size");
      await expect(page.getByRole("heading", { level: 1, name: "Frequently Asked Questions" })).toBeVisible();
      for (const group of FAQ_GROUPS) {
        await expect(page.getByRole("heading", { level: 2, name: group })).toBeVisible();
      }
      const allItems = getFaqItems(false);
      await expect(page.locator("#faq .faq-item")).toHaveCount(allItems.length);
      for (const item of allItems) {
        await expect(page.locator(`#faq #${item.id}`)).toBeVisible();
      }
      await expect(page.locator("#faq-answer-nozzle-size")).toBeVisible();

      for (const width of [1440, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations, `axe clean on /faq at ${width}px`).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal overflow on /faq at ${width}px`).toBeLessThanOrEqual(0);
      }
    },
  );
});
