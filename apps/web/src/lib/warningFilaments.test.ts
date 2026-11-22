// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWarningEntries } from "./warningFilaments";
import { NEUTRAL_SWATCH } from "./plateFilaments";

describe("resolveWarningEntries", () => {
  it("attaches sanitized color chips for warnings that match a ConvertNote with slots", () => {
    const warnings = [
      "Plate 6 needs 5 filaments at the same height (it uses filaments 1, 2, 3, 5 and 6), and the U1 prints with 4 at a time, so it can't print as it is",
      "Some general warning without slots",
    ];
    const notes = [
      {
        topic: "plate-filaments",
        slots: [1, 2, 3, 5, 6],
        text: "Plate 6 needs 5 filaments at the same height (it uses filaments 1, 2, 3, 5 and 6), and the U1 prints with 4 at a time, so it can't print as it is.",
      },
      {
        topic: "settings",
        text: "Some general warning without slots.",
      },
    ];
    const filaments = [
      { color: "#000000" },
      { color: "#FFFFFF" },
      { color: "#0056B8" },
      { color: "#C12E1F" },
      { color: "#5B6579" },
      { color: "#EC008C" },
    ];

    const entries = resolveWarningEntries(warnings, notes, filaments);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0].chips, [
      { slot: 1, color: "#000000" },
      { slot: 2, color: "#FFFFFF" },
      { slot: 3, color: "#0056B8" },
      { slot: 5, color: "#5B6579" },
      { slot: 6, color: "#EC008C" },
    ]);
    assert.deepEqual(entries[1].chips, []);
  });

  it("sanitizes untrusted or missing filament colors to NEUTRAL_SWATCH and ignores invalid slots", () => {
    const warnings = ["Filament 1 and 99 have custom values"];
    const notes = [
      {
        topic: "filament-diameter",
        slots: [0, -1, 1, 1, 2, 99],
        text: "Filament 1 and 99 have custom values.",
      },
    ];
    const filaments = [
      { color: "red; background-image: url(https://evil.example)" },
      { color: "#123456" },
    ];

    const entries = resolveWarningEntries(warnings, notes, filaments);
    assert.deepEqual(entries[0].chips, [
      { slot: 1, color: NEUTRAL_SWATCH },
      { slot: 2, color: "#123456" },
      { slot: 99, color: NEUTRAL_SWATCH },
    ]);
  });

  it("returns empty chips when notes are absent", () => {
    const entries = resolveWarningEntries(["A warning"], null, []);
    assert.deepEqual(entries, [{ text: "A warning", chips: [] }]);
  });
});
