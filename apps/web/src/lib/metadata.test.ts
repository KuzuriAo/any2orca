// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSize, largeProjectNote, sanitizeWarnings } from "./metadata.js";

describe("metadata: large project formatting and notes", () => {
  it("formats size like the core: 1.4 GB, 2 GB, 500 MB", () => {
    assert.equal(formatSize(1.4 * 1024 ** 3), "1.4 GB");
    assert.equal(formatSize(2 * 1024 ** 3), "2 GB");
    assert.equal(formatSize(500 * 1024 ** 2), "500 MB");
  });

  it("produces exact large project note", () => {
    const note = largeProjectNote(1.4 * 1024 ** 3);
    assert.equal(
      note,
      "This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory."
    );
  });

  it("sanitizeWarnings deduplicates and normalizes core large project warning", () => {
    const raw = [
      "  WARN: This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other apps or tabs if your computer has little memory.",
      "This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory.",
      "Some other warning in model_settings.config.",
    ];
    const cleaned = sanitizeWarnings(raw, 1.4 * 1024 ** 3);
    assert.equal(cleaned.length, 2);
    assert.equal(
      cleaned[0],
      "This is a large project (1.4 GB unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory."
    );
    assert.equal(cleaned[1], "Some other warning");
  });
});
