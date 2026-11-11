// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FAQ_GROUPS,
  STARTER_FAQ_IDS,
  getFaqItems,
  getStarterFaqItems,
  generateCrawlerFallback,
  generateFaqPageCrawlerFallback,
  injectCrawlerFallback,
  injectFaqPageCrawlerFallback,
  isOfficialBuild,
} from "./faq";
import { FILAMENT_COMPLIANCE_HELP } from "./filamentComplianceCopy";
import {
  HARDENED_NOZZLE_HELP,
  HIGH_FLOW_HELP,
  NOZZLE_SIZE_HELP,
  TUNED_PRESET_HELP,
} from "./optionHelp";
import { parseSiteUrl } from "./site-metadata";
import { DEFAULT_MAX_UNPACKED_BYTES, LARGE_PROJECT_BYTES, MAX_UNPACKED_BYTES_LIMIT } from "any2orca";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dirname, "../../index.html");
const faqHtmlPath = path.resolve(__dirname, "../../faq/index.html");

const PREVIOUS_18_IDS = [
  "privacy-guarantee",
  "accessibility",
  "page-unresponsive",
  "opening-files",
  "what-any-covers",
  "supported-slicers",
  "convert-bambu-3mf-to-u1",
  "print-fidelity",
  "centering-behavior",
  "layer-height-profile-diff",
  "compliance-mode",
  "high-flow-hotend",
  "high-flow-speeds",
  "hardened-steel-nozzles",
  "nozzle-size",
  "custom-presets",
  "compare-tool",
  "snorca-240-presets",
] as const;

describe("FAQ items and beacon sentence", () => {
  it("every question has a group, an id and an answer; the three groups cover all 19 questions; no question has a badge; starter set is a subset; all previous ids preserved; 'All N' comes from the list", () => {
    const all = getFaqItems(false);
    const starter = getStarterFaqItems(false);
    assert.deepEqual(FAQ_GROUPS, [
      "Getting started",
      "Options",
      "If something looks different",
    ]);
    assert.equal(all.length, 19);
    assert.equal(starter.length, STARTER_FAQ_IDS.length);

    const seenIds = new Set<string>();
    for (const item of all) {
      assert.ok(item.id.length > 0, "id must be non-empty");
      assert.ok(!seenIds.has(item.id), `duplicate id ${item.id}`);
      seenIds.add(item.id);
      assert.ok(FAQ_GROUPS.includes(item.group), `invalid group ${item.group} on ${item.id}`);
      assert.ok(item.question.length > 0, `question must be non-empty on ${item.id}`);
      assert.ok(item.answerHtml.length > 0, `answerHtml must be non-empty on ${item.id}`);
      assert.ok(!("badge" in item), `${item.id} must not have a badge field`);
      assert.ok(!("badgeType" in item), `${item.id} must not have a badgeType field`);
    }

    // Every id from before is still present, plus verify-no-upload
    for (const prevId of PREVIOUS_18_IDS) {
      assert.ok(seenIds.has(prevId), `missing previous FAQ id: ${prevId}`);
    }
    assert.ok(seenIds.has("verify-no-upload"), "missing new FAQ id: verify-no-upload");

    // Group counts: Getting started (7), Options (7), If something looks different (5)
    assert.equal(all.filter((i) => i.group === "Getting started").length, 7);
    assert.equal(all.filter((i) => i.group === "Options").length, 7);
    assert.equal(all.filter((i) => i.group === "If something looks different").length, 5);

    for (const item of starter) {
      assert.ok(seenIds.has(item.id), `starter item ${item.id} must be in getFaqItems()`);
    }

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(
      indexHtml.includes(`<a href="/faq">All ${all.length} questions →</a>`),
      `index.html should contain All ${all.length} questions link`,
    );
    for (const item of all) {
      assert.ok(faqHtml.includes(`<section id="${item.id}">`), `faq/index.html missing #${item.id}`);
      if ((STARTER_FAQ_IDS as readonly string[]).includes(item.id)) {
        assert.ok(
          indexHtml.includes(`<li id="${item.id}"><a href="/faq#${item.id}">${item.question}</a></li>`),
          `index.html missing starter link #${item.id}`,
        );
      } else {
        assert.ok(!indexHtml.includes(`id="${item.id}"`), `index.html should not include non-starter #${item.id}`);
      }
    }
  });

  it("shares option explanation text between HelpTip constants and FAQ answers", () => {
    const byId = new Map(getFaqItems(false).map((i) => [i.id, i]));
    assert.ok(byId.get("high-flow-hotend")!.answerHtml.includes(HIGH_FLOW_HELP));
    assert.ok(byId.get("hardened-steel-nozzles")!.answerHtml.includes(HARDENED_NOZZLE_HELP));
    assert.ok(byId.get("nozzle-size")!.answerHtml.includes(NOZZLE_SIZE_HELP));
    assert.ok(byId.get("compliance-mode")!.answerHtml.includes(FILAMENT_COMPLIANCE_HELP));
    assert.ok(byId.get("custom-presets")!.answerHtml.includes(TUNED_PRESET_HELP));
  });

  it("omits beacon sentence on default / non-official build", () => {
    const items = getFaqItems(false);
    for (const item of items) {
      assert.ok(!item.answerHtml.includes("Cloudflare Web Analytics"), item.id);
      assert.ok(!item.answerHtml.includes("static.cloudflareinsights.com"), item.id);
    }
  });

  it("includes beacon sentence on official build (https://any2orca.com) in verify-no-upload", () => {
    const items = getFaqItems(true);
    const verifyItem = items.find((i) => i.id === "verify-no-upload")!;
    assert.ok(verifyItem);
    assert.ok(verifyItem.answerHtml.includes("Cloudflare Web Analytics"));
    assert.ok(verifyItem.answerHtml.includes("static.cloudflareinsights.com"));
    assert.ok(verifyItem.answerHtml.includes("page-view report of a few hundred bytes; it never contains your file."));
  });

  it("isOfficialBuild and parseSiteUrl agree for unset, none, and a URL", () => {
    assert.equal(isOfficialBuild(undefined), false);
    assert.equal(parseSiteUrl(undefined).isOfficial, false);
    assert.equal(parseSiteUrl(undefined).url, null);

    assert.equal(isOfficialBuild("none"), false);
    assert.equal(parseSiteUrl("none").isOfficial, false);
    assert.equal(parseSiteUrl("none").url, null);

    assert.equal(isOfficialBuild(""), false);
    assert.equal(parseSiteUrl("").isOfficial, false);
    assert.equal(parseSiteUrl("").url, null);

    assert.equal(isOfficialBuild("https://example.com"), false);
    assert.equal(parseSiteUrl("https://example.com").isOfficial, false);
    assert.equal(parseSiteUrl("https://example.com").url, "https://example.com");

    assert.equal(isOfficialBuild("https://any2orca.com"), true);
    assert.equal(parseSiteUrl("https://any2orca.com").isOfficial, true);
    assert.equal(parseSiteUrl("https://any2orca.com").url, "https://any2orca.com");

    assert.equal(isOfficialBuild("https://any2orca.com/"), true);
    assert.equal(parseSiteUrl("https://any2orca.com/").isOfficial, true);
    assert.equal(parseSiteUrl("https://any2orca.com/").url, "https://any2orca.com");
  });

  it("includes the nozzle-size FAQ item naming 0.4 mm and 1.75 mm in getFaqItems, fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const item = items.find((i) => i.id === "nozzle-size")!;
    assert.ok(item, "nozzle-size FAQ item should exist");
    assert.equal(item.question, "Which nozzle size is my file converted for, and why did some filaments change?");
    assert.ok(item.answerHtml.includes("0.4 mm"));
    assert.ok(item.answerHtml.includes("1.75 mm"));
    const fallback = generateFaqPageCrawlerFallback(items);
    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    for (const text of [`<h2>${item.question}</h2>`, item.answerHtml]) {
      assert.ok(fallback.includes(text), "fallback");
      assert.ok(faqHtml.includes(text), "faq/index.html");
    }
  });

  it("defines what the \"any\" in any2orca covers, with seven slicers in the first sentence, in getFaqItems, fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const item = items.find((i) => i.id === "what-any-covers")!;
    assert.ok(item, "what-any-covers FAQ item should exist");
    assert.equal(item.question, 'What does the "any" in any2orca cover?');
    const firstSentence = item.answerHtml.split(".")[0];
    assert.match(firstSentence, /seven slicers/i);
    for (const slicer of ["Bambu Studio", "Creality Print", "Anycubic Slicer Next", "ElegooSlicer", "Flash Studio", "QIDI Studio", "PrusaSlicer"]) {
      assert.ok(item.answerHtml.includes(slicer), slicer);
    }
    assert.ok(
      item.answerHtml.includes(
        '<a href="https://github.com/KuzuriAo/any2orca/issues/new?template=other_slicer.yml" target="_blank" rel="noopener noreferrer">Report it on GitHub</a>',
      ),
    );
    assert.ok(
      item.answerHtml.includes(
        "A project from a slicer built on PrusaSlicer with settings of its own, such as SuperSlicer, isn't converted: any2orca refuses it with a message and changes nothing.",
      ),
    );
    const faqFallback = generateFaqPageCrawlerFallback(items);
    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    for (const faq of items) {
      assert.ok(!faq.answerHtml.includes("A project from any other slicer isn't converted"), faq.id);
    }
    assert.ok(!faqHtml.includes("A project from any other slicer isn't converted"));
    assert.ok(!indexHtml.includes("A project from any other slicer isn't converted"));
    for (const text of [`<h2>${item.question}</h2>`, item.answerHtml]) {
      assert.ok(faqFallback.includes(text), "faqFallback");
      assert.ok(faqHtml.includes(text), "faq/index.html");
    }
  });

  it("includes command line bullet and privacy guide link in getFaqItems, faq fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const privacyItem = items.find((i) => i.id === "privacy-guarantee")!;
    assert.ok(privacyItem, "privacy-guarantee FAQ item should exist");
    assert.ok(privacyItem.answerHtml.includes("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>."));
    assert.ok(privacyItem.answerHtml.includes("The command line works the same way:"));
    assert.ok(privacyItem.answerHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));
    assert.ok(privacyItem.answerHtml.includes('target="_blank" rel="noopener noreferrer"'));

    const faqFallback = generateFaqPageCrawlerFallback(items);
    assert.ok(faqFallback.includes("The command line works the same way:"));
    assert.ok(faqFallback.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));

    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(faqHtml.includes("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>."));
    assert.ok(faqHtml.includes("The command line works the same way:"));
    assert.ok(faqHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));
  });

  it("includes accessibility guide link and keyboard question in getFaqItems, faq fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const a11yItem = items.find((i) => i.id === "accessibility");
    assert.ok(a11yItem, "accessibility FAQ item should exist");
    assert.equal(a11yItem.question, "Can I use any2orca without a mouse?");
    assert.ok(a11yItem.answerHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));
    assert.ok(a11yItem.answerHtml.includes('target="_blank" rel="noopener noreferrer"'));

    const faqFallback = generateFaqPageCrawlerFallback(items);
    assert.ok(faqFallback.includes("Can I use any2orca without a mouse?"));
    assert.ok(faqFallback.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));

    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(faqHtml.includes("Can I use any2orca without a mouse?"));
    assert.ok(faqHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));
  });

  it("includes large files limits bullet and CLI reference link in getFaqItems, faq fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const largeItem = items.find((i) => i.id === "page-unresponsive");
    assert.ok(largeItem, "page-unresponsive FAQ item should exist");

    const defaultGb = `${DEFAULT_MAX_UNPACKED_BYTES / (1024 * 1024 * 1024)} GB`;
    const largeGb = `${LARGE_PROJECT_BYTES / (1024 * 1024 * 1024)} GB`;
    const maxGb = `${MAX_UNPACKED_BYTES_LIMIT / (1024 * 1024 * 1024)} GB`;

    const expectedSnippet1 = `<strong>How large:</strong> projects that unpack to up to ${defaultGb} convert here.`;
    const expectedSnippet2 = `Above ${largeGb} you'll see a note before converting, since it takes a minute or two and a few GB of memory.`;
    const expectedSnippet3 = `A project over ${defaultGb} is refused with the reason; the command line converts larger ones (<code>npx any2orca convert model.3mf --max-unpacked 4GB</code>, up to ${maxGb}, needing about twice that much memory).`;
    const expectedLink = '<a href="https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md" target="_blank" rel="noopener noreferrer">CLI reference</a>';

    assert.ok(largeItem.answerHtml.includes(expectedSnippet1));
    assert.ok(largeItem.answerHtml.includes(expectedSnippet2));
    assert.ok(largeItem.answerHtml.includes(expectedSnippet3));
    assert.ok(largeItem.answerHtml.includes(expectedLink));

    const faqFallback = generateFaqPageCrawlerFallback(items);
    assert.ok(faqFallback.includes(expectedSnippet1));
    assert.ok(faqFallback.includes(expectedSnippet2));
    assert.ok(faqFallback.includes(expectedSnippet3));
    assert.ok(faqFallback.includes(expectedLink));

    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(faqHtml.includes(expectedSnippet1));
    assert.ok(faqHtml.includes(expectedSnippet2));
    assert.ok(faqHtml.includes(expectedSnippet3));
    assert.ok(faqHtml.includes(expectedLink));
  });

  it("names bambu2orca in snorca-240-presets FAQ answer in getFaqItems, faq fallback, and faq/index.html", () => {
    const items = getFaqItems(false);
    const presetItem = items.find((i) => i.id === "snorca-240-presets");
    assert.ok(presetItem, "snorca-240-presets FAQ item should exist");

    const expectedSentence = "Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces), use the old names, so Snapmaker Orca can't match them to a system preset.";
    assert.ok(presetItem.answerHtml.includes(expectedSentence));
    assert.ok(presetItem.answerHtml.includes("Their settings are still correct. Re-convert them if you want them attached to Snapmaker Orca's system preset."));

    const faqFallback = generateFaqPageCrawlerFallback(items);
    assert.ok(faqFallback.includes(expectedSentence));

    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(faqHtml.includes(expectedSentence));
  });

  it("generateCrawlerFallback and generateFaqPageCrawlerFallback produce semantic fallbacks with h1 and no OrcaSlicer", () => {
    const items = getFaqItems(false);
    const starterItems = getStarterFaqItems(false);
    const homeFallback = generateCrawlerFallback(starterItems, false, items.length);
    assert.ok(homeFallback.includes("<h1>any2orca — Bambu Studio &amp; PrusaSlicer 3MF to Snapmaker U1</h1>"));
    assert.ok(homeFallback.includes("any2orca converts Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects"));
    assert.ok(homeFallback.includes("<h2>Common questions</h2>"));
    assert.ok(homeFallback.includes(`<a href="/faq">All ${items.length} questions →</a>`));
    assert.ok(!homeFallback.includes("OrcaSlicer"));
    assert.ok(!homeFallback.includes("Snorca"));

    const faqFallback = generateFaqPageCrawlerFallback(items);
    assert.ok(faqFallback.includes("<h1>Frequently Asked Questions — any2orca</h1>"));
    assert.ok(faqFallback.includes("<li><strong>ELEGOO:</strong> ElegooSlicer (Centauri Carbon 2 <code>.3mf</code>).</li>"));
    assert.ok(faqFallback.includes("<li><strong>Flashforge:</strong> Flash Studio (Creator 5 Pro <code>.3mf</code>).</li>"));
    assert.ok(faqFallback.includes("<li><strong>QIDI:</strong> QIDI Studio (Q1 Pro, Plus4, X series <code>.3mf</code>).</li>"));
    assert.ok(!faqFallback.includes("OrcaSlicer"));
    assert.ok(!faqFallback.includes("Snorca"));
    assert.ok(faqFallback.includes("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile."));
    assert.ok(faqFallback.includes('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>'));
  });

  it("injectCrawlerFallback replaces through intermediate <div> tags to the end of fallback", () => {
    const inputHtml = `<html><head></head><body><div id="app"><header><div>Nested Header Div</div></header><main><section><div>Nested Section Div</div></section></main></div><script src="/src/main.ts"></script></body></html>`;
    const result = injectCrawlerFallback(inputHtml, false);
    assert.ok(!result.includes("Nested Header Div"));
    assert.ok(!result.includes("Nested Section Div"));
    assert.ok(result.includes("<script src=\"/src/main.ts\"></script>"));
    assert.ok(result.includes("<!-- /crawler-fallback -->"));
  });

  it("never says the same sentence twice in one answer", () => {
    const plain = (html: string) =>
      html
        .replace(/<[^>]+>/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    for (const item of getFaqItems(true)) {
      const sentences = plain(item.answerHtml)
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim().toLowerCase())
        .filter((sentence) => sentence.length >= 25);
      const seen = new Set<string>();
      for (const sentence of sentences) {
        assert.ok(!seen.has(sentence), `${item.id} says this twice: "${sentence}"`);
        seen.add(sentence);
      }
    }
  });

});

describe("index.html SEO metadata and structured data", () => {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

  it("has new description across description, og:description, and twitter:description", () => {
    const expectedDesc = "Convert Bambu Studio, Creality Print, Anycubic, ELEGOO, Flashforge, QIDI and PrusaSlicer .3mf projects for the Snapmaker U1. Painting, supports and print settings kept. No uploads, no account.";
    assert.ok(indexHtml.includes(`content="${expectedDesc}"`));
    const descMatches = indexHtml.match(new RegExp(expectedDesc, "g"));
    assert.equal(descMatches?.length, 3, "description, og:description, and twitter:description match");
  });

  it("has no keywords meta tag and no title meta tag", () => {
    assert.ok(!indexHtml.includes('<meta name="keywords"'));
    assert.ok(!indexHtml.includes('<meta name="title"'));
  });

  it("has no HowTo JSON-LD block", () => {
    assert.ok(!indexHtml.includes('"@type": "HowTo"'));
  });

  it("has valid WebApplication JSON-LD that parses without error", () => {
    const jsonLdMatch = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(jsonLdMatch, "JSON-LD script tag found");
    const parsed = JSON.parse(jsonLdMatch[1]);
    assert.equal(parsed["@type"], "WebApplication");
    assert.equal(parsed.name, "any2orca");
    assert.equal(parsed.isAccessibleForFree, true);
    assert.equal(parsed.offers.price, "0");
    assert.equal(parsed.publisher.name, "KuzuriAo");
    assert.equal(parsed.publisher.url, "https://kuzuriao.com");
    assert.ok(Array.isArray(parsed.featureList));
  });

  it("contains no OrcaSlicer in index.html or faq/index.html head or crawler fallback", () => {
    const faqHtml = fs.readFileSync(faqHtmlPath, "utf8");
    assert.ok(!indexHtml.includes("OrcaSlicer"));
    assert.ok(!indexHtml.includes("Snorca"));
    assert.ok(!faqHtml.includes("OrcaSlicer"));
    assert.ok(!faqHtml.includes("Snorca"));
    assert.ok(faqHtml.includes("<h1>Frequently Asked Questions — any2orca</h1>"));
    assert.ok(faqHtml.includes("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile."));
    assert.ok(faqHtml.includes('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>'));
  });

  it("every image named by og:image and twitter:image exists in public/ and is a 1200x630 PNG", () => {
    const publicDir = path.resolve(__dirname, "../../public");
    const ogMatch = indexHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    const twitterMatch = indexHtml.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/);
    assert.ok(ogMatch, "og:image meta tag must exist");
    assert.ok(twitterMatch, "twitter:image meta tag must exist");

    for (const urlStr of [ogMatch[1], twitterMatch[1]]) {
      const fileName = new URL(urlStr, "https://any2orca.com").pathname.replace(/^\/+/, "");
      const imgPath = path.join(publicDir, fileName);
      assert.ok(fs.existsSync(imgPath), `Image ${fileName} must exist in apps/web/public/`);
      const buf = fs.readFileSync(imgPath);
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      assert.deepEqual(buf.subarray(0, 8), pngSignature, `${fileName} must have PNG signature`);
      assert.equal(buf.subarray(12, 16).toString("ascii"), "IHDR", `${fileName} must start with IHDR chunk`);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(width, 1200, `${fileName} width must be 1200`);
      assert.equal(height, 630, `${fileName} height must be 630`);
    }
  });

  it("no file in apps/web outside tests still says 'Bambu Studio to Snapmaker U1'", () => {
    const webRoot = path.resolve(__dirname, "../..");
    const walk = (dir: string): string[] => {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === "node_modules" ||
          entry.name === "e2e" ||
          entry.name.startsWith("dist") ||
          entry.name === "test-results" ||
          entry.name === "playwright-report"
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...walk(full));
        } else if (
          !entry.name.endsWith(".test.ts") &&
          !entry.name.endsWith(".spec.ts") &&
          /\.(ts|svelte|html|css|json|md|txt)$/i.test(entry.name)
        ) {
          results.push(full);
        }
      }
      return results;
    };

    for (const filePath of walk(webRoot)) {
      const content = fs.readFileSync(filePath, "utf8");
      assert.ok(
        !content.includes("Bambu Studio to Snapmaker U1"),
        `${path.relative(webRoot, filePath)} must not contain old phrase 'Bambu Studio to Snapmaker U1'`
      );
    }
  });
});

describe("VITE_SITE_URL official vs default build behavior", () => {
  it("build with VITE_SITE_URL=https://any2orca.com includes the beacon sentence in bundle and faq fallback", () => {
    const tempOutDir = mkdtempSync(join(tmpdir(), "a2o-official-build-"));
    try {
      execSync(`npx vite build --outDir ${tempOutDir}`, {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, VITE_SITE_URL: "https://any2orca.com" },
        stdio: "pipe",
        encoding: "utf8",
      });

      const distFaqHtml = readFileSync(join(tempOutDir, "faq", "index.html"), "utf8");
      assert.ok(distFaqHtml.includes("Cloudflare Web Analytics"));
      assert.ok(distFaqHtml.includes("static.cloudflareinsights.com"));
      assert.ok(distFaqHtml.includes('<link rel="canonical" href="https://any2orca.com/faq" />'));

      const assetsDir = join(tempOutDir, "assets");
      const jsFiles = readdirSync(assetsDir).filter((f: string) => f.endsWith(".js") && f.startsWith("index-"));
      assert.ok(jsFiles.length > 0);
      const bundle = jsFiles.map((f: string) => readFileSync(join(assetsDir, f), "utf8")).join("\n");
      assert.ok(bundle.includes("Cloudflare Web Analytics"));
    } finally {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  it("default build with unset VITE_SITE_URL omits the beacon sentence", () => {
    const tempOutDir = mkdtempSync(join(tmpdir(), "a2o-default-build-"));
    try {
      execSync(`npx vite build --outDir ${tempOutDir}`, {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, VITE_SITE_URL: undefined },
        stdio: "pipe",
        encoding: "utf8",
      });

      const distHtml = readFileSync(join(tempOutDir, "index.html"), "utf8");
      assert.ok(!distHtml.includes("Cloudflare Web Analytics"));
      const distFaqHtml = readFileSync(join(tempOutDir, "faq", "index.html"), "utf8");
      assert.ok(!distFaqHtml.includes("Cloudflare Web Analytics"));
      assert.ok(!distFaqHtml.includes('<link rel="canonical" href="https://any2orca.com/faq"'));

      const assetsDir = join(tempOutDir, "assets");
      const jsFiles = readdirSync(assetsDir).filter((f: string) => f.endsWith(".js") && f.startsWith("index-"));
      assert.ok(jsFiles.length > 0);
      assert.ok(!distHtml.includes("Cloudflare Web Analytics"));
      assert.ok(!distHtml.includes('<link rel="canonical" href="https://any2orca.com/'));
      assert.ok(!distHtml.includes("google-site-verification"));

      // Verify LICENSE.txt and NOTICE.txt exist in distribution
      assert.ok(fs.existsSync(join(tempOutDir, "LICENSE.txt")), "LICENSE.txt should exist in dist");
      assert.ok(fs.existsSync(join(tempOutDir, "NOTICE.txt")), "NOTICE.txt should exist in dist");
      assert.ok(readFileSync(join(tempOutDir, "LICENSE.txt"), "utf8").includes("GNU AFFERO GENERAL PUBLIC LICENSE"));
      assert.ok(readFileSync(join(tempOutDir, "NOTICE.txt"), "utf8").includes("any2orca"));
    } finally {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });
});
