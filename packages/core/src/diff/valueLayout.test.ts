// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { ChangeTracker } from "../explain/whatChanged.js";
import { diffSettings } from "./diffSettings.js";
import { VALUE_LAYOUT_TEXT, valueLayout, valueLayoutNotes } from "./valueLayout.js";

const u1 = { printer_model: "Snapmaker U1" };
const p1s = { printer_model: "Bambu Lab P1S" };
const h2d = { printer_model: "Bambu Lab H2D", print_extruder_id: ["1", "1", "2", "2"], print_extruder_variant: ["Direct Drive Standard", "Direct Drive High Flow", "Direct Drive Standard", "Direct Drive High Flow"] };

describe("valueLayout", () => {
  it("names the U1's hotend pair, another printer's flow variants, and a two-nozzle printer's columns", () => {
    expect(valueLayout("outer_wall_speed", 2, u1)).toBe("u1-hotends");
    expect(valueLayout("outer_wall_speed", 2, {})).toBe("u1-hotends");
    expect(valueLayout("outer_wall_speed", 2, p1s)).toBe("flow-variants");
    expect(valueLayout("outer_wall_speed", 4, h2d)).toBe("nozzle-variants");
  });

  it("gives no layout to single values, unpaired settings or lists of filaments", () => {
    expect(valueLayout("outer_wall_speed", 1, u1)).toBeUndefined();
    expect(valueLayout("outer_wall_speed", 2, h2d)).toBeUndefined();
    expect(valueLayout("wall_loops", 2, u1)).toBeUndefined();
    // A 4-filament project's temperatures are four filaments, not pairs.
    expect(valueLayout("nozzle_temperature", 4, u1)).toBeUndefined();
    expect(valueLayout("filament_max_volumetric_speed", 4, u1)).toBeUndefined();
  });

  it("names a filament slot's standard and high-flow values", () => {
    expect(valueLayout("filament_max_volumetric_speed", 2, u1, true)).toBe("u1-hotends");
    expect(valueLayout("filament_max_volumetric_speed", 2, p1s, true)).toBe("flow-variants");
    expect(valueLayout("nozzle_temperature", 2, u1, true)).toBe("u1-hotends");
    expect(valueLayout("filament_density", 2, u1, true)).toBeUndefined();
  });
});

describe("layout in the settings diff", () => {
  it("marks each side of a paired setting from that side's own printer, whatever the file is called", () => {
    const diff = diffSettings(
      { label: "renamed-without-the-printer.3mf", settings: { ...p1s, outer_wall_speed: ["200", "200"], nozzle_temperature: ["220", "220", "215", "215"], filament_colour: ["#FFFFFF", "#000000", "#FF0000", "#00FF00"] } },
      { label: "Snapmaker's stock profile", settings: { ...u1, outer_wall_speed: ["200", "500"], nozzle_temperature: ["210", "210", "210", "210"], filament_colour: ["#FFFFFF", "#000000", "#FF0000", "#00FF00"] } },
    );
    const rows = diff.groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.key === "outer_wall_speed")?.layout).toEqual({ a: "flow-variants", b: "u1-hotends" });
    expect(rows.filter((r) => r.key === "nozzle_temperature").every((r) => r.layout === undefined)).toBe(true);
    const print = diff.groups.find((g) => g.group === "print")!;
    expect(valueLayoutNotes(print.rows)).toEqual([VALUE_LAYOUT_TEXT["u1-hotends"], VALUE_LAYOUT_TEXT["flow-variants"]]);
    const filament = diff.groups.filter((g) => g.group === "filament");
    expect(filament.flatMap((g) => valueLayoutNotes(g.rows))).toEqual([]);
  });

  it("marks a two-nozzle file's per-nozzle columns", () => {
    const diff = diffSettings(
      { label: "h2d.3mf", settings: { ...h2d, outer_wall_speed: ["50", "60", "50", "60"] } },
      { label: "stock", settings: { ...u1, outer_wall_speed: ["200", "500"] } },
    );
    expect(diff.groups[0].rows.find((r) => r.key === "outer_wall_speed")?.layout).toEqual({ a: "nozzle-variants", b: "u1-hotends" });
  });
});

describe("layout in What changed", () => {
  it("takes a kept-at-stock value's layout from the creator's file and the converted value's from the U1", () => {
    const source = { ...h2d, outer_wall_speed: ["50", "60", "50", "60"], wall_loops: "4" };
    const stock = { ...u1, outer_wall_speed: ["200", "500"], wall_loops: "2" };
    const output = { ...stock };
    const groups = new ChangeTracker().build(source, stock, output, () => "kept for the U1");
    const item = groups.get("stock")?.find((i) => i.key === "outer_wall_speed");
    expect(item?.layout).toEqual({ before: "nozzle-variants", after: "u1-hotends" });
    expect(groups.get("stock")?.find((i) => i.key === "wall_loops")?.layout).toBeUndefined();
  });
});
