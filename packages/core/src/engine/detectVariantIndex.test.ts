// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { detectVariantIndex } from "./detectVariantIndex.js";

describe("detectVariantIndex", () => {
  it("returns null when nozzle_diameter isn't a single-element array (genuine multi-nozzle source, e.g. H2D)", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4", "0.4"],
        filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
        nozzle_volume_type: ["HighFlow"],
      }),
    ).toBeNull();
  });

  it("returns null when no ordered variant-name list is present at all", () => {
    expect(detectVariantIndex({ nozzle_diameter: ["0.4"], nozzle_volume_type: ["Standard"] })).toBeNull();
  });

  it("returns null when the variant-name list has fewer than 2 usable entries", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Direct Drive Standard"],
        nozzle_volume_type: ["Standard"],
      }),
    ).toBeNull();
  });

  it("returns null when neither nozzle_volume_type nor default_nozzle_volume_type is present", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
      }),
    ).toBeNull();
  });

  it("picks the Standard index from nozzle_volume_type, even when the selected filament preset name says 'HF'", () => {
    // A real case: nozzle_volume_type says Standard is installed,
    // but the loaded filament preset is "Bambu PETG HF @BBL X1C" -- Bambu
    // Studio still slices with the Standard column here. An earlier,
    // wrong version of this function used the filament name instead and
    // picked High Flow.
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
        filament_settings_id: ["Bambu PETG HF @BBL X1C"],
        nozzle_volume_type: ["Standard"],
      }),
    ).toBe(0);
  });

  it("picks the High Flow index when nozzle_volume_type says HighFlow", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
        nozzle_volume_type: ["HighFlow"],
      }),
    ).toBe(1);
  });

  it("falls back to default_nozzle_volume_type when nozzle_volume_type is absent", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
        default_nozzle_volume_type: ["HighFlow"],
      }),
    ).toBe(1);
  });

  it("normalizes a single comma-joined variant-name string into separate names", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        extruder_variant_list: ["Direct Drive Standard,Direct Drive High Flow"],
        nozzle_volume_type: ["HighFlow"],
      }),
    ).toBe(1);
  });

  it("falls back through filament_extruder_variant -> print_extruder_variant -> printer_extruder_variant -> extruder_variant_list", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        printer_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow"],
        nozzle_volume_type: ["HighFlow"],
      }),
    ).toBe(1);
  });

  it("defaults to index 0 when a variant list exists but no entry matches the active variant name", () => {
    expect(
      detectVariantIndex({
        nozzle_diameter: ["0.4"],
        filament_extruder_variant: ["Foo", "Bar"],
        nozzle_volume_type: ["Standard"],
      }),
    ).toBe(0);
  });
});
