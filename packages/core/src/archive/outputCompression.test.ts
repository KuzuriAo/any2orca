// SPDX-License-Identifier: MIT
// The converted file is written at deflate level 3, with a fixed entry time, so the same input always gives the same
// bytes and a large project isn't kept waiting on compression that saves almost nothing.
import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../index.js";
import { testProfileSource } from "../test-helpers.js";
import { OUTPUT_DEFLATE_LEVEL } from "./zip.js";

const demo = () => new Uint8Array(readFileSync(new URL("../test-fixtures/synthetic-demo.3mf", import.meta.url)));

describe("how the converted file is compressed", () => {
  it("is level 3: the output is exactly its entries zipped at that level with the fixed time", async () => {
    expect(OUTPUT_DEFLATE_LEVEL).toBe(3);
    const { output } = await convert(demo(), { profiles: testProfileSource() });
    const rezipped = zipSync(unzipSync(output), { level: 3, mtime: new Date(2000, 0, 1, 0, 0, 0) });
    expect(Buffer.compare(Buffer.from(output), Buffer.from(rezipped))).toBe(0);
  });

  it("gives the same bytes every time", async () => {
    const [a, b] = await Promise.all([convert(demo(), { profiles: testProfileSource() }), convert(demo(), { profiles: testProfileSource() })]);
    expect(Buffer.compare(Buffer.from(a.output), Buffer.from(b.output))).toBe(0);
  });
});
