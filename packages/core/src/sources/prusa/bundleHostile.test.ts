// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { lookupPrintPresetName, type PrusaBundle } from "./bundle.js";

const bundle = {
  presets: { print: { "0.20mm QUALITY @MK3": { values: {} }, "*common*": { values: {} } } },
  renamedFrom: { "0.20mm OLD @MK3": "0.20mm QUALITY @MK3" },
} as unknown as PrusaBundle;

describe("lookupPrintPresetName", () => {
  it("peels a project-embedded copy's name, nested once per re-save", () => {
    expect(lookupPrintPresetName(bundle, "0.20mm QUALITY @MK3")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(bundle, "a.3mf (0.20mm QUALITY @MK3)")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(bundle, "a.3mf (b.3mf (0.20mm OLD @MK3))")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(bundle, "(0.20mm QUALITY @MK3)")).toBeNull();
    expect(lookupPrintPresetName(bundle, "a.3mf (0.20mm QUALITY @MK3) ")).toBeNull();
    expect(lookupPrintPresetName(bundle, "a.3mf\n(0.20mm QUALITY @MK3)")).toBeNull();
    expect(lookupPrintPresetName(bundle, "x (*common*)")).toBeNull();
  });

  it("a recorded name made of 160,000 ' (' pairs is looked up in linear time", () => {
    // The pattern this replaced took 33 seconds on this input, and a settings file can hold 4 MB of it.
    const started = performance.now();
    expect(lookupPrintPresetName(bundle, " (".repeat(160_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
