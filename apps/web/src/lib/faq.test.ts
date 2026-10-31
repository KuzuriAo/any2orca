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
import { getFaqItems, generateCrawlerFallback, injectCrawlerFallback, isOfficialBuild } from "./faq";
import { parseSiteUrl } from "./site-metadata";
import { DEFAULT_MAX_UNPACKED_BYTES, LARGE_PROJECT_BYTES, MAX_UNPACKED_BYTES_LIMIT } from "any2orca";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dirname, "../../index.html");

describe("FAQ items and beacon sentence", () => {
  it("omits beacon sentence on default / non-official build", () => {
    const items = getFaqItems(false);
    const privacyItem = items.find((i) => i.id === "privacy-guarantee")!;
    assert.ok(privacyItem);
    assert.ok(!privacyItem.answerHtml.includes("Cloudflare Web Analytics"));
    assert.ok(!privacyItem.answerHtml.includes("static.cloudflareinsights.com"));
  });

  it("includes beacon sentence on official build (https://any2orca.com)", () => {
    const items = getFaqItems(true);
    const privacyItem = items.find((i) => i.id === "privacy-guarantee")!;
    assert.ok(privacyItem);
    assert.ok(privacyItem.answerHtml.includes("Cloudflare Web Analytics"));
    assert.ok(privacyItem.answerHtml.includes("static.cloudflareinsights.com"));
    assert.ok(privacyItem.answerHtml.includes("page-view report of a few hundred bytes; it never contains your file."));
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


  it("defines what the \"any\" in any2orca covers, the same in getFaqItems, fallback, and index.html", () => {
    const item = getFaqItems(false).find((i) => i.id === "what-any-covers")!;
    assert.ok(item, "what-any-covers FAQ item should exist");
    assert.equal(item.question, 'What does the "any" in any2orca cover?');
    for (const slicer of ["Bambu Studio", "Creality Print", "Anycubic Slicer Next", "ElegooSlicer", "Flash Studio"]) assert.ok(item.answerHtml.includes(slicer), slicer);
    assert.ok(item.answerHtml.includes("refuses it with a message and changes nothing"));
    const fallback = generateCrawlerFallback(getFaqItems(false));
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    for (const text of [`<h2>${item.question}</h2>`, item.answerHtml]) {
      assert.ok(fallback.includes(text), "fallback");
      assert.ok(indexHtml.includes(text), "index.html");
    }
  });

  it("includes command line bullet and privacy guide link in getFaqItems, fallback, and index.html", () => {
    const items = getFaqItems(false);
    const privacyItem = items.find((i) => i.id === "privacy-guarantee")!;
    assert.ok(privacyItem, "privacy-guarantee FAQ item should exist");
    assert.ok(privacyItem.answerHtml.includes("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>."));
    assert.ok(privacyItem.answerHtml.includes("The command line works the same way:"));
    assert.ok(privacyItem.answerHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));
    assert.ok(privacyItem.answerHtml.includes('target="_blank" rel="noopener noreferrer"'));

    const fallback = generateCrawlerFallback(items);
    assert.ok(fallback.includes("The command line works the same way:"));
    assert.ok(fallback.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    assert.ok(indexHtml.includes("Unlike online converters that upload your whole <code>.3mf</code> file to a server, <strong>any2orca runs entirely in your browser</strong>."));
    assert.ok(indexHtml.includes("The command line works the same way:"));
    assert.ok(indexHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/privacy.md"));
  });

  it("includes accessibility guide link and keyboard question in getFaqItems, fallback, and index.html", () => {
    const items = getFaqItems(false);
    const a11yItem = items.find((i) => i.id === "accessibility");
    assert.ok(a11yItem, "accessibility FAQ item should exist");
    assert.equal(a11yItem.question, "Can I use any2orca without a mouse?");
    assert.ok(a11yItem.answerHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));
    assert.ok(a11yItem.answerHtml.includes('target="_blank" rel="noopener noreferrer"'));

    const fallback = generateCrawlerFallback(items);
    assert.ok(fallback.includes("Can I use any2orca without a mouse?"));
    assert.ok(fallback.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    assert.ok(indexHtml.includes("Can I use any2orca without a mouse?"));
    assert.ok(indexHtml.includes("https://github.com/KuzuriAo/any2orca/blob/main/docs/accessibility.md"));
  });

  it("includes large files limits bullet and CLI reference link in getFaqItems, fallback, and index.html", () => {
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

    const fallback = generateCrawlerFallback(items);
    assert.ok(fallback.includes(expectedSnippet1));
    assert.ok(fallback.includes(expectedSnippet2));
    assert.ok(fallback.includes(expectedSnippet3));
    assert.ok(fallback.includes(expectedLink));

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    assert.ok(indexHtml.includes(expectedSnippet1));
    assert.ok(indexHtml.includes(expectedSnippet2));
    assert.ok(indexHtml.includes(expectedSnippet3));
    assert.ok(indexHtml.includes(expectedLink));
  });

  it("names bambu2orca in snorca-240-presets FAQ answer in getFaqItems, fallback, and index.html", () => {
    const items = getFaqItems(false);
    const presetItem = items.find((i) => i.id === "snorca-240-presets");
    assert.ok(presetItem, "snorca-240-presets FAQ item should exist");

    const expectedSentence = "Files converted before October 14, 2026, by bambu2orca (the converter any2orca replaces), use the old names, so Snapmaker Orca can't match them to a system preset.";
    assert.ok(presetItem.answerHtml.includes(expectedSentence));
    assert.ok(presetItem.answerHtml.includes("Their settings are still correct. Re-convert them if you want them attached to Snapmaker Orca's system preset."));

    const fallback = generateCrawlerFallback(items);
    assert.ok(fallback.includes(expectedSentence));

    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
    assert.ok(indexHtml.includes(expectedSentence));
  });

  it("generateCrawlerFallback produces semantic fallback with h1 and no OrcaSlicer", () => {
    const items = getFaqItems(false);
    const fallback = generateCrawlerFallback(items);
    assert.ok(fallback.includes("<h1>any2orca — Bambu Studio to Snapmaker U1 3MF Converter</h1>"));
    assert.ok(fallback.includes("any2orca converts Bambu Studio, Creality Print, Anycubic, ELEGOO and Flashforge .3mf projects"));
    assert.ok(fallback.includes("<li><strong>ELEGOO:</strong> ElegooSlicer (Centauri Carbon 2 <code>.3mf</code>).</li>"));
    assert.ok(fallback.includes("<li><strong>Flashforge:</strong> Flash Studio (Creator 5 Pro <code>.3mf</code>).</li>"));
    assert.ok(!fallback.includes("OrcaSlicer"));
    assert.ok(!fallback.includes("Snorca"));
    assert.ok(fallback.includes("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile."));
    assert.ok(fallback.includes('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>'));
  });

  it("injectCrawlerFallback replaces through intermediate <div> tags to the end of fallback", () => {
    const inputHtml = `<html><head></head><body><div id="app"><header><div>Nested Header Div</div></header><main><section><div>Nested Section Div</div></section></main></div><script src="/src/main.ts"></script></body></html>`;
    const result = injectCrawlerFallback(inputHtml, false);
    assert.ok(!result.includes("Nested Header Div"));
    assert.ok(!result.includes("Nested Section Div"));
    assert.ok(result.includes("<script src=\"/src/main.ts\"></script>"));
    assert.ok(result.includes("<!-- /crawler-fallback -->"));
  });
});

describe("index.html SEO metadata and structured data", () => {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

  it("has new description across description, og:description, and twitter:description", () => {
    const expectedDesc = "Convert Bambu Studio, Creality Print, Anycubic, ELEGOO and Flashforge .3mf projects for the Snapmaker U1. Painting, supports and print settings kept. No uploads, no account.";
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

  it("contains no OrcaSlicer in index.html head or crawler fallback", () => {
    assert.ok(!indexHtml.includes("OrcaSlicer"));
    assert.ok(!indexHtml.includes("Snorca"));
    assert.ok(indexHtml.includes("A 3MF that holds only the model, such as one saved by a CAD or modeling app like Fusion or Blender, doesn't need converting: open it in Snapmaker Orca and choose a U1 profile."));
    assert.ok(indexHtml.includes('<a href="https://shop.snapmaker.com/products/liber-high-flow-hotend" target="_blank" rel="noopener noreferrer">Snapmaker Liber High Flow Hotend</a>'));
  });
});

describe("VITE_SITE_URL official vs default build behavior", () => {
  it("build with VITE_SITE_URL=https://any2orca.com includes the beacon sentence in bundle and fallback", () => {
    const tempOutDir = mkdtempSync(join(tmpdir(), "a2o-official-build-"));
    try {
      execSync(`npx vite build --outDir ${tempOutDir}`, {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, VITE_SITE_URL: "https://any2orca.com" },
        stdio: "pipe",
        encoding: "utf8",
      });

      const distHtml = readFileSync(join(tempOutDir, "index.html"), "utf8");
      assert.ok(distHtml.includes("Cloudflare Web Analytics"));
      assert.ok(distHtml.includes("static.cloudflareinsights.com"));

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

      const assetsDir = join(tempOutDir, "assets");
      const jsFiles = readdirSync(assetsDir).filter((f: string) => f.endsWith(".js") && f.startsWith("index-"));
      assert.ok(jsFiles.length > 0);
      const bundle = jsFiles.map((f: string) => readFileSync(join(assetsDir, f), "utf8")).join("\n");
      // Default build dist/index.html has no any2orca.com canonical and no google-site-verification
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
