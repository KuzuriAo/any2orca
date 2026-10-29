// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getInitialBrand, applyBrand, normalizeBrand } from "./brand";
describe("brand state management", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    (globalThis as any).sessionStorage = {
      getItem: (k: string) => mockStorage[`session_${k}`] || null,
      setItem: (k: string, v: string) => {
        mockStorage[`session_${k}`] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[`session_${k}`];
      },
      clear: () => {
        mockStorage = {};
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it("normalizes brand aliases cleanly", () => {
    assert.equal(normalizeBrand("oss"), "oss");
    assert.equal(normalizeBrand("neutral"), "oss");
    assert.equal(normalizeBrand("opensource"), "oss");

    assert.equal(normalizeBrand("a2o"), "a2o");
    assert.equal(normalizeBrand("any2orca"), "a2o");

    assert.equal(normalizeBrand("b2o"), null);
    assert.equal(normalizeBrand("branded"), null);
    assert.equal(normalizeBrand("unknown"), null);
    assert.equal(normalizeBrand(null), null);
  });

  it("production: strictly driven by VITE_BRAND and ignores query params", () => {
    (globalThis as any).window = {
      location: {
        search: "?brand=a2o&render=a2o",
      },
    };

    // Even though window.location.search has ?brand=a2o, production must ignore it and default to oss
    assert.equal(getInitialBrand({ DEV: false }), "oss");

    // With VITE_BRAND=oss, production honors build setting
    assert.equal(getInitialBrand({ DEV: false, VITE_BRAND: "oss" }), "oss");

    // With legacy VITE_BRAND=neutral, production normalizes to oss
    assert.equal(getInitialBrand({ DEV: false, VITE_BRAND: "neutral" }), "oss");

    // With VITE_BRAND=a2o, production honors build setting
    assert.equal(getInitialBrand({ DEV: false, VITE_BRAND: "a2o" }), "a2o");
    assert.equal(getInitialBrand({ DEV: false, VITE_BRAND: "any2orca" }), "a2o");
  });

  it("dev server: honors ?brand= for side-by-side local previews", () => {
    (globalThis as any).window = {
      location: {
        search: "?brand=a2o",
      },
    };
    assert.equal(getInitialBrand({ DEV: true, VITE_BRAND: "oss" }), "a2o");

    (globalThis as any).window = {
      location: {
        search: "?brand=oss",
      },
    };
    assert.equal(getInitialBrand({ DEV: true, VITE_BRAND: "a2o" }), "oss");
  });

  it("never reads or writes to localStorage", () => {
    (globalThis as any).window = {
      location: {
        search: "",
      },
    };

    // Pre-populate localStorage with a stale value
    localStorage.setItem("any2orca_brand", "a2o");

    // Must not read localStorage
    assert.equal(getInitialBrand({ DEV: false, VITE_BRAND: "oss" }), "oss");

    // applyBrand must not write to localStorage
    const attrs = new Map<string, string>();
    (globalThis as any).document = {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) || null,
      },
    };

    applyBrand("oss");
    assert.equal((globalThis as any).document.documentElement.getAttribute("data-brand"), "oss");
    assert.equal(mockStorage["any2orca_brand"], "a2o"); // Unchanged from pre-populate
    assert.equal(Object.keys(mockStorage).filter((k) => !k.startsWith("session_")).length, 1);
  });
});

describe("brand favicon and asset output", () => {
  it("ships brand-specific SVGs and differing binary assets for each skin", () => {
    const brandingDir = path.resolve(import.meta.dirname, "../assets/branding");

    const ossSvg = fs.readFileSync(path.resolve(brandingDir, "favicon-oss.svg"), "utf8");
    const a2oSvg = fs.readFileSync(path.resolve(brandingDir, "favicon-a2o.svg"), "utf8");

    assert.ok(ossSvg.includes("#0284c7"), "oss favicon.svg uses #0284c7");
    assert.ok(a2oSvg.includes("#8b5cf6"), "a2o favicon.svg uses #8b5cf6");

    const ossIco = fs.readFileSync(path.resolve(brandingDir, "favicon-oss.ico"));
    const a2oIco = fs.readFileSync(path.resolve(brandingDir, "favicon-a2o.ico"));
    assert.ok(ossIco.length > 0 && a2oIco.length > 0);
    assert.notDeepEqual(ossIco, a2oIco, "favicon.ico differs between oss and a2o");

    const ossPng = fs.readFileSync(path.resolve(brandingDir, "logo-oss.png"));
    const a2oPng = fs.readFileSync(path.resolve(brandingDir, "logo-a2o.png"));
    assert.ok(ossPng.length > 0 && a2oPng.length > 0);
    assert.notDeepEqual(ossPng, a2oPng, "logo.png differs between oss and a2o");
  });
});
