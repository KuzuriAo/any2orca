// SPDX-License-Identifier: MIT
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MAX_OBJECTS } from "../schema.js";
import { readFixture } from "../test-helpers.js";
import { TOP_MODEL_PATH } from "./paths.js";
import { prepareConvertRequest } from "./zip.js";

describe("the object cap", () => {
  it("refuses a model with more build items than the cap before measuring any of them", () => {
    const entries = unzipSync(readFixture("synthetic-2plate.3mf"));
    const items = Array.from({ length: 20_000 }, (_, i) => `<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join("\n");
    entries[TOP_MODEL_PATH] = new TextEncoder().encode(`<?xml version="1.0"?>\n<model unit="millimeter"><resources/><build>${items}</build></model>`);
    const started = performance.now();
    expect(() => prepareConvertRequest(zipSync(entries))).toThrow(new RegExp(`${MAX_OBJECTS}`));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
