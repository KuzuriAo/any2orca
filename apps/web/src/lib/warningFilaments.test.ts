// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMentionedSlots, resolveWarningEntries } from "./warningFilaments";
import { NEUTRAL_SWATCH } from "./plateFilaments";

describe("extractMentionedSlots", () => {
  it("extracts singular and plural filament mentions without matching counts or ranges", () => {
    assert.deepEqual(
      extractMentionedSlots(
        "Plate 6 needs 5 filaments at the same height (it uses filaments 1, 2, 3, 5 and 6), and the U1 prints with 4 at a time.",
      ),
      [1, 2, 3, 5, 6],
    );
    assert.deepEqual(
      extractMentionedSlots(
        "Check plate 3 before printing. Snapmaker Orca 2.4.1 can skip filament 17 on some layers when filament 1 is on the same plate, and it gives no warning. Look through the sliced preview for missing color. To avoid the problem, print the two on separate plates, or give filament 17 a number from 1 to 16 in Snapmaker Orca.",
      ),
      [1, 17],
    );
    assert.deepEqual(
      extractMentionedSlots(
        "Check plates 3 and 4 before printing. Snapmaker Orca 2.4.1 can skip filaments 17 and 18 on some layers when filaments 1 and 2 are on the same plate.",
      ),
      [1, 2, 17, 18],
    );
    assert.deepEqual(
      extractMentionedSlots("Filament 2 uses 2.85 mm filament; load 1.75 mm filament for the U1."),
      [2],
    );
    assert.deepEqual(
      extractMentionedSlots("This is a large project (1.4 GB unpacked)."),
      [],
    );
  });
});

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

  it("shows both filament 1 and filament 17 chips on the filament 17 warning even when report.notes only lists slots: [17]", () => {
    const text =
      "Check plate 3 before printing. Snapmaker Orca 2.4.1 can skip filament 17 on some layers when filament 1 is on the same plate, and it gives no warning. Look through the sliced preview for missing color. To avoid the problem, print the two on separate plates, or give filament 17 a number from 1 to 16 in Snapmaker Orca.";
    const filaments = Array.from({ length: 17 }, (_, i) => ({
      color: i === 0 ? "#000000" : i === 16 ? "#FF6600" : "#CCCCCC",
    }));
    const entries = resolveWarningEntries(
      [text.replace(/\.$/, "")],
      [{ topic: "plate-filaments", slots: [17], text }],
      filaments,
    );
    assert.deepEqual(entries[0].chips, [
      { slot: 1, color: "#000000" },
      { slot: 17, color: "#FF6600" },
    ]);
  });

  it("sanitizes untrusted or missing filament colors to NEUTRAL_SWATCH and ignores invalid slots", () => {
    const warnings = ["Custom note for slots"];
    const notes = [
      {
        topic: "filament-diameter",
        slots: [0, -1, 1, 1, 2, 99],
        text: "Custom note for slots.",
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

  it("still resolves chips from warning text when notes are absent or differ slightly", () => {
    const entries = resolveWarningEntries(
      ["Filament 2 was tuned for a 0.6 mm nozzle"],
      null,
      [{ color: "#111111" }, { color: "#22AA44" }],
    );
    assert.deepEqual(entries, [
      {
        text: "Filament 2 was tuned for a 0.6 mm nozzle",
        chips: [{ slot: 2, color: "#22AA44" }],
      },
    ]);
  });
});
