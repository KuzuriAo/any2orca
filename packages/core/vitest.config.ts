// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

// Tests run in a random order, so one that depends on another's leftovers fails here and not by chance later,
// and a test that checks nothing fails.
export default defineConfig({
  test: {
    sequence: { shuffle: { files: true, tests: true } },
    expect: { requireAssertions: true },
  },
});
