// SPDX-License-Identifier: MIT
// Polymaker filaments under the filament naming options, on the shared scene saved with Bambu Studio's own
// Polymaker presets (test-fixtures/sources/README.md): 1 PolyTerra PLA, 2 PolyLite PLA, 3 PolyLite PETG,
// 4 Bambu PLA Basic, 5 PolyLite ABS, 6 PolyLite ASA. The names say "PolyTerra", never "Polymaker"; the vendor does.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "./index.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const FIXTURE = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";
const settingsOf = (output: Uint8Array) => JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as Record<string, string[]>;

describe("Polymaker filaments under the Snapmaker option", () => {
  it("take the Polymaker preset that fits, with its name, id, vendor and settings; the others follow the Snapmaker-then-Generic order", async () => {
    const { output, report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" });
    expect(report.filaments.map((f) => f.outputName)).toEqual([
      "Polymaker General PLA Family @U1",
      "Polymaker General PLA Family @U1",
      "Generic PETG",
      "Snapmaker PLA SnapSpeed @U1",
      "Snapmaker ABS @U1 0.4 nozzle",
      "Snapmaker ASA @U1 0.4 nozzle",
    ]);
    const settings = settingsOf(output);
    expect(settings.filament_settings_id!.slice(0, 2)).toEqual(["Polymaker General PLA Family @U1", "Polymaker General PLA Family @U1"]);
    expect(settings.filament_vendor!.slice(0, 6)).toEqual(["Polymaker", "Polymaker", "Generic", "Snapmaker", "Snapmaker", "Snapmaker"]);
    expect(settings.filament_ids!.slice(0, 2)).toEqual(["POLY_GENERAL_PLA_U1_001", "POLY_GENERAL_PLA_U1_001"]);
    // Every filament and its color stays, in the file's order.
    expect(settings.filament_colour!.slice(0, 6)).toEqual(["#000000", "#FFFFFF", "#0056B8", "#C12E1F", "#5B6579", "#EC008C"]);
    // The Polymaker preset's own settings replace the creator's, and the notes say so for both filaments together.
    const preset = report.filamentPresets?.find((p) => p.slot === 1);
    expect(preset?.preset).toBe("Polymaker General PLA Family @U1");
    expect(preset!.changed.length).toBeGreaterThan(0);
    expect(report.notes.some((n) => n.topic === "filament-presets" && /^Filaments 1 and 2 use Polymaker General PLA Family @U1's own settings instead of the creator's: /.test(n.text))).toBe(true);
    // Every name is one the review rules allow, so nothing is reported as left unnamed.
    expect(report.filamentComplianceUnchanged).toBeUndefined();
  });

  it("stay as they are for a nozzle size Polymaker has no U1 preset for", async () => {
    const { report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker", nozzle: "0.6" });
    expect(report.filaments.slice(0, 2).every((f) => f.outputName.startsWith("Snapmaker PLA SnapSpeed"))).toBe(true);
  });

  it("are known by the vendor the project names, when the preset's name says nothing", async () => {
    const entries = unzipSync(readFixture(FIXTURE));
    const settings = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]!)) as Record<string, string[]>;
    settings.filament_settings_id![0] = "Workshop black @BBL X1C";
    settings.filament_settings_id![3] = "Workshop red @BBL X1C";
    entries["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings));
    const { report } = await convert(zipSync(entries), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" });
    // Filament 1's vendor is Polymaker; filament 4's is Bambu Lab.
    expect(report.filaments[0]!.outputName).toBe("Polymaker General PLA Family @U1");
    expect(report.filaments[3]!.outputName).toBe("Snapmaker PLA SnapSpeed @U1");
  });
});

describe("the Polymaker option", () => {
  it("gives every PLA a Polymaker preset by its kind, and the rest what the Snapmaker option gives them, with a note", async () => {
    const { output, report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "polymaker" });
    // Filament 4 is Bambu PLA Basic: anyone's PLA takes Polymaker's General PLA Family under this option.
    expect(report.filaments.map((f) => f.outputName)).toEqual([
      "Polymaker General PLA Family @U1",
      "Polymaker General PLA Family @U1",
      "Generic PETG",
      "Polymaker General PLA Family @U1",
      "Snapmaker ABS @U1 0.4 nozzle",
      "Snapmaker ASA @U1 0.4 nozzle",
    ]);
    const settings = settingsOf(output);
    expect(settings.filament_vendor!.slice(0, 6)).toEqual(["Polymaker", "Polymaker", "Generic", "Polymaker", "Snapmaker", "Snapmaker"]);
    // Every filament and its color stays, in the file's order.
    expect(settings.filament_colour!.slice(0, 6)).toEqual(["#000000", "#FFFFFF", "#0056B8", "#C12E1F", "#5B6579", "#EC008C"]);
    expect(report.filamentComplianceBrandFallback).toEqual(["PETG", "ABS", "ASA"]);
    expect(report.filamentComplianceBrandSizes).toBeUndefined();
    // Said once as Polymaker's gap, not again as Snapmaker's.
    expect(report.filamentComplianceFallback).toBeUndefined();
    expect(report.notes).toContainEqual({
      topic: "filament-presets",
      text: "Polymaker makes no U1 preset for PETG, ABS and ASA at this nozzle size, so those get the preset the Snapmaker option gives them.",
    });
    expect(report.notes.some((n) => /^Filaments 1, 2 and 4 use Polymaker General PLA Family @U1's own settings/.test(n.text))).toBe(true);
    // The version note records the option.
    const stamp = JSON.parse(strFromU8(unzipSync(output)["Metadata/any2orca.json"]!)) as { options: { filamentComplianceMode: string } };
    expect(stamp.options.filamentComplianceMode).toBe("polymaker");
  });

  it("gives every filament what the Snapmaker option gives it on a nozzle size Polymaker has no preset for", async () => {
    const polymaker = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "polymaker", nozzle: "0.6" });
    const snapmaker = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker", nozzle: "0.6" });
    expect(polymaker.report.filaments.map((f) => f.outputName)).toEqual(snapmaker.report.filaments.map((f) => f.outputName));
    expect(polymaker.report.filamentComplianceBrandSizes).toEqual(["0.4"]);
    // Said once, with the sizes Polymaker has presets for, instead of listing every filament.
    expect(polymaker.report.notes).toContainEqual({
      topic: "filament-presets",
      text: "Snapmaker Orca has Polymaker presets for the 0.4 mm nozzle only, so every filament gets the preset the Snapmaker option gives it.",
    });
    expect(polymaker.report.notes.some((n) => n.text.startsWith("Polymaker makes no U1 preset for "))).toBe(false);
  });

  it("is refused with any other value", async () => {
    await expect(convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "prusament" as never })).rejects.toThrow(
      'The `filamentComplianceMode` option must be "snapmaker", "polymaker" or "generic", or left out.',
    );
  });
});

describe("Polymaker filaments under the other options", () => {
  it("keep the creator's names without a naming option, and the parent preset Snapmaker Orca resets them to stays Snapmaker's", async () => {
    const { output, report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource() });
    expect(report.filaments.map((f) => f.outputName)).toEqual(report.filaments.map((f) => f.sourceName));
    expect(report.filaments[0]!.outputName).toBe("PolyTerra PLA @BBL X1C");
    const settings = settingsOf(output);
    // inherits_group: the print entry, one per filament, the printer entry.
    expect(settings.inherits_group![1]).toMatch(/^Snapmaker PLA SnapSpeed @U1/);
    expect(settings.inherits_group!.some((name) => name.includes("Polymaker"))).toBe(false);
  });

  it("become Generic presets under the Generic option, as before", async () => {
    const { report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "generic" });
    expect(report.filaments.map((f) => f.outputName)).toEqual(["Generic PLA", "Generic PLA", "Generic PETG", "Generic PLA", "Generic ABS", "Generic ASA @U1 0.4 nozzle"]);
  });
});

describe("the Space review notes with a filament option on", () => {
  it("say a plate has more than four colors, and stay away without a filament option", async () => {
    const withOption = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), filamentComplianceMode: "snapmaker" });
    const note = withOption.report.notes.find((n) => n.text.startsWith("Snapmaker Space's review"));
    expect(note).toEqual({
      topic: "filament-presets",
      text: "Snapmaker Space's review turns down more than four colors on one plate unless the print pauses at filament changes or uses Full Spectrum, and plate 6 uses 5.",
    });
    expect(withOption.report.warnings.some((w) => w.startsWith("Snapmaker Space's review turns down more than four colors"))).toBe(true);

    const without = await convert(readFixture(FIXTURE), { profiles: testProfileSource() });
    expect(without.report.notes.some((n) => n.text.includes("Snapmaker Space"))).toBe(false);
  });
});
