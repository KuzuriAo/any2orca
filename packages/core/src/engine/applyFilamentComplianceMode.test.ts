// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { testFilamentNames } from "../test-helpers.js";
import { applyFilamentComplianceMode } from "./applyFilamentComplianceMode.js";

const table = testFilamentNames();

describe("applyFilamentComplianceMode", () => {
  it("overrides the name on each slot and the matching filamentKeyArrays entry", () => {
    const slots = [
      { filament_type: "PLA", filament_settings_id: "Bambu PLA Basic @BBL X1C" },
      { filament_type: "PETG", filament_settings_id: "Bambu PETG Basic @BBL X1C" },
    ];
    const filamentKeyArrays = {
      filament_settings_id: ["Bambu PLA Basic @BBL X1C", "Bambu PETG Basic @BBL X1C"],
      filament_colour: ["#FFFFFF", "#000000"],
    };

    const result = applyFilamentComplianceMode(slots, filamentKeyArrays, "generic", table, "snapmaker-u1");

    expect(result.slots[0].filament_settings_id).toBe("Generic PLA");
    expect(result.slots[1].filament_settings_id).toBe("Generic PETG");
    expect(result.filamentKeyArrays?.filament_settings_id).toEqual(["Generic PLA", "Generic PETG"]);
    // Untouched keys stay exactly as they were.
    expect(result.filamentKeyArrays?.filament_colour).toEqual(["#FFFFFF", "#000000"]);
    expect(result.fellBackToGenericMaterials).toEqual([]);
    expect(result.renamed).toEqual([
      { slot: 0, before: "Bambu PLA Basic @BBL X1C", after: "Generic PLA" },
      { slot: 1, before: "Bambu PETG Basic @BBL X1C", after: "Generic PETG" },
    ]);
  });

  it("moves filament_ids and filament_vendor with the name, as Snapmaker Orca's own saves do", () => {
    const slots = [{ filament_type: "PLA", filament_settings_id: "Bambu PLA Matte @BBL H2C", filament_vendor: "Bambu Lab", filament_ids: "GFA01" }];
    const filamentKeyArrays = {
      filament_settings_id: ["Bambu PLA Matte @BBL H2C"],
      filament_vendor: ["Bambu Lab"],
      filament_ids: ["GFA01"],
    };

    const result = applyFilamentComplianceMode(slots, filamentKeyArrays, "snapmaker", table, "snapmaker-u1");

    expect(result.slots[0]).toMatchObject({ filament_settings_id: "Snapmaker PLA Matte @U1", filament_vendor: "Snapmaker", filament_ids: "119531393501" });
    expect(result.filamentKeyArrays).toMatchObject({
      filament_settings_id: ["Snapmaker PLA Matte @U1"],
      filament_vendor: ["Snapmaker"],
      filament_ids: ["119531393501"],
    });
  });

  it("writes Generic's id and vendor when a line falls back to Generic under the Snapmaker option", () => {
    const slots = [{ filament_type: "PC", filament_settings_id: "Bambu PC @BBL X1C", filament_vendor: "Bambu Lab" }];
    const filamentKeyArrays = { filament_settings_id: ["Bambu PC @BBL X1C"], filament_vendor: ["Bambu Lab"], filament_ids: ["GFC00"] };

    const result = applyFilamentComplianceMode(slots, filamentKeyArrays, "snapmaker", table, "snapmaker-u1");

    expect(result.slots[0]).toMatchObject({ filament_settings_id: "Generic PC", filament_vendor: "Generic" });
    expect(result.filamentKeyArrays?.filament_ids).toEqual([table.printers["snapmaker-u1"].presets["Generic PC"].id]);
    expect(result.fellBackToGenericMaterials).toEqual(["PC"]);
  });

  it("uses the target printer's names", () => {
    const slots = [{ filament_type: "ABS", filament_settings_id: "Bambu ABS @BBL X1C" }];
    expect(applyFilamentComplianceMode(slots, null, "snapmaker", table, "snapmaker-u1-0.6").slots[0].filament_settings_id).toBe("Snapmaker ABS @U1 0.6 nozzle");
    expect(applyFilamentComplianceMode(slots, null, "snapmaker", table, "snapmaker-u1").slots[0].filament_settings_id).toBe("Snapmaker ABS @U1 0.4 nozzle");
  });

  it("never modifies any other slot field -- identity only, physical properties untouched", () => {
    const slots = [{ filament_type: "PLA", filament_settings_id: "Bambu PLA Basic", nozzle_temperature: "220" }];
    const result = applyFilamentComplianceMode(slots, null, "snapmaker", table, "snapmaker-u1");
    expect(result.slots[0]).toEqual({ filament_type: "PLA", filament_settings_id: "Snapmaker PLA SnapSpeed @U1", filament_vendor: "Snapmaker", nozzle_temperature: "220" });
  });

  it("reports a deduped fallback list by product line, in first-seen order", () => {
    const slots = [
      { filament_type: "PC", filament_settings_id: "Bambu PC @BBL X1C" },
      { filament_type: "PETG", filament_settings_id: "Bambu PETG Basic @BBL X1C" },
      { filament_type: "PC", filament_settings_id: "Bambu PC Support @BBL X1C" },
    ];
    const result = applyFilamentComplianceMode(slots, null, "snapmaker", table, "snapmaker-u1");
    expect(result.slots.map((s) => s.filament_settings_id)).toEqual(["Generic PC", "Generic PETG", "Generic PC"]);
    expect(result.fellBackToGenericMaterials).toEqual(["PC", "PETG"]);
  });

  it("leaves a slot no preset fits completely untouched, and reports it", () => {
    const slots = [
      { filament_type: "Exotic-9000", filament_settings_id: "Some Custom Filament", filament_vendor: "Bambu Lab" },
      { filament_type: "PC", filament_settings_id: "Bambu PC @BBL X1C", filament_vendor: "Bambu Lab" },
    ];
    const filamentKeyArrays = { filament_settings_id: ["Some Custom Filament", "Bambu PC @BBL X1C"], filament_vendor: ["Bambu Lab", "Bambu Lab"] };
    const result = applyFilamentComplianceMode(slots, filamentKeyArrays, "generic", table, "snapmaker-u1-0.2");
    expect(result.slots).toEqual(slots);
    expect(result.filamentKeyArrays).toEqual(filamentKeyArrays);
    expect(result.unchangedMaterials).toEqual(["Exotic-9000", "PC"]);
    expect(result.renamed).toEqual([]);
  });

  it("leaves everything as it is without a name table, and reports it", () => {
    const slots = [{ filament_type: "PLA", filament_settings_id: "Bambu PLA Basic" }];
    const result = applyFilamentComplianceMode(slots, null, "snapmaker", undefined, "snapmaker-u1");
    expect(result.slots).toEqual(slots);
    expect(result.unchangedMaterials).toEqual(["PLA"]);
  });

  it("passes through null filamentKeyArrays unchanged", () => {
    const slots = [{ filament_type: "PLA", filament_settings_id: "Bambu PLA Basic" }];
    const result = applyFilamentComplianceMode(slots, null, "generic", table, "snapmaker-u1");
    expect(result.filamentKeyArrays).toBeNull();
  });
});
