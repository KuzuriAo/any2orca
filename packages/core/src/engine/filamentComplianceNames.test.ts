// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { testFilamentNames } from "../test-helpers.js";
import { FILAMENT_COMPLIANCE_MODES, filamentModeHasPresets, filamentModeNozzleSizes, matchFilamentBrand, matchFilamentLine, resolveFilamentName, type FilamentComplianceMode } from "./filamentComplianceNames.js";

const table = testFilamentNames();
const PRINTERS = { "0.2": "snapmaker-u1-0.2", "0.4": "snapmaker-u1", "0.6": "snapmaker-u1-0.6", "0.8": "snapmaker-u1-0.8" } as const;
const MODES: FilamentComplianceMode[] = ["snapmaker", "generic"];

/** Source filaments seen in real projects (type, filament_settings_id), plus each line's own family names. */
const REAL_SOURCES: [string, string][] = [
  ["PLA", "Bambu PLA Basic @BBL X1C"],
  ["PLA", "Bambu PLA Matte @BBL P1S 0.4 nozzle"],
  ["PLA", "Bambu PLA Silk+ @BBL H2D"],
  ["PLA", "Bambu PLA Wood @BBL X1C"],
  ["PLA", "Bambu PLA Glow @BBL X1C"],
  ["PLA", "Bambu PLA Translucent @BBL X1C"],
  ["PLA", "Bambu PLA Sparkle @BBL X1C"],
  ["PLA", "Bambu PLA Galaxy @BBL X1C"],
  ["PLA", "Bambu PLA Marble @BBL X1C"],
  ["PLA", "Bambu PLA Metal @BBL X1C"],
  ["PLA", "Bambu PLA Tough @BBL X1C"],
  ["PLA", "Bambu Support W @BBL X1C"],
  ["PLA", "Generic PLA High Speed @BBL X1C"],
  ["PLA", "SUNLU PLA+ 2.0 @BBL X1C"],
  ["PLA", "eSUN PLA+ White (Cool)"],
  ["PLA", "Overture Matte PLA"],
  ["PLA", "Hyper PLA"],
  ["PLA", "Snapmaker PLA Basic @U1"],
  ["PLA", "Snapmaker PLA SnapSpeed @U1"],
  ["PLA", "Bambu PLA Matte Flow Rate Calibrated(Great Ball - SPLIT Profile - 4 Plate.3mf)"],
  ["PLA", "(Pikachu Monkey D. Luffy Pokeball - U1.3mf)"],
  ["PLA-CF", "Generic PLA-CF"],
  ["PETG", "Bambu PETG Basic @BBL X1C"],
  ["PETG", "Bambu PETG HF @BBL X1C"],
  ["PETG", "ELEGOO PETG Rapid"],
  ["PETG-HF", "SUNLU PETG-HF Matte"],
  ["PETG", "Bambu PETG Translucent @BBL X1C"],
  ["PETG-CF", "Bambu PETG-CF @BBL X1C"],
  ["ABS", "Bambu ABS @BBL X1C"],
  ["ABS-GF", "Bambu ABS-GF @BBL X1C"],
  ["ASA", "PolyLite ASA"],
  ["PC", "Bambu PC @BBL X1C"],
  ["PA6-CF", "Bambu PA6-CF @BBL X1C"],
  ["PA-CF", "Bambu PAHT-CF @BBL X1C"],
  ["PA-GF", "Bambu PA6-GF @BBL X1C"],
  ["TPU", "Bambu TPU 95A @BBL X1C"],
  ["TPU", "Bambu TPU 95A HF @BBL X1C"],
  ["PVA", "Bambu PVA @BBL X1C"],
  ...table.lines.flatMap((line) => line.materials.flatMap((m) => [line.snapmaker, line.generic].filter((f): f is string => f !== null).map((f): [string, string] => [m, f]))),
];

describe("resolveFilamentName: every name it writes exists", () => {
  it("only ever returns a preset the target printer offers, of the chosen kind or Generic", () => {
    let checked = 0;
    for (const printerId of Object.values(PRINTERS)) {
      const presets = table.printers[printerId].presets;
      for (const mode of MODES) {
        for (const [type, name] of REAL_SOURCES) {
          const result = resolveFilamentName(table, printerId, type, name, mode);
          if (!result.preset) {
            expect(result.outcome).toBe("unchanged");
            continue;
          }
          checked++;
          const entry = presets[result.preset.name];
          expect(entry, `${printerId} ${mode} ${name} -> ${result.preset.name}`).toBeDefined();
          expect(result.preset).toEqual({ name: result.preset.name, id: entry.id, vendor: entry.vendor });
          const vendor = entry.vendor.toLowerCase();
          expect(mode === "generic" || result.outcome === "generic" ? vendor === "generic" : vendor === mode).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("never chooses Snapmaker PLA Basic (it only keeps it when the source already is it)", () => {
    const chosen: Array<[string | undefined, string, string]> = [];
    let resolved = 0;
    for (const printerId of Object.values(PRINTERS)) {
      for (const mode of MODES) {
        for (const [type, name] of REAL_SOURCES) {
          const result = resolveFilamentName(table, printerId, type, name, mode);
          resolved++;
          if (result.preset?.name.startsWith("Snapmaker PLA Basic")) chosen.push([result.outcome, name, result.preset.name]);
        }
      }
    }
    expect(resolved).toBeGreaterThan(200);
    expect(chosen.filter(([outcome, name, preset]) => outcome !== "kept" || name !== preset)).toEqual([]);
  });

  it("every product line names a preset family that exists for at least one nozzle size", () => {
    const families = new Set(Object.values(table.printers).flatMap((p) => Object.values(p.presets).map((e) => e.family)));
    for (const line of table.lines) {
      for (const family of [line.snapmaker, line.generic]) if (family !== null) expect(families, `${line.id}: ${family}`).toContain(family);
    }
  });
});

describe("resolveFilamentName: product lines", () => {
  const snap = (nozzle: keyof typeof PRINTERS, type: string, name: string) => resolveFilamentName(table, PRINTERS[nozzle], type, name, "snapmaker");
  const generic = (nozzle: keyof typeof PRINTERS, type: string, name: string) => resolveFilamentName(table, PRINTERS[nozzle], type, name, "generic");

  it("names plain PLA, Bambu PLA Basic included, Snapmaker PLA SnapSpeed at every nozzle size", () => {
    expect(snap("0.2", "PLA", "Bambu PLA Basic @BBL X1C").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1 0.2 nozzle");
    expect(snap("0.4", "PLA", "Bambu PLA Basic @BBL X1C").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
    expect(snap("0.6", "PLA", "Bambu PLA Basic @BBL X1C").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    expect(snap("0.8", "PLA", "eSUN PLA+ White (Cool)").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1 0.8 nozzle");
  });

  it("writes the id and vendor Snapmaker Orca's own saves carry for the preset", () => {
    // From real Snapmaker Orca 2.4.0 saves: SnapSpeed 0.6 and Matte 0.4 (a project Snapmaker Space accepted), Generic PLA 0.4.
    expect(snap("0.6", "PLA", "Bambu PLA Basic").preset).toEqual({ name: "Snapmaker PLA SnapSpeed @U1 0.6 nozzle", id: "1195313935016", vendor: "snapmaker" });
    expect(snap("0.4", "PLA", "Bambu PLA Matte @BBL H2C").preset).toEqual({ name: "Snapmaker PLA Matte @U1", id: "119531393501", vendor: "Snapmaker" });
    expect(generic("0.4", "PLA", "Bambu PLA Basic").preset).toEqual({ name: "Generic PLA", id: "GFSL991", vendor: "Generic" });
  });

  it("keeps the product line: Matte to Matte, Silk to Silk, PETG HF to PETG HF", () => {
    expect(snap("0.4", "PLA", "Bambu PLA Matte @BBL P1S 0.4 nozzle").preset?.name).toBe("Snapmaker PLA Matte @U1");
    expect(snap("0.6", "PLA", "Overture Matte PLA").preset?.name).toBe("Snapmaker PLA Matte @U1 0.6 nozzle");
    expect(snap("0.4", "PLA", "Bambu PLA Silk+ @BBL H2D").preset?.name).toBe("Snapmaker PLA Silk @U1");
    expect(snap("0.4", "PETG", "Bambu PETG HF @BBL X1C").preset?.name).toBe("Snapmaker PETG HF");
    expect(snap("0.4", "PETG-HF", "SUNLU PETG-HF Matte").preset?.name).toBe("Snapmaker PETG HF");
    expect(snap("0.4", "TPU", "Bambu TPU 95A HF @BBL X1C").preset?.name).toBe("Snapmaker TPU 95A HF @U1 0.4 nozzle");
    expect(snap("0.4", "TPU", "Bambu TPU 95A @BBL X1C").preset?.name).toBe("Snapmaker TPU @U1 0.4 nozzle");
  });

  it("uses Generic, and says so, where Snapmaker makes no preset for the line", () => {
    expect(snap("0.4", "PETG", "Bambu PETG Basic @BBL X1C")).toMatchObject({ outcome: "generic", preset: { name: "Generic PETG" }, line: { id: "petg" } });
    expect(snap("0.4", "PLA", "Bambu PLA Sparkle @BBL X1C")).toMatchObject({ outcome: "generic", preset: { name: "Generic PLA" } });
    expect(snap("0.4", "PC", "Bambu PC @BBL X1C")).toMatchObject({ outcome: "generic", preset: { name: "Generic PC" } });
    // Snapmaker's Glow exists at 0.4 to 0.8 but not 0.2.
    expect(snap("0.2", "PLA", "Bambu PLA Glow @BBL X1C")).toMatchObject({ outcome: "generic", preset: { name: "Generic PLA @U1 0.2 nozzle" } });
  });

  it("leaves the name as it is when no preset fits the nozzle size or the material", () => {
    expect(snap("0.2", "PC", "Bambu PC @BBL X1C")).toEqual({ outcome: "unchanged", line: { id: "pc", label: "PC" } });
    expect(generic("0.6", "PVA", "Bambu PVA @BBL X1C")).toEqual({ outcome: "unchanged", line: { id: "pva", label: "PVA" } });
    expect(snap("0.4", "PA-GF", "Bambu PA6-GF @BBL X1C")).toEqual({ outcome: "unchanged", line: null });
    expect(snap("0.4", "Nylon-Exotic-9000", "Some Custom Filament")).toEqual({ outcome: "unchanged", line: null });
  });

  it("the Generic option uses the line's own Generic preset where there is one, else the material's", () => {
    expect(generic("0.4", "PLA", "Bambu PLA Matte @BBL X1C").preset?.name).toBe("Generic PLA");
    expect(generic("0.4", "PLA", "Bambu PLA Silk @BBL X1C").preset?.name).toBe("Generic PLA Silk");
    expect(generic("0.4", "PLA", "Generic PLA High Speed").preset?.name).toBe("Generic PLA High Speed");
    expect(generic("0.4", "ASA", "PolyLite ASA").preset?.name).toBe("Generic ASA @U1 0.4 nozzle");
    expect(generic("0.4", "PA6-CF", "Bambu PA6-CF @BBL X1C").preset?.name).toBe("Generic PA-CF");
  });

  it("keeps a name that already is a preset of the chosen kind for this printer", () => {
    expect(snap("0.4", "PLA", "Snapmaker PLA Basic @U1")).toMatchObject({ outcome: "kept", preset: { name: "Snapmaker PLA Basic @U1" } });
    // Snapmaker PLA Basic doesn't exist for the 0.6 nozzle, so it's renamed by its line.
    expect(snap("0.6", "PLA", "Snapmaker PLA Basic @U1").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    // A Generic preset isn't kept under the Snapmaker option.
    expect(snap("0.4", "PLA", "Generic PLA")).toMatchObject({ outcome: "renamed", preset: { name: "Snapmaker PLA SnapSpeed @U1" } });
  });

  it("follows the printer converted to, not the nozzle in the preset's name", () => {
    expect(snap("0.8", "PLA", "Snapmaker PLA Matte @U1").preset?.name).toBe("Snapmaker PLA Matte @U1 0.8 nozzle");
  });
});

describe("matchFilamentLine", () => {
  const line = (type: string, name: string) => matchFilamentLine(table, type, name)?.id ?? null;

  it("ignores the slicer's (project.3mf) tag and the @printer part", () => {
    expect(line("PLA", "Generic PLA(Matte Pikachu.3mf)")).toBe("pla");
    expect(line("PLA", "Bambu PLA Basic @BBL X1C Silk Edition")).toBe("pla");
  });

  it("matches whole words, including multi-word keywords", () => {
    expect(line("PLA", "Generic PLA High Speed")).toBe("pla-high-speed");
    expect(line("PLA", "Silkworm PLA")).toBe("pla");
    expect(line("PLA", "Bambu PLA Silk+")).toBe("pla-silk");
  });

  it("reads the material from filament_type, through the aliases", () => {
    expect(line("PA6-CF", "Bambu PA6-CF")).toBe("pa-cf");
    expect(line("petg-hf", "x")).toBe("petg-hf");
    expect(line("PLA", "Generic PETG")).toBe("pla");
  });

  it("is safe with hostile names", () => {
    for (const hostile of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(line(hostile, hostile)).toBeNull();
      expect(resolveFilamentName(table, hostile, "PLA", hostile, "snapmaker")).toEqual({ outcome: "unchanged", line: { id: "pla", label: "PLA" } });
      expect(resolveFilamentName(table, "snapmaker-u1", "PLA", hostile, "snapmaker").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
    }
    expect(line("PLA", "matte ".repeat(20_000))).toBe("pla-matte");
  });
});

describe("resolveFilamentName: a brand whose presets Snapmaker Orca installs (Polymaker)", () => {
  const snap = (type: string, name: string, source?: Parameters<typeof resolveFilamentName>[5], printerId: string = PRINTERS["0.4"]) =>
    resolveFilamentName(table, printerId, type, name, "snapmaker", source);

  it("the catalog lists the brand with its three U1 presets, all for the 0.4 nozzle", () => {
    const polymaker = table.brands?.find((b) => b.id === "polymaker");
    expect(polymaker?.vendors).toEqual(["polymaker"]);
    const families = [...new Set(polymaker!.lines.flatMap((l) => (l.preset === null ? [] : [l.preset])))].sort();
    expect(families).toEqual(["Polymaker General PLA Family", "Polymaker Silk PLA Family", "Polymaker Tough PLA Family"]);
    for (const [size, printerId] of Object.entries(PRINTERS)) {
      const offered = Object.values(table.printers[printerId].presets).filter((p) => families.includes(p.family));
      expect(offered.length, size).toBe(size === "0.4" ? 3 : 0);
    }
  });

  // Bambu Studio's own Polymaker presets, as a project saved in it names them, and Polymaker's lines by their names.
  it.each([
    ["PolyTerra PLA @BBL X1C", "Polymaker General PLA Family @U1"],
    ["PolyLite PLA @BBL X1C", "Polymaker General PLA Family @U1"],
    ["Polymaker Panchroma Matte PLA", "Polymaker General PLA Family @U1"],
    ["Panchroma Basic PLA @BBL P1S", "Polymaker General PLA Family @U1"],
    ["Panchroma Gradient Matte PLA", "Polymaker General PLA Family @U1"],
    ["PolySonic PLA @BBL X1C", "Polymaker General PLA Family @U1"],
    ["Polymaker HT-PLA", "Polymaker General PLA Family @U1"],
    ["Panchroma Silk PLA", "Polymaker Silk PLA Family @U1"],
    ["Panchroma Dual Silk PLA", "Polymaker Silk PLA Family @U1"],
    ["PolyLite Silk PLA @BBL X1C", "Polymaker Silk PLA Family @U1"],
    ["PolyMax PLA @BBL X1C", "Polymaker Tough PLA Family @U1"],
    ["PolyLite PLA Pro", "Polymaker Tough PLA Family @U1"],
    ["Polymaker PLA Pro @BBL A1", "Polymaker Tough PLA Family @U1"],
    ["PolyLite Metallic PLA Pro", "Polymaker Tough PLA Family @U1"],
  ])("names %s %s under the Snapmaker option, with that preset's id and vendor", (name, preset) => {
    const result = snap("PLA", name);
    expect(result.outcome).toBe("renamed");
    expect(result.preset).toEqual({ name: preset, id: table.printers[PRINTERS["0.4"]].presets[preset].id, vendor: "Polymaker" });
    expect(result.brand).toEqual({ id: "polymaker", label: "Polymaker" });
  });

  it("knows a Polymaker filament by its vendor when its name doesn't say", () => {
    expect(snap("PLA", "My everyday PLA", { vendor: "Polymaker" }).preset?.name).toBe("Polymaker General PLA Family @U1");
    expect(snap("PLA", "My everyday silk PLA", { vendor: " polymaker " }).preset?.name).toBe("Polymaker Silk PLA Family @U1");
    // Without the vendor it is anyone's PLA.
    expect(snap("PLA", "My everyday PLA").preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
    expect(snap("PLA", "My everyday PLA", { vendor: "Bambu Lab" }).preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
  });

  it.each([
    ["PLA-CF", "PolyLite PLA-CF", "Snapmaker PLA-CF"],
    // The same name with its material given as plain PLA: no Polymaker preset is made for a filled PLA, so it is plain PLA's.
    ["PLA", "PolyLite PLA-CF", "Snapmaker PLA SnapSpeed"],
    ["PLA", "PolyLite LW-PLA", "Snapmaker PLA SnapSpeed"],
    ["PLA", "Polymaker Wood PLA", "Snapmaker PLA Wood"],
    ["PETG", "PolyLite PETG @BBL X1C", "Generic PETG"],
    ["ABS", "PolyLite ABS @BBL X1C", "Snapmaker ABS"],
    ["ASA", "PolyLite ASA @BBL X1C", "Snapmaker ASA"],
    ["TPU", "PolyFlex TPU95", "Snapmaker TPU"],
  ])("a Polymaker filament none of its presets fits follows the ordinary order: %s %s", (type, name, family) => {
    const result = snap(type, name);
    expect(result.preset && table.printers[PRINTERS["0.4"]].presets[result.preset.name].family).toBe(family);
    expect(result.brand).toBeUndefined();
  });

  it("follows the ordinary order on a nozzle size the brand has no preset for", () => {
    for (const size of ["0.2", "0.6", "0.8"] as const) {
      const result = snap("PLA", "PolyTerra PLA @BBL X1C", {}, PRINTERS[size]);
      expect(result.preset?.vendor.toLowerCase(), size).toBe("snapmaker");
      expect(result.brand).toBeUndefined();
    }
  });

  it("keeps a filament that already has one of the brand's U1 presets", () => {
    const result = snap("PLA", "Polymaker Silk PLA Family @U1");
    expect(result.outcome).toBe("kept");
    expect(result.preset?.name).toBe("Polymaker Silk PLA Family @U1");
  });

  it("leaves the Generic option as it was", () => {
    expect(resolveFilamentName(table, PRINTERS["0.4"], "PLA", "PolyTerra PLA @BBL X1C", "generic", { vendor: "Polymaker" }).preset?.name).toBe("Generic PLA");
    expect(resolveFilamentName(table, PRINTERS["0.4"], "PLA", "Polymaker Silk PLA Family @U1", "generic").preset?.name).toBe("Generic PLA Silk");
  });

  it("can be asked for the ordinary lines alone, and has none to use in older catalog data", () => {
    expect(snap("PLA", "PolyTerra PLA @BBL X1C", { brands: false, vendor: "Polymaker" }).preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
    const { brands: _brands, ...older } = table;
    expect(resolveFilamentName(older, PRINTERS["0.4"], "PLA", "PolyTerra PLA @BBL X1C", "snapmaker", { vendor: "Polymaker" }).preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
  });

  it("matches a brand by a whole word of the name, never by a part of one", () => {
    expect(matchFilamentBrand(table, "PolyTerra PLA @BBL X1C")?.id).toBe("polymaker");
    expect(matchFilamentBrand(table, "Polymaker-PolyLite PLA")?.id).toBe("polymaker");
    expect(matchFilamentBrand(table, "Copolymakerish PLA")).toBeNull();
    expect(matchFilamentBrand(table, "Bambu PLA Basic @BBL X1C(polymaker-test.3mf)")).toBeNull();
    expect(matchFilamentBrand(table, "", "POLYMAKER")?.id).toBe("polymaker");
    expect(matchFilamentBrand(table, "\u0000".repeat(10_000), "x".repeat(10_000))).toBeNull();
  });
});

describe("resolveFilamentName: the Polymaker option", () => {
  const poly = (type: string, name: string, printerId: string = PRINTERS["0.4"], source?: Parameters<typeof resolveFilamentName>[5]) =>
    resolveFilamentName(table, printerId, type, name, "polymaker", source);
  const familyOf = (printerId: string, name: string | undefined) => (name === undefined ? undefined : table.printers[printerId].presets[name]?.family);

  it("gives every filament a preset the printer offers: Polymaker's, or else exactly what the Snapmaker option gives it", () => {
    let polymaker = 0;
    let fellBack = 0;
    for (const printerId of Object.values(PRINTERS)) {
      for (const [type, name] of REAL_SOURCES) {
        const result = poly(type, name, printerId);
        if (result.brandFallback) {
          fellBack++;
          expect(result.brandFallback).toEqual({ id: "polymaker", label: "Polymaker" });
          const { brandFallback: _fallback, ...rest } = result;
          expect(rest, `${printerId} ${name}`).toEqual(resolveFilamentName(table, printerId, type, name, "snapmaker"));
          continue;
        }
        polymaker++;
        expect(result.preset, `${printerId} ${name}`).toBeDefined();
        expect(table.printers[printerId].presets[result.preset!.name].vendor).toBe("Polymaker");
      }
    }
    expect(polymaker).toBeGreaterThan(20);
    expect(fellBack).toBeGreaterThan(100);
  });

  // Anyone's PLA, by its kind: Polymaker's presets are General, Silk and Tough PLA Family.
  it.each([
    ["Bambu PLA Basic @BBL X1C", "Polymaker General PLA Family"],
    ["Bambu PLA Matte @BBL P1S 0.4 nozzle", "Polymaker General PLA Family"],
    ["Generic PLA High Speed @BBL X1C", "Polymaker General PLA Family"],
    ["Snapmaker PLA SnapSpeed @U1", "Polymaker General PLA Family"],
    ["PolyTerra PLA @BBL X1C", "Polymaker General PLA Family"],
    ["Bambu PLA Silk+ @BBL H2D", "Polymaker Silk PLA Family"],
    ["Bambu PLA Tough @BBL X1C", "Polymaker Tough PLA Family"],
    ["PolyMax PLA @BBL X1C", "Polymaker Tough PLA Family"],
  ])("names %s %s at 0.4 mm", (name, family) => {
    const result = poly("PLA", name);
    expect(result.outcome).toBe("renamed");
    expect(familyOf(PRINTERS["0.4"], result.preset?.name)).toBe(family);
    expect(result.brand).toEqual({ id: "polymaker", label: "Polymaker" });
    expect(result.brandFallback).toBeUndefined();
  });

  it.each([
    ["PETG", "Bambu PETG Basic @BBL X1C", "Generic PETG"],
    ["ABS", "Bambu ABS @BBL X1C", "Snapmaker ABS"],
    ["PLA-CF", "Generic PLA-CF", "Snapmaker PLA-CF"],
    ["PLA", "Bambu Support W @BBL X1C", "Snapmaker Support For PLA"],
    ["PLA", "Polymaker Wood PLA", "Snapmaker PLA Wood"],
    ["TPU", "Bambu TPU 95A @BBL X1C", "Snapmaker TPU"],
  ])("gives %s %s what the Snapmaker option gives it (%s), and says Polymaker has none", (type, name, family) => {
    const result = poly(type, name);
    expect(familyOf(PRINTERS["0.4"], result.preset?.name)).toBe(family);
    expect(result.brandFallback).toEqual({ id: "polymaker", label: "Polymaker" });
  });

  it("falls back for every filament on a nozzle size Polymaker has no preset for", () => {
    for (const size of ["0.2", "0.6", "0.8"] as const) {
      const result = poly("PLA", "Bambu PLA Basic @BBL X1C", PRINTERS[size]);
      expect(result.preset?.vendor.toLowerCase(), size).toBe("snapmaker");
      expect(result.brandFallback, size).toEqual({ id: "polymaker", label: "Polymaker" });
    }
  });

  it("keeps a filament that already has one of Polymaker's U1 presets", () => {
    const result = poly("PLA", "Polymaker Tough PLA Family @U1");
    expect(result.outcome).toBe("kept");
    expect(result.preset?.name).toBe("Polymaker Tough PLA Family @U1");
  });

  it("falls back for everything with older catalog data that lists no brands", () => {
    const { brands: _brands, ...older } = table;
    const result = resolveFilamentName(older, PRINTERS["0.4"], "PLA", "Bambu PLA Basic @BBL X1C", "polymaker");
    expect(result.preset?.name).toBe("Snapmaker PLA SnapSpeed @U1");
    expect(result.brandFallback).toEqual({ id: "polymaker", label: "Polymaker" });
  });
});

describe("filamentModeHasPresets", () => {
  it("has Polymaker presets for the 0.4 mm nozzle only, and the others for every size", () => {
    for (const size of ["0.2", "0.4", "0.6", "0.8"]) {
      expect(filamentModeHasPresets(table, "polymaker", size), size).toBe(size === "0.4");
      expect(filamentModeHasPresets(table, "snapmaker", size), size).toBe(true);
      expect(filamentModeHasPresets(table, "generic", size), size).toBe(true);
    }
  });

  it("is false for a size the catalog doesn't have, and without the table", () => {
    expect(filamentModeHasPresets(table, "snapmaker", "1.0")).toBe(false);
    expect(filamentModeHasPresets(undefined, "snapmaker", "0.4")).toBe(false);
  });

  it("names the sizes an option has presets for", () => {
    expect(filamentModeNozzleSizes(table, "polymaker")).toEqual(["0.4"]);
    expect(filamentModeNozzleSizes(table, "snapmaker")).toEqual(["0.2", "0.4", "0.6", "0.8"]);
    expect(filamentModeNozzleSizes(undefined, "polymaker")).toEqual([]);
  });

  it("lists the options in the order a UI shows them", () => {
    expect(FILAMENT_COMPLIANCE_MODES).toEqual(["snapmaker", "polymaker", "generic"]);
  });
});
