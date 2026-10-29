// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSiteUrl,
  transformHtmlMetadata,
  generateRobotsTxt,
  generateSitemapXml,
  escapeHtmlAttr,
  escapeXml,
  OFFICIAL_SITE_URL,
} from "./site-metadata";

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="https://any2orca.com/" />
    <meta name="google-site-verification" content="test-verification-code" />
    <meta property="og:url" content="https://any2orca.com/" />
    <meta property="og:image" content="https://any2orca.com/og-image-any2orca.png" />
    <meta name="twitter:url" content="https://any2orca.com/" />
    <meta name="twitter:image" content="https://any2orca.com/og-image-any2orca.png" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "any2orca",
        "url": "https://any2orca.com/",
        "image": "https://any2orca.com/og-image-any2orca.png"
      }
    </script>
  </head>
</html>`;

describe("site metadata: parseSiteUrl", () => {
  it("treats unset / undefined as an unofficial copy", () => {
    const config = parseSiteUrl(undefined);
    assert.equal(config.url, null);
    assert.equal(config.isOfficial, false);
  });

  it("recognizes explicit official URL with or without trailing slash", () => {
    const withoutSlash = parseSiteUrl("https://any2orca.com");
    assert.equal(withoutSlash.url, OFFICIAL_SITE_URL);
    assert.equal(withoutSlash.isOfficial, true);

    const withSlash = parseSiteUrl("https://any2orca.com/");
    assert.equal(withSlash.url, OFFICIAL_SITE_URL);
    assert.equal(withSlash.isOfficial, true);
  });

  it("returns null for private / disabled settings", () => {
    for (const val of ["", "   ", "none", "NONE", "false", "null", "off"]) {
      const config = parseSiteUrl(val);
      assert.equal(config.url, null, `failed for ${val}`);
      assert.equal(config.isOfficial, false);
    }
  });

  it("normalizes subpaths, trailing slashes, uppercase schemes, and default ports", () => {
    const trailingSlash = parseSiteUrl("https://myhost.example.org/");
    assert.equal(trailingSlash.url, "https://myhost.example.org");
    assert.equal(trailingSlash.isOfficial, false);

    const subpath = parseSiteUrl("https://example.com/tools/any2orca");
    assert.equal(subpath.url, "https://example.com/tools/any2orca");
    assert.equal(subpath.isOfficial, false);

    const subpathTrailing = parseSiteUrl("https://example.com/tools/any2orca/");
    assert.equal(subpathTrailing.url, "https://example.com/tools/any2orca");

    const uppercase = parseSiteUrl("HTTPS://EXAMPLE.COM/TOOLS/ANY2ORCA/");
    assert.equal(uppercase.url, "https://example.com/TOOLS/ANY2ORCA");

    const defaultHttpPort = parseSiteUrl("http://example.com:80/tools");
    assert.equal(defaultHttpPort.url, "http://example.com/tools");

    const defaultHttpsPort = parseSiteUrl("https://example.com:443/tools");
    assert.equal(defaultHttpsPort.url, "https://example.com/tools");

    const nonDefaultPort = parseSiteUrl("http://example.com:8080/tools");
    assert.equal(nonDefaultPort.url, "http://example.com:8080/tools");

    const complexPath = parseSiteUrl("https://example.com/tools_v1/a2o~app/sub-path");
    assert.equal(complexPath.url, "https://example.com/tools_v1/a2o~app/sub-path");
  });

  it("rejects hostile and malformed values with descriptive error naming VITE_SITE_URL", () => {
    const hostileInputs = [
      "https://evil.example/\"><script>alert(1)</script>",
      "https://example.com/\"quote\"",
      "https://example.com/'singlequote'",
      "https://example.com/<script>",
      "https://example.com/newline\ninjection",
      "https://example.com/cr\r\ninjection",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com/files",
      "https://user:password@example.com",
      "https://user@example.com",
      "https://example.com/?query=param",
      "https://example.com/tools?query=1",
      "https://example.com/#fragment",
      "https://example.com/tools#section",
      "https://example.com/" + "a".repeat(5000),
      "not a url",
      "https://example.com/invalid path with spaces",
      "https://example.com/tools/!forbidden",
      "https://example.com/tools/$forbidden",
      "https://example.com/tools/@forbidden",
    ];

    for (const hostile of hostileInputs) {
      assert.throws(
        () => parseSiteUrl(hostile),
        (err: Error) => {
          assert.match(err.message, /VITE_SITE_URL/);
          return true;
        },
        `Expected rejection for: ${hostile}`
      );
    }
  });
});

describe("site metadata: escaping helpers", () => {
  it("escapes characters for HTML attributes", () => {
    const raw = `https://example.com/?a=1&b="2"&c='3'&d=<4>`;
    const escaped = escapeHtmlAttr(raw);
    assert.equal(escaped, "https://example.com/?a=1&amp;b=&quot;2&quot;&amp;c=&#39;3&#39;&amp;d=&lt;4&gt;");
  });

  it("escapes characters for XML content", () => {
    const raw = `https://example.com/<tag>&"quote"'`;
    const escaped = escapeXml(raw);
    assert.equal(escaped, "https://example.com/&lt;tag&gt;&amp;&quot;quote&quot;&apos;");
  });
});

describe("site metadata: transformHtmlMetadata", () => {
  it("leaves official site HTML byte-for-byte untouched", () => {
    const config = parseSiteUrl("https://any2orca.com");
    const transformed = transformHtmlMetadata(SAMPLE_HTML, config);
    assert.equal(transformed, SAMPLE_HTML);
  });

  it("rewrites tags to custom URL and removes official google-site-verification", () => {
    const config = parseSiteUrl("https://myhost.example.org");
    const transformed = transformHtmlMetadata(SAMPLE_HTML, config);

    assert.ok(transformed.includes('<link rel="canonical" href="https://myhost.example.org/" />'));
    assert.ok(!transformed.includes("google-site-verification"));
    assert.ok(transformed.includes('<meta property="og:url" content="https://myhost.example.org/" />'));
    assert.ok(transformed.includes('<meta property="og:image" content="https://myhost.example.org/og-image-any2orca.png" />'));
    assert.ok(transformed.includes('<meta name="twitter:url" content="https://myhost.example.org/" />'));
    assert.ok(transformed.includes('<meta name="twitter:image" content="https://myhost.example.org/og-image-any2orca.png" />'));
    assert.ok(transformed.includes('"url": "https://myhost.example.org/"'));
    assert.ok(transformed.includes('"image": "https://myhost.example.org/og-image-any2orca.png"'));
    assert.ok(!transformed.includes("https://any2orca.com"));
    assert.ok(transformed.includes('<meta name="robots" content="index, follow'));
  });

  it("adds noindex/nofollow and removes canonical/verification/remote URLs for private copy", () => {
    const config = parseSiteUrl("none");
    const transformed = transformHtmlMetadata(SAMPLE_HTML, config);

    assert.ok(transformed.includes('<meta name="robots" content="noindex, nofollow" />'));
    assert.ok(!transformed.includes("index, follow"));
    assert.ok(!transformed.includes("canonical"));
    assert.ok(!transformed.includes("google-site-verification"));
    assert.ok(!transformed.includes("og:url"));
    assert.ok(!transformed.includes("twitter:url"));
    assert.ok(!transformed.includes('"url":'));
    assert.ok(transformed.includes('<meta property="og:image" content="/og-image-any2orca.png" />'));
    assert.ok(transformed.includes('<meta name="twitter:image" content="/og-image-any2orca.png" />'));
    assert.ok(transformed.includes('"image": "/og-image-any2orca.png"'));
    assert.ok(!transformed.includes("https://any2orca.com"));
  });
});

describe("site metadata: robots and sitemap generators", () => {
  it("derives dynamic sitemap lastmod from build date", () => {
    const config = parseSiteUrl("https://any2orca.com");
    const sitemap = generateSitemapXml(config);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(sitemap?.includes(`<lastmod>${today}</lastmod>`));
    assert.match(sitemap || "", /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("generates official robots.txt and sitemap.xml for official URL", () => {
    const config = parseSiteUrl("https://any2orca.com");
    const robots = generateRobotsTxt(config);
    assert.equal(robots, "User-agent: *\nAllow: /\n\nSitemap: https://any2orca.com/sitemap.xml\n");

    const sitemap = generateSitemapXml(config);
    assert.ok(sitemap?.includes("<loc>https://any2orca.com/</loc>"));
  });

  it("generates custom robots.txt and sitemap.xml for custom URL", () => {
    const config = parseSiteUrl("https://myhost.example.org");
    const robots = generateRobotsTxt(config);
    assert.equal(robots, "User-agent: *\nAllow: /\n\nSitemap: https://myhost.example.org/sitemap.xml\n");

    const sitemap = generateSitemapXml(config);
    assert.ok(sitemap?.includes("<loc>https://myhost.example.org/</loc>"));
  });

  it("produces Disallow: / and omits sitemap for private or unset instances", () => {
    for (const val of ["none", undefined]) {
      const config = parseSiteUrl(val);
    const robots = generateRobotsTxt(config);
    assert.equal(robots, "User-agent: *\nDisallow: /\n");
    assert.ok(!robots.includes("Sitemap:"));

    const sitemap = generateSitemapXml(config);
    assert.equal(sitemap, null);
    }
  });

  it("refuses line breaks in generateRobotsTxt as defense in depth", () => {
    assert.throws(
      () => generateRobotsTxt({ url: "https://example.com\nDisallow: /secret", isOfficial: false }),
      /line breaks/
    );
  });
});
