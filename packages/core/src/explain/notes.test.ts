// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { NOTE_TOPICS, noteFrom, sortNotes, styleNote } from "./notes.js";

describe("styleNote", () => {
  it("gives every note the same style: no marker, a capital, a final period", () => {
    expect(styleNote("  WARN: the creator's project is set up for a 0.5 mm nozzle; converted for your 0.4 mm nozzles")).toBe(
      "The creator's project is set up for a 0.5 mm nozzle; converted for your 0.4 mm nozzles.",
    );
  });

  it("keeps a setting key at the start as it is", () => {
    expect(styleNote("  WARN: bridge_speed lowered to 100 mm/s, the U1's machine limit.")).toBe("bridge_speed lowered to 100 mm/s, the U1's machine limit.");
  });

  it("leaves a quoted name and a sentence that already ends alone", () => {
    expect(styleNote('WARN: print settings compared with PrusaSlicer\'s "0.20mm QUALITY @XL 0.4".')).toBe('Print settings compared with PrusaSlicer\'s "0.20mm QUALITY @XL 0.4".');
    expect(styleNote("Filament max volumetric speed lowered to at most 22 mm³/s. Raise it if your filament can melt faster!")).toBe(
      "Filament max volumetric speed lowered to at most 22 mm³/s. Raise it if your filament can melt faster!",
    );
  });

  it("drops the routine lines cleanWarnings drops, and file names", () => {
    expect(styleNote("  NOTE foo: left unchanged.")).toBeNull();
    expect(noteFrom("plates", "WARN: object 3 has no bounding box in model_settings.config.")).toEqual({ topic: "plates", text: "Object 3 has no bounding box." });
  });
});

describe("noteFrom and sortNotes", () => {
  it("keeps the slots when there are any", () => {
    expect(noteFrom("nozzle", "WARN: filament 2 was tuned for a 0.6 mm nozzle", [2])).toEqual({ topic: "nozzle", slots: [2], text: "Filament 2 was tuned for a 0.6 mm nozzle." });
    expect(noteFrom("nozzle", "WARN: x", [])).toEqual({ topic: "nozzle", text: "X." });
  });

  it("sorts by topic in NOTE_TOPICS' order, keeps the order within a topic, and puts an unknown topic last", () => {
    const sorted = sortNotes([
      { topic: "plates", text: "P." },
      { topic: "later-topic", text: "L." },
      { topic: "nozzle", text: "N2." },
      { topic: "filament-diameter", text: "D." },
      { topic: "nozzle", text: "N1." },
    ]);
    expect(sorted.map((n) => n.text)).toEqual(["D.", "N2.", "N1.", "P.", "L."]);
    expect(NOTE_TOPICS[0]).toBe("filament-diameter");
  });
});
