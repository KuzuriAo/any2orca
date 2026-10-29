// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { copyTextToClipboard } from "./clipboard.js";

describe("copyTextToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true, writable: true });
  });

  it("uses navigator.clipboard.writeText when available and returns true", async () => {
    let written = "";
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: async (t: string) => {
            written = t;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard("hello world");
    assert.equal(result, true);
    assert.equal(written, "hello world");
  });

  it("falls back to document.execCommand when navigator.clipboard is undefined", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });

    let execCommandCalled = false;
    let appendedChild: any = null;
    let removedChild: any = null;

    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: (tag: string) => {
          return {
            tagName: tag,
            style: {},
            setAttribute: () => {},
            focus: () => {},
            select: () => {},
            value: "",
          };
        },
        body: {
          appendChild: (node: any) => {
            appendedChild = node;
          },
          removeChild: (node: any) => {
            removedChild = node;
          },
        },
        execCommand: (command: string) => {
          if (command === "copy") {
            execCommandCalled = true;
            return true;
          }
          return false;
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard("fallback text");
    assert.equal(result, true);
    assert.equal(execCommandCalled, true);
    assert.equal(appendedChild?.value, "fallback text");
    assert.equal(removedChild, appendedChild);
  });

  it("returns false when both clipboard API and execCommand fail", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: () => ({ style: {}, setAttribute: () => {}, focus: () => {}, select: () => {}, value: "" }),
        body: { appendChild: () => {}, removeChild: () => {} },
        execCommand: () => false,
      },
      configurable: true,
      writable: true,
    });

    const result = await copyTextToClipboard("fail text");
    assert.equal(result, false);
  });
});
