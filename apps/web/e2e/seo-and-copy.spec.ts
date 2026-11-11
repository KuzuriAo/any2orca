// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FAQ_GROUPS, STARTER_FAQ_IDS, getFaqGroupId, getFaqItems } from "../src/lib/faq";
import { SCHEMES, convertAndWait, openProject, removeSavePicker, settingsOf } from "./helpers";

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
    await page.getByTestId("faq-expand-all").click();

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
    const brandText = page.locator(".brand-text");
    await openProject(page);
    const isVisible = await brandText.isVisible();
    if (isVisible) {
      const isClipped = await brandText.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(isClipped, "brand text scrollWidth should be <= clientWidth").toBe(false);
    } else {
      expect(isVisible).toBe(false);
    }
  });

  test("default build omits the analytics beacon sentence in FAQ and PrivacyModal", async ({ page }) => {
    await page.goto("/faq");

    const verifyTrigger = page.locator("#faq-question-verify-no-upload");
    await verifyTrigger.click();
    const verifyAnswer = page.locator("#faq-answer-verify-no-upload");
    await expect(verifyAnswer).toBeVisible();
    await expect(verifyAnswer).not.toContainText("Cloudflare Web Analytics");
    await expect(verifyAnswer).not.toContainText("static.cloudflareinsights.com");

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
    const res = await request.get("/faq");
    const html = await res.text();
    expect(html).toContain("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>.");
    expect(html).toContain("The command line works the same way:");
    expect(html).toContain('<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md" target="_blank" rel="noopener noreferrer">privacy guide</a>');

    await page.goto("/faq");
    const privacyTrigger = page.locator("#faq-question-privacy-guarantee");
    await privacyTrigger.click();
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
    await expect(faqContainer).toContainText("everything works from the keyboard");
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
    "FAQ slicer answers name QIDI Studio, first sentence of what-any-covers says seven slicers, issue form link is present, and QIDI Studio fixture converts in the web app",
    { tag: "@appearance" },
    async ({ page }) => {
      await page.goto("/faq");

      const whatAnyTrigger = page.locator("#faq-question-what-any-covers");
      await expect(whatAnyTrigger.locator(".badge")).toHaveCount(0);
      await whatAnyTrigger.click();

      const whatAnyAnswer = page.locator("#faq-answer-what-any-covers");
      await expect(whatAnyAnswer).toBeVisible();
      const firstSentence = ((await whatAnyAnswer.locator("p").first().textContent()) ?? "").split(".")[0];
      expect(firstSentence).toMatch(/seven slicers/i);
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
    "/faq layout, rail, filter, anchor links, no-JS fallback, and home page starter links",
    { tag: "@appearance" },
    async ({ page, browser }) => {
      const allItems = getFaqItems(false);

      // 1. Home page shows "Common questions", 5 starter links with nothing open, and "All 19 questions"
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect(page.locator("#faq")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Common questions" })).toBeVisible();
      await expect(page.locator("#faq .faq-item")).toHaveCount(STARTER_FAQ_IDS.length);
      await expect(page.locator("#faq .faq-content")).toHaveCount(0);
      for (const id of STARTER_FAQ_IDS) {
        const starterLink = page.locator(`#faq #faq-question-${id}`);
        await expect(starterLink).toBeVisible();
        await expect(starterLink).toHaveAttribute("href", `/faq#${id}`);
      }
      const allLink = page.getByTestId("faq-all-questions");
      await expect(allLink).toBeVisible();
      await expect(allLink).toHaveAttribute("href", "/faq");
      await expect(allLink).toContainText(`All ${allItems.length} questions`);

      // Load a file: workspace FAQ disappears, header FAQ link stays visible
      await openProject(page);
      await expect(page.locator("#faq")).toHaveCount(0);
      const headerFaq = page.getByTestId("faq-open");
      await expect(headerFaq).toBeVisible();
      await expect(headerFaq).toHaveAttribute("href", "/faq");

      // 2. /faq loads with nothing open, rail shows 3 groups + counts + aria-current, reading column <= 760px
      await page.goto("/faq");
      await expect(page.getByRole("heading", { level: 1, name: "Frequently Asked Questions" })).toBeVisible();
      await expect(page.locator("#faq .faq-content")).toHaveCount(0);
      await expect(page.locator("#faq .faq-item")).toHaveCount(allItems.length);

      const rail = page.getByTestId("faq-rail");
      await expect(rail).toBeVisible();
      const railPosDesktop = await rail.evaluate((el) => getComputedStyle(el).position);
      expect(railPosDesktop).toBe("sticky");

      const readingColWidth = await page.getByTestId("faq-reading-column").evaluate(
        (el) => el.getBoundingClientRect().width,
      );
      expect(readingColWidth).toBeLessThanOrEqual(760);

      const expectedCounts: Record<string, string> = {
        "Getting started": "7",
        Options: "7",
        "If something looks different": "5",
      };
      for (const group of FAQ_GROUPS) {
        const gId = getFaqGroupId(group);
        await expect(page.getByRole("heading", { level: 2, name: group })).toBeVisible();
        await expect(page.getByTestId(`faq-rail-count-${gId}`)).toHaveText(expectedCounts[group]);
      }
      await expect(page.getByTestId(`faq-rail-link-${getFaqGroupId("Getting started")}`)).toHaveAttribute(
        "aria-current",
        "location",
      );

      // Clicking a rail group scrolls to it and marks it active
      const optionsRailLink = page.getByTestId(`faq-rail-link-${getFaqGroupId("Options")}`);
      await optionsRailLink.click();
      await expect(optionsRailLink).toHaveAttribute("aria-current", "location");

      // Expand all and Collapse all work
      const expandAllBtn = page.getByTestId("faq-expand-all");
      await expect(expandAllBtn).toHaveText("Expand all");
      await expandAllBtn.click();
      await expect(page.locator("#faq .faq-content")).toHaveCount(allItems.length);
      await expect(expandAllBtn).toHaveText("Collapse all");
      await expandAllBtn.click();
      await expect(page.locator("#faq .faq-content")).toHaveCount(0);

      // 3. /faq#nozzle-size opens that answer; the # link copies/sets the right anchor
      await page.goto("/faq#nozzle-size");
      await expect(page.locator("#faq-answer-nozzle-size")).toBeVisible();
      await expect(page.locator("#faq .faq-content")).toHaveCount(1);

      await page.evaluate(() => {
        (window as any).__copiedText = "";
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (t: string) => {
              (window as any).__copiedText = t;
            },
          },
          configurable: true,
        });
      });
      await page.getByTestId("faq-anchor-privacy-guarantee").click();
      await expect(page).toHaveURL(/#privacy-guarantee$/);
      const copied = await page.evaluate(() => (window as any).__copiedText);
      expect(copied).toMatch(/\/faq#privacy-guarantee$/);
      await expect(page.locator("#faq-answer-privacy-guarantee")).toBeVisible();

      // 4. Filter: hides non-matches & empty groups, updates counts, opens matches, restores earlier state on clear, hostile input safe, hash to hidden clears filter
      // Right now nozzle-size and privacy-guarantee are open (2 open items)
      const filterInput = page.getByTestId("faq-filter-input");
      await filterInput.fill("2.85 mm");
      await expect(page.locator("#faq .faq-item")).toHaveCount(1);
      await expect(page.locator("#faq-answer-nozzle-size")).toBeVisible();
      await expect(page.getByTestId(`faq-rail-count-${getFaqGroupId("Getting started")}`)).toHaveText("0");
      await expect(page.getByTestId(`faq-rail-count-${getFaqGroupId("Options")}`)).toHaveText("1");
      await expect(page.getByTestId(`faq-rail-count-${getFaqGroupId("If something looks different")}`)).toHaveText("0");
      await expect(page.getByTestId(`faq-group-section-${getFaqGroupId("Getting started")}`)).toHaveCount(0);

      // Clear restores pre-search open state (nozzle-size and privacy-guarantee open, others closed)
      await page.getByTestId("faq-filter-clear").click();
      await expect(page.locator("#faq .faq-item")).toHaveCount(allItems.length);
      await expect(page.locator("#faq .faq-content")).toHaveCount(2);
      await expect(page.locator("#faq-answer-nozzle-size")).toBeVisible();
      await expect(page.locator("#faq-answer-privacy-guarantee")).toBeVisible();

      // Hostile markup or regex char neither runs nor throws, shows empty state, Clear button restores
      await filterInput.fill("<img src=x onerror=window.__xss=1>(");
      await expect(page.getByTestId("faq-filter-empty")).toBeVisible();
      await expect(page.getByTestId("faq-filter-empty")).toContainText("No matching questions");
      const xssTriggered = await page.evaluate(() => Boolean((window as any).__xss));
      expect(xssTriggered).toBe(false);

      // Navigating to a hash link hidden by the filter clears the filter and opens that question
      await page.evaluate(() => {
        window.location.hash = "compare-tool";
      });
      await expect(filterInput).toHaveValue("");
      await expect(page.locator("#faq .faq-item")).toHaveCount(allItems.length);
      await expect(page.locator("#faq-answer-compare-tool")).toBeVisible();

      // 5. Phone width (390px): pills show and sticky column does not
      await page.setViewportSize({ width: 390, height: 844 });
      const railPosMobile = await rail.evaluate((el) => getComputedStyle(el).position);
      expect(railPosMobile).toBe("static");

      // 6. Axe across light and dark at 1440px and 390px on /faq (with rail and filter in use) and /
      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390] as const) {
          await page.setViewportSize({ width, height: 900 });

          await page.goto("/faq");
          await page.getByTestId("faq-filter-input").fill("nozzle");
          await expect(page.locator("#faq .faq-content").first()).toBeVisible();
          const faqAxe = await new AxeBuilder({ page }).analyze();
          expect(faqAxe.violations, `axe clean on /faq (${scheme}, ${width}px)`).toEqual([]);
          const faqOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(faqOverflow, `no overflow on /faq (${scheme}, ${width}px)`).toBeLessThanOrEqual(0);

          await page.goto("/");
          const homeAxe = await new AxeBuilder({ page }).analyze();
          expect(homeAxe.violations, `axe clean on / (${scheme}, ${width}px)`).toEqual([]);
        }
      }

      // 7. With JavaScript disabled: every question and answer is in /faq, and the filter isn't
      const noJsContext = await browser.newContext({ javaScriptEnabled: false });
      try {
        const noJsPage = await noJsContext.newPage();
        await noJsPage.goto("/faq");
        await expect(noJsPage.getByTestId("faq-filter-input")).toHaveCount(0);
        for (const item of allItems) {
          await expect(noJsPage.locator(`#${item.id}`)).toBeVisible();
          await expect(noJsPage.locator(`#${item.id}`)).toContainText(item.question);
        }
      } finally {
        await noJsContext.close();
      }
    },
  );
});
