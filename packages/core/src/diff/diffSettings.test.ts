// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "../errors.js";
import { diffSettings, labelOf, MAX_DIFF_KEYS, type SettingsDiff, sameSetting } from "./diffSettings.js";

const side = (label: string, settings: Record<string, unknown>) => ({ label, settings });
const rows = (d: SettingsDiff) => d.groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.group, slot: g.slot })));
const row = (d: SettingsDiff, key: string, slot?: number) => rows(d).find((r) => r.key === key && r.slot === slot);

describe("diffSettings", () => {
  it("finds no differences between a file and itself", () => {
    const s = { wall_loops: "3", outer_wall_speed: ["200", "500"], filament_colour: ["#FF0000"], nozzle_temperature: ["220"] };
    const d = diffSettings(side("a", s), side("b", s));
    expect(d.identical).toBe(true);
    expect(d.groups).toEqual([]);
  });

  it("names settings the way Snapmaker Orca's settings pages do", () => {
    expect(labelOf("outer_wall_speed")).toBe("Speed > Other layers speed > Outer wall");
    expect(labelOf("outer_wall_acceleration")).toBe("Speed > Acceleration > Outer wall");
    expect(labelOf("not_a_setting")).toBe("not_a_setting");
  });

  it("reports a real change in the right group", () => {
    const d = diffSettings(side("a", { wall_loops: "2", nozzle_type: "stainless_steel" }), side("b", { wall_loops: "3", nozzle_type: "hardened_steel" }));
    expect(row(d, "wall_loops")).toMatchObject({ group: "print", a: "2", b: "3", status: "changed" });
    expect(row(d, "nozzle_type")).toMatchObject({ group: "machine", status: "changed" });
    expect(d.identical).toBe(false);
  });

  it("compares the way Snapmaker Orca does, so format alone is never a difference", () => {
    const a = { top_shell_thickness: "1.0", sparse_infill_density: "15.0%", travel_speed: "500", retraction_length: ["0.8"], machine_end_gcode: "G1 X1   \r\nM400\r\n" };
    const b = { top_shell_thickness: "1", sparse_infill_density: "15%", travel_speed: ["500", "500"], retraction_length: ["0.8", "0.8", "0.8", "0.8"], machine_end_gcode: "G1 X1\nM400" };
    expect(diffSettings(side("a", a), side("b", b)).identical).toBe(true);
  });

  it("tells settings only one side has from settings Snapmaker Orca doesn't know", () => {
    const d = diffSettings(side("a", { wall_loops: "3", print_extruder_variant: ["Direct Drive Standard"] }), side("b", { seam_position: "aligned" }));
    expect(row(d, "wall_loops")?.status).toBe("only-a");
    expect(row(d, "seam_position")?.status).toBe("only-b");
    expect(row(d, "print_extruder_variant")).toMatchObject({ status: "unmatched", group: "other" });
  });

  it("compares filament settings slot by slot, and marks slots only one side has", () => {
    const a = { filament_colour: ["#FF0000", "#00FF00"], nozzle_temperature: ["220", "230"] };
    const b = { filament_colour: ["#FF0000"], nozzle_temperature: ["215"] };
    const d = diffSettings(side("a", a), side("b", b));
    expect(row(d, "nozzle_temperature", 1)).toMatchObject({ a: "220", b: "215", status: "changed" });
    expect(row(d, "nozzle_temperature", 2)).toMatchObject({ a: "230", b: null, status: "only-a" });
    expect(row(d, "filament_colour", 2)).toMatchObject({ a: "#00FF00", status: "only-a" });
    expect(row(d, "filament_colour", 1)).toBeUndefined();
  });

  it("splits standard and high-flow filament values by the file's own layout", () => {
    const a = { filament_colour: ["#000000", "#FFFFFF"], filament_flow_step_size: ["2", "2"], filament_max_volumetric_speed: ["22", "40", "21", "40"] };
    const b = { filament_colour: ["#000000", "#FFFFFF"], filament_flow_step_size: ["2", "2"], filament_max_volumetric_speed: ["22", "40", "21", "29"] };
    const d = diffSettings(side("a", a), side("b", b));
    expect(row(d, "filament_max_volumetric_speed", 1)).toBeUndefined();
    expect(row(d, "filament_max_volumetric_speed", 2)).toMatchObject({ a: "21, 40", b: "21, 29", status: "changed" });
  });

  it("leaves bookkeeping out unless asked", () => {
    const a = { different_settings_to_system: ["wall_loops", ""], inherits_group: ["x"], wall_loops: "3" };
    const b = { different_settings_to_system: ["", ""], wall_loops: "3" };
    expect(diffSettings(side("a", a), side("b", b)).identical).toBe(true);
    expect(diffSettings(side("a", a), side("b", b), { includeBookkeeping: true }).identical).toBe(false);
  });

  it("can list everything, and compare only some groups", () => {
    const a = { wall_loops: "3", nozzle_type: "stainless_steel" };
    const b = { wall_loops: "3", nozzle_type: "hardened_steel" };
    expect(row(diffSettings(side("a", a), side("b", b), { includeUnchanged: true }), "wall_loops")?.status).toBe("same");
    const printOnly = diffSettings(side("a", a), side("b", b), { groups: ["print"] });
    expect(printOnly.identical).toBe(true);
    expect(printOnly.groups).toEqual([]);
  });

  it("swapping the sides swaps the values and the only-in-one-side statuses", () => {
    const a = { wall_loops: "2", seam_position: "back" };
    const b = { wall_loops: "3", top_shell_layers: "5" };
    const ab = rows(diffSettings(side("a", a), side("b", b)));
    const ba = rows(diffSettings(side("b", b), side("a", a)));
    const flip = { "only-a": "only-b", "only-b": "only-a" } as Record<string, string>;
    for (const r of ab) {
      const mirror = ba.find((x) => x.key === r.key && x.slot === r.slot);
      expect(mirror).toMatchObject({ a: r.b, b: r.a, status: flip[r.status] ?? r.status });
    }
  });

  it("describes itself, so an export says what it compared", () => {
    const d = diffSettings(side("first.3mf", {}), side("Snapmaker's stock profile", {}));
    expect(d).toMatchObject({ format: "any2orca-diff", version: 1, aLabel: "first.3mf", bLabel: "Snapmaker's stock profile" });
    expect(d.catalog.tag).toMatch(/^v\d/);
  });

  it("treats hostile input safely", () => {
    const proto = JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": "x", "wall_loops": "3"}');
    const d = diffSettings(side("a", proto), side("b", { wall_loops: "3" }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(row(d, "__proto__")?.status).toBe("unmatched");
    const huge = Object.fromEntries(Array.from({ length: MAX_DIFF_KEYS + 1 }, (_, i) => [`k${i}`, "1"]));
    expect(() => diffSettings(side("a", huge), side("b", {}))).toThrow(Any2orcaError);
    expect(() => diffSettings(side("a", [] as unknown as Record<string, unknown>), side("b", {}))).toThrow(Any2orcaError);
  });

  it("never hides a real difference behind normalization", () => {
    const pairs: Array<[string, string]> = [["1", "1.01"], ["15%", "15"], ["0.4", "0.40001"], ["aligned", "Aligned"], ["G1 X1\nM400", "G1 X2\nM400"], ["", "0"]];
    for (const [x, y] of pairs) {
      expect(diffSettings(side("a", { seam_gap: x }), side("b", { seam_gap: y })).identical, `${x} vs ${y}`).toBe(false);
    }
    expect(diffSettings(side("a", { post_process: [] }), side("b", { post_process: ["rm -rf ~"] })).identical).toBe(false);
    expect(diffSettings(side("a", { post_process: [] }), side("b", { post_process: [""] })).identical).toBe(true);
  });

  it("marks values above the reference's machine limits or stock values, and nothing else", () => {
    const reference = {
      stock: { outer_wall_speed: ["200", "500"], outer_wall_acceleration: "5000", wall_loops: "2" },
      machine: { machine_max_speed_x: ["500"], machine_max_speed_y: ["500"], machine_max_acceleration_extruding: ["20000"] },
    };
    const a = { outer_wall_speed: ["600", "500"], outer_wall_acceleration: "8000", wall_loops: "5", sparse_infill_speed: "150%" };
    const b = { outer_wall_speed: ["200", "500"], outer_wall_acceleration: "5000", wall_loops: "2", sparse_infill_speed: "100" };
    const d = diffSettings(side("a", a), side("b", b), { reference });
    expect(row(d, "outer_wall_speed")?.attention).toBe("above-limit");
    expect(row(d, "outer_wall_acceleration")?.attention).toBe("above-stock");
    expect(row(d, "wall_loops")?.attention).toBeUndefined();
    expect(row(d, "sparse_infill_speed")?.attention).toBeUndefined();
    expect(row(diffSettings(side("a", a), side("b", b)), "outer_wall_speed")?.attention).toBeUndefined();
    const flow = diffSettings(
      side("a", { filament_colour: ["#000000"], filament_flow_step_size: ["2"], filament_max_volumetric_speed: ["25", "40"] }),
      side("b", { filament_colour: ["#000000"], filament_flow_step_size: ["2"], filament_max_volumetric_speed: ["22", "40"] }),
      { reference },
    );
    expect(row(flow, "filament_max_volumetric_speed", 1)?.attention).toBe("above-stock");
  });

  it("lists rows in Snapmaker Orca's settings-page order", () => {
    const d = diffSettings(side("a", { outer_wall_speed: "300", wall_loops: "5", seam_position: "back" }), side("b", { outer_wall_speed: "200", wall_loops: "2", seam_position: "aligned" }));
    expect(d.groups[0].rows.map((r) => r.key)).toEqual(["seam_position", "wall_loops", "outer_wall_speed"]);
  });

  it("gives each row its settings page and section, for grouping", () => {
    const d = diffSettings(side("a", { outer_wall_acceleration: "3000", not_a_setting: "1" }), side("b", { outer_wall_acceleration: "2000" }));
    expect(row(d, "outer_wall_acceleration")).toMatchObject({ page: "Speed", section: "Acceleration", label: "Speed > Acceleration > Outer wall" });
    expect(row(d, "not_a_setting")?.page).toBeUndefined();
  });
});


describe("sameSetting with repeated values", () => {
  it("treats two lists that each repeat the same one value as equal, whatever their lengths", () => {
    expect(sameSetting(["500", "500", "500", "500", "500"], ["500", "500"])).toBe(true);
    expect(sameSetting(["500", "500", "500", "500"], ["500", "400"])).toBe(false);
    expect(sameSetting(["500", "500", "500"], ["400", "400"])).toBe(false);
  });
});

describe("above-stock marks for a file from another printer", () => {
  it("compare only its first value: a Bambu file's second number is another extruder, not the U1's high-flow slot", () => {
    const reference = { stock: { top_surface_speed: ["200", "200"] }, machine: { machine_max_speed_x: ["500"], machine_max_speed_y: ["500"] } };
    const bambu = { printer_model: "Bambu Lab P1S", top_surface_speed: ["200", "300"] };
    const u1 = { printer_model: "Snapmaker U1", top_surface_speed: ["200", "200"] };
    expect(row(diffSettings(side("a", bambu), side("b", u1), { reference }), "top_surface_speed")?.attention).toBeUndefined();
    // A U1 file's second value is its high-flow value, and is compared as one.
    const u1Fast = { printer_model: "Snapmaker U1", top_surface_speed: ["200", "300"] };
    expect(row(diffSettings(side("a", u1Fast), side("b", u1), { reference }), "top_surface_speed")?.attention).toBe("above-stock");
  });
});
