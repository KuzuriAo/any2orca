// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILES_DATA_DIR } from "../../test-helpers.js";
import { lookupPrintPresetName, PrusaBundleSchema, resolvePrintPreset, type PrusaBundle } from "./bundle.js";

const bundle = (print: PrusaBundle["presets"]["print"], renamedFrom: Record<string, string> = {}): PrusaBundle => ({
  schema: 1,
  vendor: "Test",
  name: "Test Vendor",
  configVersion: "1.0.0",
  slicer: { name: "PrusaSlicer", repository: "x/y", tag: "v1", commit: "0".repeat(40) },
  license: "AGPL-3.0-or-later",
  groups: ["print"],
  printerModels: {},
  presets: { print },
  renamedFrom,
});

describe("a PrusaSlicer vendor bundle", () => {
  it("resolves a preset the way PrusaSlicer does: own keys, then the last parent listed, down to the first", () => {
    const b = bundle({
      "*common*": { values: { a: "common", b: "common", c: "common", d: "common" } },
      "*fine*": { inherits: ["*common*"], values: { b: "fine", c: "fine" } },
      "*fast*": { inherits: ["*common*"], values: { c: "fast", e: "fast" } },
      "0.20mm X": { inherits: ["*fine*", "*fast*"], values: { a: "own" } },
    });
    // a: own. Then *fast*, the last parent, already flattened with *common* behind it, so it brings c, e, and b and d
    // from *common*; *fine*'s own b comes too late. That is PrusaSlicer's order: parents are flattened first.
    expect(resolvePrintPreset(b, "0.20mm X")).toEqual({ a: "own", c: "fast", e: "fast", b: "common", d: "common" });
    expect(resolvePrintPreset(b, "*fine*")).toEqual({ b: "fine", c: "fine", a: "common", d: "common" });
    expect(resolvePrintPreset(b, "nope")).toBeNull();
  });

  it("survives a cycle and an unknown parent", () => {
    const b = bundle({
      A: { inherits: ["B"], values: { a: "1" } },
      B: { inherits: ["A", "missing"], values: { b: "2" } },
    });
    expect(resolvePrintPreset(b, "A")).toEqual({ a: "1", b: "2" });
  });

  it("finds a recorded preset name: as is, through a rename, or inside a project-embedded copy's name", () => {
    const b = bundle({ "0.20mm QUALITY @MK3": { values: {} }, "*abstract*": { values: {} } }, { "0.20mm SPEED MK3": "0.20mm QUALITY @MK3" });
    expect(lookupPrintPresetName(b, "0.20mm QUALITY @MK3")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(b, "0.20mm SPEED MK3")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(b, "part.3mf (0.20mm QUALITY @MK3)")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(b, "a.3mf (b.3mf (b.3mf (0.20mm SPEED MK3)))")).toBe("0.20mm QUALITY @MK3");
    expect(lookupPrintPresetName(b, "*abstract*")).toBeNull();
    expect(lookupPrintPresetName(b, "KP3S 0.2 mm")).toBeNull();
  });

  it("ships Prusa Research's bundle in the profile data, and resolves the fixtures' presets from it", () => {
    const raw = JSON.parse(readFileSync(join(PROFILES_DATA_DIR, "sources", "prusaslicer", "PrusaResearch.json"), "utf-8")) as unknown;
    const parsed = PrusaBundleSchema.parse(raw);
    expect(parsed.vendor).toBe("PrusaResearch");
    expect(parsed.license).toBe("AGPL-3.0-or-later");
    expect(Object.keys(parsed.presets.print).length).toBeGreaterThan(500);
    const balanced = resolvePrintPreset(parsed, "0.20mm BALANCED @COREONE HF0.4");
    expect(balanced?.layer_height).toBe("0.2");
    expect(balanced?.perimeters).toBe("2");
    expect(balanced?.fill_density).toBe("15%");
    expect(balanced?.inherits).toBeUndefined();
    expect(lookupPrintPresetName(parsed, "0.20mm QUALITY @XL 0.4")).toBe("0.20mm QUALITY @XL 0.4");
    expect(lookupPrintPresetName(parsed, "0.20mm QUALITY @MK3")).toBe("0.20mm QUALITY @MK3");
  });
});
