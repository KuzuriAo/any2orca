// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { collapseNozzleVariants } from "./collapseNozzleVariants.js";

const STD = "Direct Drive Standard";
const HF = "Direct Drive High Flow";
const h2c = (extra: Record<string, unknown>) => ({
  nozzle_diameter: ["0.4", "0.4"],
  nozzle_volume_type: ["Standard", "Standard"],
  print_extruder_id: ["1", "1", "2", "2"],
  print_extruder_variant: [STD, HF, STD, HF],
  ...extra,
});

describe("collapseNozzleVariants", () => {
  it("reduces a per-nozzle setting to one value per variant", () => {
    const { settings, conflicts, variantIndex } = collapseNozzleVariants(h2c({ outer_wall_speed: ["50", "60", "50", "60"] }));
    expect(settings.outer_wall_speed).toEqual(["50", "60"]);
    expect(conflicts.size).toBe(0);
    expect(variantIndex).toBe(0);
  });

  it("uses the lower number when the nozzles disagree, and reports it", () => {
    const { settings, conflicts } = collapseNozzleVariants(h2c({ outer_wall_speed: ["70", "60", "50", "80"] }));
    expect(settings.outer_wall_speed).toEqual(["50", "60"]);
    expect(conflicts.get("outer_wall_speed")).toEqual(["70", "60", "50", "80"]);
  });

  it("takes nozzle 1's value when a disagreement can't be compared as numbers", () => {
    const { settings, conflicts } = collapseNozzleVariants(h2c({ overhang_1_4_speed: ["50%", "60", "40", "60"] }));
    expect(settings.overhang_1_4_speed).toEqual(["50%", "60"]);
    expect(conflicts.has("overhang_1_4_speed")).toBe(true);
  });

  it("finds the columns by name, whatever order the source lists them in", () => {
    const { settings } = collapseNozzleVariants(
      h2c({ print_extruder_id: ["1", "2", "1", "2"], print_extruder_variant: [STD, STD, HF, HF], outer_wall_speed: ["50", "50", "60", "60"] }),
    );
    expect(settings.outer_wall_speed).toEqual(["50", "60"]);
    const highFlowFirst = collapseNozzleVariants(h2c({ print_extruder_variant: [HF, STD, HF, STD], outer_wall_speed: ["60", "50", "60", "50"] }));
    expect(highFlowFirst.settings.outer_wall_speed, "standard first, as the U1 stores it").toEqual(["50", "60"]);
    expect(highFlowFirst.variantIndex).toBe(0);
  });

  it("leaves arrays that aren't per-nozzle print settings alone, even at the same length", () => {
    const source: Record<string, unknown> = h2c({ filament_colour: ["#111111", "#222222", "#333333", "#444444"], nozzle_temperature: ["200", "210", "220", "230"] });
    expect(collapseNozzleVariants(source).settings).toMatchObject({ filament_colour: source.filament_colour, nozzle_temperature: source.nozzle_temperature });
  });

  it("names the installed variant only when both nozzles have the same one", () => {
    expect(collapseNozzleVariants(h2c({ nozzle_volume_type: ["High Flow", "High Flow"] })).variantIndex).toBe(1);
    expect(collapseNozzleVariants(h2c({ nozzle_volume_type: ["Standard", "High Flow"] })).variantIndex).toBeNull();
  });

  it("changes nothing for a single-nozzle file or a layout it can't read", () => {
    const single = { nozzle_diameter: ["0.4"], print_extruder_id: ["1", "1"], print_extruder_variant: [STD, HF], outer_wall_speed: ["210", "350"] };
    expect(collapseNozzleVariants(single).settings).toBe(single);
    const uneven = h2c({ print_extruder_id: ["1", "1", "2"], print_extruder_variant: [STD, HF, STD], outer_wall_speed: ["50", "60", "50"] });
    expect(collapseNozzleVariants(uneven).settings).toBe(uneven);
    const mismatched = h2c({ print_extruder_variant: [STD, HF, STD, STD] });
    expect(collapseNozzleVariants(mismatched).settings).toBe(mismatched);
  });
});
