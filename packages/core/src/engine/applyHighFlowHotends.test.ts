// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { applyHighFlowHotends, resolveHighFlowSelection, VARIANT_PROCESS_KEYS, type HighFlowTuning } from "./applyHighFlowHotends.js";

const TUNING: HighFlowTuning = {
  standard: { outer_wall_speed: "200", inner_wall_speed: "300" },
  highFlow: { outer_wall_speed: "500", inner_wall_speed: "600" },
};

describe("resolveHighFlowSelection", () => {
  it("treats undefined, false and an all-false list as no high-flow hotends", () => {
    expect(resolveHighFlowSelection(undefined, 4)).toBeNull();
    expect(resolveHighFlowSelection(false, 4)).toBeNull();
    expect(resolveHighFlowSelection([false, false, false, false], 4)).toBeNull();
  });

  it("expands true to every toolhead and keeps an explicit list as given", () => {
    expect(resolveHighFlowSelection(true, 4)).toEqual([true, true, true, true]);
    expect(resolveHighFlowSelection([true, false, true, false], 4)).toEqual([true, false, true, false]);
  });

  it("rejects a list that doesn't name every toolhead", () => {
    expect(() => resolveHighFlowSelection([true], 4)).toThrow(/1 toolhead\(s\), but this printer has 4/);
    expect(() => resolveHighFlowSelection([true, true, true, true, true], 4)).toThrow();
  });
});

describe("applyHighFlowHotends", () => {
  it("records each toolhead's hotend in nozzle_volume_type, T1 first", () => {
    const settings: Record<string, unknown> = {};
    applyHighFlowHotends(settings, [true, false, false, true], null, []);
    expect(settings.nozzle_volume_type).toEqual(["high_flow", "standard", "standard", "high_flow"]);
  });

  it("on a tuned tier, carries both flow variants the way Snapmaker Orca saves them", () => {
    const settings: Record<string, unknown> = { outer_wall_speed: "200", inner_wall_speed: ["300"], travel_speed: "500", layer_height: "0.2" };
    applyHighFlowHotends(settings, [true, false, false, false], TUNING, []);
    expect(settings.process_flow_support).toEqual(["standard", "high_flow"]);
    expect(settings.printer_flow_support).toEqual(["standard", "high_flow"]);
    expect(settings.outer_wall_speed).toEqual(["200", "500"]);
    expect(settings.inner_wall_speed).toEqual(["300", "600"]);
    expect(settings.travel_speed).toEqual(["500", "500"]); // a variant key without high-flow tuning: same value twice
    expect(settings.layer_height).toBe("0.2"); // not a variant key: untouched
  });

  it("keeps a creator's customized speed in both slots instead of Snapmaker's high-flow value", () => {
    const settings: Record<string, unknown> = { outer_wall_speed: "150", inner_wall_speed: "300" };
    applyHighFlowHotends(settings, [true, true, true, true], TUNING, []);
    expect(settings.outer_wall_speed).toEqual(["150", "150"]);
    expect(settings.inner_wall_speed).toEqual(["300", "600"]);
  });

  it("leaves a key alone that is already a multi-entry list", () => {
    const settings: Record<string, unknown> = { travel_speed: ["400", "450"] };
    applyHighFlowHotends(settings, [true, false, false, false], TUNING, []);
    expect(settings.travel_speed).toEqual(["400", "450"]);
  });

  it("on an untuned tier, records the hotends, keeps normal speeds and says so", () => {
    const settings: Record<string, unknown> = { outer_wall_speed: "200" };
    const warnings: string[] = [];
    applyHighFlowHotends(settings, [true, true, false, false], null, warnings);
    expect(settings.outer_wall_speed).toBe("200");
    expect(settings.process_flow_support).toBeUndefined();
    expect(warnings.join("\n")).toMatch(/WARN: this profile has no separate high-flow speeds/);
  });

  it("flags every key it writes in different_settings_to_system without dropping existing ones", () => {
    const settings: Record<string, unknown> = { outer_wall_speed: "200", different_settings_to_system: ["layer_height;nozzle_volume_type", "x"] };
    applyHighFlowHotends(settings, [true, false, false, false], TUNING, []);
    const flagged = (settings.different_settings_to_system as string[])[0].split(";");
    expect(flagged).toEqual(expect.arrayContaining(["layer_height", "nozzle_volume_type", "outer_wall_speed", "process_flow_support", "printer_flow_support"]));
    expect(new Set(flagged).size).toBe(flagged.length);
    expect((settings.different_settings_to_system as string[])[1]).toBe("x");
  });

  it("leaves settings without a different_settings_to_system list alone", () => {
    const settings: Record<string, unknown> = {};
    applyHighFlowHotends(settings, [true, true, true, true], null, []);
    expect(settings.different_settings_to_system).toBeUndefined();
  });

  it("lists only process keys, no filament keys", () => {
    expect(VARIANT_PROCESS_KEYS.some((k) => k.startsWith("filament_"))).toBe(false);
  });

  it("gives each filament the hotend type of the toolhead it prints on (filament N on toolhead N)", () => {
    const settings: Record<string, unknown> = { filament_volume_type: ["standard", "standard", "standard"], different_settings_to_system: ["", ""] };
    const warnings: string[] = [];
    applyHighFlowHotends(settings, [false, true, false, true], null, warnings);
    expect(settings.filament_volume_type).toEqual(["standard", "high_flow", "standard"]);
    // Project state, not a preset setting.
    expect(settings.different_settings_to_system).toEqual(["nozzle_volume_type", ""]);
    expect(warnings.some((w) => w.includes("share a toolhead"))).toBe(false);
  });

  it("gives filaments beyond the toolhead count the type every toolhead shares", () => {
    const settings: Record<string, unknown> = { filament_volume_type: new Array(6).fill("standard") };
    const warnings: string[] = [];
    applyHighFlowHotends(settings, [true, true, true, true], null, warnings);
    expect(settings.filament_volume_type).toEqual(new Array(6).fill("high_flow"));
    expect(warnings.some((w) => w.includes("share a toolhead"))).toBe(false);
  });

  it("keeps filaments beyond the toolhead count on standard, and says so, when the toolheads differ", () => {
    const settings: Record<string, unknown> = { filament_volume_type: new Array(6).fill("standard") };
    const warnings: string[] = [];
    applyHighFlowHotends(settings, [true, false, false, false], null, warnings);
    expect(settings.filament_volume_type).toEqual(["high_flow", "standard", "standard", "standard", "standard", "standard"]);
    expect(warnings.some((w) => w.includes("filaments 5 and up share a toolhead"))).toBe(true);
  });
});
