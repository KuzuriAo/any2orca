// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getConverter } from "./api.js";

describe("api: getConverter browser compatibility check", () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    Object.defineProperty(globalThis, "Worker", { value: originalWorker, configurable: true, writable: true });
  });

  it("throws descriptive error when module worker construction fails in old browser", () => {
    Object.defineProperty(globalThis, "Worker", {
      value: class {
        constructor() {
          throw new TypeError("Module workers are not supported.");
        }
      },
      configurable: true,
      writable: true,
    });

    assert.throws(
      () => getConverter(),
      (err: Error) => {
        assert.equal(
          err.message,
          "This browser is too old for any2orca: use a current Chrome, Edge, Firefox (114 or newer) or Safari (16 or newer)."
        );
        return true;
      }
    );
  });
});
