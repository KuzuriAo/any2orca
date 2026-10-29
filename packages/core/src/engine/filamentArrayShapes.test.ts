// SPDX-License-Identifier: MIT
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { tolerantJsonParse } from "../archive/tolerantJsonParse.js";
import { convert } from "../project.js";
import { readFixture, testProfileSource } from "../test-helpers.js";

// On the 0.6 nozzle (one value per filament). A source file whose filament arrays don't all have one value per filament, and that doesn't say why.
async function convertWith(edit: (settings: Record<string, unknown>) => void) {
  const entries = unzipSync(readFixture("synthetic-2plate.3mf"));
  const source = tolerantJsonParse(new TextDecoder().decode(entries["Metadata/project_settings.config"])).value as Record<string, unknown>;
  edit(source);
  entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
  const { output, report } = await convert(zipSync(entries), { profiles: testProfileSource(), profileId: "snapmaker-u1-0.6-standard", stamp: false });
  return { settings: JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"])), warnings: report.warnings };
}

describe("filament arrays longer than the filament count, with no variant names", () => {
  it("keep the first value of each filament, as Snapmaker Orca does, and say so", async () => {
    const { settings, warnings } = await convertWith((s) => {
      s.filament_colour = ["#FF0000", "#00FF00", "#0000FF"];
      s.filament_settings_id = ["A", "B", "C"];
      s.filament_flow_ratio = ["0.91", "0.92", "0.93", "0.94", "0.95", "0.96"];
    });
    expect(settings.filament_flow_ratio).toEqual(["0.91", "0.92", "0.93"]);
    expect(warnings.some((w) => w.includes("filament_flow_ratio"))).toBe(true);
  });
});

describe("a filament name list shorter than the filament count", () => {
  it("is reported, not replaced silently", async () => {
    const { warnings } = await convertWith((s) => {
      s.filament_colour = ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF"];
      s.filament_settings_id = ["A", "B"];
    });
    expect(warnings.some((w) => w.includes("filament_settings_id"))).toBe(true);
  });
});

describe("layer heights and nozzle sizes the U1 has no profile for", () => {
  async function pick(edit: (s: Record<string, unknown>) => void) {
    const entries = unzipSync(readFixture("synthetic-2plate.3mf"));
    const source = tolerantJsonParse(new TextDecoder().decode(entries["Metadata/project_settings.config"])).value as Record<string, unknown>;
    edit(source);
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
    const { output, report } = await convert(zipSync(entries), { profiles: testProfileSource(), stamp: false });
    const out = JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"]));
    return { printSettingsId: out.print_settings_id as string, warnings: report.warnings };
  }

  for (const bad of ["0", "-0.2", "NaN", "abc"]) {
    it(`a layer height of ${JSON.stringify(bad)} is reported and doesn't pick the finest profile`, async () => {
      const { printSettingsId, warnings } = await pick((s) => {
        s.layer_height = bad;
        s.nozzle_diameter = ["0.4"];
        delete s.print_settings_id;
      });
      expect(printSettingsId).not.toMatch(/^0\.08mm/);
      expect(warnings.some((w) => w.includes("layer height"))).toBe(true);
    });
  }

  it("a nozzle size with no U1 profile is reported", async () => {
    const { warnings } = await pick((s) => {
      s.nozzle_diameter = ["0.5"];
    });
    expect(warnings.some((w) => w.includes("0.5mm nozzle"))).toBe(true);
  });

  it("a missing nozzle size is reported", async () => {
    const { warnings } = await pick((s) => {
      delete s.nozzle_diameter;
    });
    expect(warnings.some((w) => w.includes("nozzle size"))).toBe(true);
  });
});

describe("the 'no changed settings were marked' note", () => {
  it("isn't shown when settings from the creator's file were carried over anyway", async () => {
    const entries = unzipSync(readFixture("synthetic-2plate.3mf"));
    const source = tolerantJsonParse(new TextDecoder().decode(entries["Metadata/project_settings.config"])).value as Record<string, unknown>;
    source.different_settings_to_system = ["", ""];
    source.sparse_infill_density = "37%";
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
    const { report } = await convert(zipSync(entries), { profiles: testProfileSource(), stamp: false });
    expect(report.warnings.filter((w) => /no customized|were marked/.test(w))).toEqual([]);
  });
});

describe("flush volumes in the converted file", () => {
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

  it("are sized for the project's filaments from a two-nozzle source's per-nozzle matrix, as strings", async () => {
    const colors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"];
    const { settings } = await convertWith((s) => {
      s.filament_colour = colors;
      s.filament_settings_id = colors.map(() => "Bambu PLA Basic @BBL H2C");
      s.flush_volumes_matrix = Array.from({ length: 72 }, (_, i) => String(100 + i));
      s.flush_volumes_vector = Array.from({ length: 12 }, () => "140");
    });
    expect(settings.flush_volumes_matrix).toHaveLength(36);
    expect(settings.flush_volumes_vector).toHaveLength(12);
    expect(strings(settings.flush_volumes_matrix) && strings(settings.flush_volumes_vector)).toBe(true);
  });

  it("stay strings when a stale larger matrix is cut down", async () => {
    const { settings } = await convertWith((s) => {
      s.filament_colour = ["#111111", "#222222"];
      s.filament_settings_id = ["A", "B"];
      s.flush_volumes_matrix = Array.from({ length: 9 }, (_, i) => String(i));
      s.flush_volumes_vector = Array.from({ length: 6 }, () => "140");
    });
    expect(settings.flush_volumes_matrix).toEqual(["0", "1", "3", "4"]);
    expect(strings(settings.flush_volumes_vector)).toBe(true);
  });
});

describe("choice settings with a value Snapmaker Orca doesn't offer", () => {
  it("keep Snapmaker's stock value, with a warning; a legacy name Snapmaker Orca translates itself is kept", async () => {
    const { settings, warnings } = await convertWith((s) => {
      s.sparse_infill_pattern = "not_a_pattern";
      s.top_surface_pattern = "zig-zag";
      s.different_settings_to_system = ["sparse_infill_pattern;top_surface_pattern", ""];
    });
    expect(settings.sparse_infill_pattern).not.toBe("not_a_pattern");
    expect(warnings.some((w) => w.includes("sparse_infill_pattern") && w.includes("choices"))).toBe(true);
    expect(settings.top_surface_pattern).toBe("zig-zag");
  });
});
