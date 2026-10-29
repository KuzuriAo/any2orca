// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_HIDE_SECTIONS,
  parseHideSections,
  parseRuntimeHideSections,
  injectHideSectionsAttribute,
  isSectionHidden,
  _resetHiddenSectionsCache,
} from "./hiddenSections";

describe("ALLOWED_HIDE_SECTIONS", () => {
  it("exports the single canonical list of four allowed section names", () => {
    assert.deepEqual(ALLOWED_HIDE_SECTIONS, ["beyond", "faq", "integrate", "support"]);
  });
});

describe("parseHideSections (build-time strict validation)", () => {
  it("returns an empty set when undefined or empty", () => {
    assert.deepEqual(parseHideSections(undefined), new Set());
    assert.deepEqual(parseHideSections(""), new Set());
    assert.deepEqual(parseHideSections("   "), new Set());
  });

  it("parses valid individual sections", () => {
    for (const section of ALLOWED_HIDE_SECTIONS) {
      assert.deepEqual(parseHideSections(section), new Set([section]));
    }
  });

  it("parses comma-separated combinations with trimming and lowercase normalization", () => {
    const result = parseHideSections(" BEYOND,  faq , support ");
    assert.deepEqual(result, new Set(["beyond", "faq", "support"]));
    assert.equal(result.has("integrate"), false);
  });

  it("rejects unknown section names with an informative error", () => {
    assert.throws(
      () => parseHideSections("unknown"),
      /Invalid VITE_HIDE_SECTIONS: "unknown"\. Unknown section name\. Allowed section names are: beyond, faq, integrate, support\./
    );
    assert.throws(
      () => parseHideSections("beyond, invalid-section"),
      /Invalid VITE_HIDE_SECTIONS: "invalid-section"\./
    );
  });
});

describe("parseRuntimeHideSections (forgiving runtime parser)", () => {
  it("handles undefined, null, and empty string by returning an empty set", () => {
    assert.deepEqual(parseRuntimeHideSections(undefined), new Set());
    assert.deepEqual(parseRuntimeHideSections(null), new Set());
    assert.deepEqual(parseRuntimeHideSections(""), new Set());
    assert.deepEqual(parseRuntimeHideSections("   "), new Set());
  });

  it("trims and normalizes lowercase", () => {
    const parsed = parseRuntimeHideSections("  BEYOND , FAQ  ");
    assert.deepEqual(parsed, new Set(["beyond", "faq"]));
  });

  it("silently drops unknown names and keeps valid ones", () => {
    const parsed = parseRuntimeHideSections("beyond, unknown_foo, faq, invalid-bar");
    assert.deepEqual(parsed, new Set(["beyond", "faq"]));
  });

  it("caps input length at 100 characters safely", () => {
    const longGarbage = "x".repeat(150);
    assert.deepEqual(parseRuntimeHideSections(longGarbage), new Set());

    // Valid section placed within first 100 chars, trailing garbage beyond 100
    const longWithValid = "beyond," + "y".repeat(120);
    assert.deepEqual(parseRuntimeHideSections(longWithValid), new Set(["beyond"]));
  });

  it("never throws on hostile or malformed input and drops everything outside allowed list", () => {
    assert.doesNotThrow(() => {
      const parsed = parseRuntimeHideSections("beyond,<script>alert(1)</script>,__proto__,x");
      assert.deepEqual(parsed, new Set(["beyond"]));
    });
  });

  it("never returns anything outside the four allowed sections", () => {
    const parsed = parseRuntimeHideSections("beyond,faq,integrate,support,other,admin");
    for (const item of parsed) {
      assert.ok(ALLOWED_HIDE_SECTIONS.includes(item));
    }
    assert.equal(parsed.size, 4);
  });
});

describe("injectHideSectionsAttribute", () => {
  it("returns html unchanged when hiddenSections is empty", () => {
    const html = "<!doctype html>\n<html lang=\"en\">\n<head></head>";
    assert.equal(injectHideSectionsAttribute(html, new Set()), html);
  });

  it("writes data-hide attribute into <html ...>", () => {
    const html = "<!doctype html>\n<html lang=\"en\" data-brand=\"oss\">\n<head></head>";
    const output = injectHideSectionsAttribute(html, new Set(["beyond", "faq"]));
    assert.match(output, /<html [^>]*data-hide="beyond,faq"[^>]*>/);
  });

  it("updates existing data-hide attribute if present", () => {
    const html = "<!doctype html>\n<html lang=\"en\" data-hide=\"old\">";
    const output = injectHideSectionsAttribute(html, new Set(["support"]));
    assert.equal(output.includes("data-hide=\"old\""), false);
    assert.equal(output.includes("data-hide=\"support\""), true);
  });
});

describe("isSectionHidden", () => {
  beforeEach(() => {
    _resetHiddenSectionsCache();
  });

  it("defaults to false when document is undefined or has no data-hide", () => {
    assert.equal(isSectionHidden("beyond"), false);
    assert.equal(isSectionHidden("faq"), false);
  });

  it("reads from document.documentElement.dataset.hide when present and caches", () => {
    const originalDoc = globalThis.document;
    try {
      const fakeDoc = {
        documentElement: {
          dataset: {
            hide: "beyond,faq",
          },
        },
      };
      // @ts-expect-error test stub
      globalThis.document = fakeDoc;

      assert.equal(isSectionHidden("beyond"), true);
      assert.equal(isSectionHidden("faq"), true);
      assert.equal(isSectionHidden("integrate"), false);
      assert.equal(isSectionHidden("support"), false);

      // Verify cached value is returned even if dataset changes without cache reset
      fakeDoc.documentElement.dataset.hide = "";
      assert.equal(isSectionHidden("beyond"), true);

      // Reset cache clears it
      _resetHiddenSectionsCache();
      assert.equal(isSectionHidden("beyond"), false);
    } finally {
      globalThis.document = originalDoc;
    }
  });
});
