// SPDX-License-Identifier: MIT
import { afterAll, describe, expect, it } from "vitest";

// Counts every call of the Function constructor, which zod uses to probe for and build its compiled parsers.
const RealFunction = globalThis.Function;
let calls = 0;
globalThis.Function = new Proxy(RealFunction, {
  apply: (target, self, args) => (calls++, Reflect.apply(target, self, args)),
  construct: (target, args, newTarget) => (calls++, Reflect.construct(target, args, newTarget)),
});
afterAll(() => {
  globalThis.Function = RealFunction;
});

describe("zod's compiled parsers", () => {
  it("are off before any schema exists, so loading the library and converting never call the Function constructor", async () => {
    // Imported after the counter is in place. A schema created with compiled parsers on would call it on its first parse.
    const { convert, loadCatalog } = await import("./index.js");
    const { readFixture, testProfileSource } = await import("./test-helpers.js");
    const { z } = await import("zod");
    const profiles = await loadCatalog(testProfileSource());
    const { output } = await convert(readFixture("synthetic-demo.3mf"), { profiles, explain: true });
    expect(output.length).toBeGreaterThan(0);
    expect(calls).toBe(0);
    expect(z.config().jitless).toBe(true);
  });
});
