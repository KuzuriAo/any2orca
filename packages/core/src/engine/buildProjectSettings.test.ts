// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEWEST_TEMPLATES_DIR } from "../test-helpers.js";
import { buildProjectSettings } from "./buildProjectSettings.js";

function loadRealBaseline(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(NEWEST_TEMPLATES_DIR, "project_settings_baseline.config"), "utf-8"));
}

describe("buildProjectSettings (synthetic)", () => {
  it("keeps the baseline's own value for an ordinary key when Bambu doesn't flag it as customized", () => {
    const result = buildProjectSettings({ layer_height: "0.2" }, { layer_height: "0.28" }, null, new Set(), new Set(), new Set(), []);
    expect(result.newSettings.layer_height).toBe("0.2");
    expect(result.changedKeys).toEqual([]);
    expect(result.transferableCount).toBe(0);
  });

  it("transfers a key present in both baseline and bambu when Bambu's different_settings_to_system flags it as customized", () => {
    const result = buildProjectSettings(
      { layer_height: "0.2", different_settings_to_system: ["layer_height", ""] },
      { layer_height: "0.28", different_settings_to_system: ["layer_height", ""] },
      null,
      new Set(),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings.layer_height).toBe("0.28");
    expect(result.changedKeys).toEqual([["layer_height", "0.2", "0.28"]]);
    expect(result.transferableCount).toBe(1);
  });

  it("never transfers a blocklisted key even when flagged as customized and different", () => {
    const result = buildProjectSettings(
      { printable_height: "270.05", different_settings_to_system: ["printable_height", ""] },
      { printable_height: "250", different_settings_to_system: ["printable_height", ""] },
      null,
      new Set(["printable_height"]),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings.printable_height).toBe("270.05");
    expect(result.changedKeys).toEqual([]);
    expect(result.transferableCount).toBe(0);
  });

  it("only counts keys present in both settings objects as transferable, even when flagged", () => {
    const result = buildProjectSettings(
      { only_in_baseline: "a" },
      { only_in_bambu: "b", shared_key: "x", different_settings_to_system: ["only_in_baseline", "only_in_bambu", "shared_key"] },
      null,
      new Set(),
      new Set(),
      new Set(),
      [],
    );
    expect(result.transferableCount).toBe(0);
    expect(result.newSettings).not.toHaveProperty("only_in_bambu");
  });

  it("strips the source's nozzle_volume_type/default_nozzle_volume_type, and never restores a Bambu-style baseline value", () => {
    const result = buildProjectSettings(
      {
        layer_height: "0.2",
        nozzle_volume_type: ["Standard"],
        default_nozzle_volume_type: ["Standard"],
        different_settings_to_system: ["nozzle_volume_type", ""],
      },
      {
        layer_height: "0.2",
        nozzle_volume_type: ["Standard", "Standard", "Standard", "Standard"],
        different_settings_to_system: ["nozzle_volume_type", ""],
      },
      null,
      new Set(),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings).not.toHaveProperty("nozzle_volume_type");
    expect(result.newSettings).not.toHaveProperty("default_nozzle_volume_type");
    // Also never listed in the rebuilt different_settings_to_system key list.
    expect(String((result.newSettings.different_settings_to_system as string[])[0])).not.toContain("nozzle_volume_type");
  });

  it("overlays filament key arrays, tracking filamentChanged when the value differs from baseline", () => {
    const result = buildProjectSettings(
      { filament_colour: ["#000000"] },
      {},
      { filament_colour: ["#FF0000", "#00FF00"] },
      new Set(),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings.filament_colour).toEqual(["#FF0000", "#00FF00"]);
    expect(result.filamentChanged).toEqual([["filament_colour", ["#000000"], ["#FF0000", "#00FF00"]]]);
  });

  it("does not record filamentChanged when the overlay value already matches", () => {
    const result = buildProjectSettings({ x: ["a"] }, {}, { x: ["a"] }, new Set(), new Set(), new Set(), []);
    expect(result.filamentChanged).toEqual([]);
  });

  it("never transfers a blocklisted key, so a U1-value key keeps the baseline's stock value", () => {
    const result = buildProjectSettings(
      { enable_arc_fitting: "0", wall_loops: "2" },
      { enable_arc_fitting: "1", wall_loops: "4", different_settings_to_system: ["enable_arc_fitting;wall_loops", ""] },
      null,
      new Set(["enable_arc_fitting"]),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings.enable_arc_fitting).toBe("0"); // kept at the U1 value
    expect(result.newSettings.wall_loops).toBe("4"); // ordinary customized key transfers
  });

  it("restores the U1 profile's nozzle_volume_type and drops the source's", () => {
    const result = buildProjectSettings(
      { nozzle_volume_type: ["standard", "standard", "standard", "standard"] },
      { nozzle_volume_type: ["Standard"], default_nozzle_volume_type: ["Standard"] },
      null,
      new Set(),
      new Set(),
      new Set(),
      [],
    );
    expect(result.newSettings.nozzle_volume_type).toEqual(["standard", "standard", "standard", "standard"]);
    expect(result.newSettings).not.toHaveProperty("default_nozzle_volume_type");
  });

  it("creates the changed-settings list in Orca's layout when the stock baseline has none", () => {
    const result = buildProjectSettings({ a: "1", filament_colour: ["#000000", "#FFFFFF"] }, {}, null, new Set(), new Set(), new Set(), []);
    expect(result.newSettings.different_settings_to_system).toEqual(["a;filament_colour", "", "", ""]);
  });

  describe("different_settings_to_system rebuild", () => {
    it("rebuilds different_settings_to_system[0] to list every key in newSettings, not just what changed this merge", () => {
      const result = buildProjectSettings(
        { layer_height: "0.2", seam_position: "nearest", different_settings_to_system: ["existing_key", "", ""] },
        {},
        null,
        new Set(),
        new Set(),
        new Set(),
        [],
      );
      // Nothing transferred (nothing flagged as customized) -- but every
      // key that's actually IN newSettings still gets listed, so Orca
      // never falls back to a system preset for any of them.
      expect(result.newSettings.different_settings_to_system).toEqual(["layer_height;seam_position", "", ""]);
    });

    it("preserves padding slots after the first element", () => {
      const result = buildProjectSettings(
        { layer_height: "0.2", different_settings_to_system: ["x", "pad1", "pad2"] },
        {},
        null,
        new Set(),
        new Set(),
        new Set(),
        [],
      );
      expect(result.newSettings.different_settings_to_system).toEqual(["layer_height", "pad1", "pad2"]);
    });

    it("fills in a single-element list from an empty different_settings_to_system array", () => {
      const result = buildProjectSettings({ layer_height: "0.2", different_settings_to_system: [] }, {}, null, new Set(), new Set(), new Set(), []);
      expect(result.newSettings.different_settings_to_system).toEqual(["layer_height"]);
    });

    it("creates different_settings_to_system when the baseline never had it, so nothing falls back to Orca's preset", () => {
      const result = buildProjectSettings({ layer_height: "0.2" }, {}, null, new Set(), new Set(), new Set(), []);
      expect(result.newSettings.different_settings_to_system).toEqual(["layer_height", "", ""]);
    });
  });

  describe("minComparisonKeys (travel_speed / *_acceleration motion-safety keys)", () => {
    it("honors a lower Bambu value even when the creator never flagged it as customized", () => {
      const result = buildProjectSettings({ travel_speed: "500" }, { travel_speed: "400" }, null, new Set(), new Set(["travel_speed"]), new Set(), []);
      expect(result.newSettings.travel_speed).toBe("400");
      expect(result.changedKeys).toEqual([["travel_speed", "500", "400"]]);
    });

    it("ignores a higher Bambu value even when the creator explicitly flagged it as customized", () => {
      const result = buildProjectSettings(
        { travel_speed: "500", different_settings_to_system: ["travel_speed", ""] },
        { travel_speed: "600", different_settings_to_system: ["travel_speed", ""] },
        null,
        new Set(),
        new Set(["travel_speed"]),
        new Set(),
        [],
      );
      expect(result.newSettings.travel_speed).toBe("500");
      expect(result.changedKeys).toEqual([]);
    });

    it("blocklist still wins over a lower min-comparison value", () => {
      const result = buildProjectSettings(
        { travel_speed: "500" },
        { travel_speed: "400" },
        null,
        new Set(["travel_speed"]),
        new Set(["travel_speed"]),
        new Set(),
        [],
      );
      expect(result.newSettings.travel_speed).toBe("500");
    });

    it("compares percentage values numerically, ignoring the '%' suffix", () => {
      const result = buildProjectSettings(
        { sparse_infill_acceleration: "100%" },
        { sparse_infill_acceleration: "50%" },
        null,
        new Set(),
        new Set(["sparse_infill_acceleration"]),
        new Set(),
        [],
      );
      expect(result.newSettings.sparse_infill_acceleration).toBe("50%");
    });

    it("ignores a Bambu '0' -- Bambu's sentinel for 'not overridden, use default', not a genuinely lower value", () => {
      const result = buildProjectSettings(
        { inner_wall_acceleration: "10000" },
        { inner_wall_acceleration: "0" },
        null,
        new Set(),
        new Set(["inner_wall_acceleration"]),
        new Set(),
        [],
      );
      expect(result.newSettings.inner_wall_acceleration).toBe("10000");
      expect(result.changedKeys).toEqual([]);
    });
  });

  describe("alwaysTransferKeys (print_sequence, layout-coupled)", () => {
    it("always tracks Bambu's value, even when the creator never flagged it as customized", () => {
      const result = buildProjectSettings(
        { print_sequence: "by object" },
        { print_sequence: "by layer" },
        null,
        new Set(),
        new Set(),
        new Set(["print_sequence"]),
        [],
      );
      expect(result.newSettings.print_sequence).toBe("by layer");
      expect(result.changedKeys).toEqual([["print_sequence", "by object", "by layer"]]);
    });

    it("blocklist still wins over alwaysTransferKeys", () => {
      const result = buildProjectSettings(
        { print_sequence: "by object" },
        { print_sequence: "by layer" },
        null,
        new Set(["print_sequence"]),
        new Set(),
        new Set(["print_sequence"]),
        [],
      );
      expect(result.newSettings.print_sequence).toBe("by object");
    });

    it("also covers initial_layer_print_height -- a custom Bambu preset's own baked-in value that Bambu never flags as customized", () => {
      const result = buildProjectSettings(
        { initial_layer_print_height: "0.25" },
        { initial_layer_print_height: "0.2" },
        null,
        new Set(),
        new Set(),
        new Set(["initial_layer_print_height"]),
        [],
      );
      expect(result.newSettings.initial_layer_print_height).toBe("0.2");
    });
  });
});

describe("buildProjectSettings (real template fixtures)", () => {
  it("keeps the real U1 template's blocklisted hardware keys even when a Bambu source disagrees and flags them", () => {
    const baseline = loadRealBaseline();
    const blocklist = new Set(["printable_height", "nozzle_type", "nozzle_volume"]);
    const bambuSettings = {
      printable_height: "250",
      nozzle_type: "hardened_steel",
      nozzle_volume: "107",
      different_settings_to_system: ["printable_height;nozzle_type;nozzle_volume", ""],
    };
    const result = buildProjectSettings(baseline, bambuSettings, null, blocklist, new Set(), new Set(), []);

    expect(result.newSettings.printable_height).toBe(baseline.printable_height);
    expect(result.newSettings.nozzle_type).toBe(baseline.nozzle_type);
    expect(result.newSettings.nozzle_volume).toBe(baseline.nozzle_volume);
    expect(result.changedKeys).toEqual([]);
  });

  it("transfers a non-blocklisted print-quality key from a real-shaped Bambu source when flagged as customized", () => {
    const baseline = loadRealBaseline();
    expect(baseline.seam_position).toBeDefined();
    const bambuSettings = { seam_position: "aligned", different_settings_to_system: ["seam_position", ""] };
    const result = buildProjectSettings(baseline, bambuSettings, null, new Set(), new Set(), new Set(), []);
    expect(result.newSettings.seam_position).toBe("aligned");
  });

  it("keeps the real U1 template's own seam_position when Bambu's source has it but never flagged it as customized", () => {
    const baseline = loadRealBaseline();
    const bambuSettings = { seam_position: "aligned" }; // no different_settings_to_system flag
    const result = buildProjectSettings(baseline, bambuSettings, null, new Set(), new Set(), new Set(), []);
    expect(result.newSettings.seam_position).toBe(baseline.seam_position);
  });
});

describe("buildProjectSettings -- empty different_settings_to_system warning", () => {
  it("warns when different_settings_to_system is absent entirely", () => {
    const warnings: string[] = [];
    buildProjectSettings({ layer_height: "0.2" }, { layer_height: "0.28" }, null, new Set(), new Set(), new Set(), warnings);
    expect(warnings.some((w) => w.includes("WARN") && w.includes("No changed print settings were marked"))).toBe(true);
  });

  it("warns when different_settings_to_system is present but empty -- the confirmed real Anycubic printer-switch case", () => {
    const warnings: string[] = [];
    buildProjectSettings(
      { layer_height: "0.2" },
      { layer_height: "0.28", different_settings_to_system: ["", ""] },
      null,
      new Set(),
      new Set(),
      new Set(),
      warnings,
    );
    expect(warnings.some((w) => w.includes("WARN") && w.includes("No changed print settings were marked"))).toBe(true);
  });

  it("does not warn when at least one setting was genuinely flagged as customized", () => {
    const warnings: string[] = [];
    buildProjectSettings(
      { layer_height: "0.2", different_settings_to_system: ["layer_height", ""] },
      { layer_height: "0.28", different_settings_to_system: ["layer_height", ""] },
      null,
      new Set(),
      new Set(),
      new Set(),
      warnings,
    );
    expect(warnings.some((w) => w.includes("No changed print settings were marked"))).toBe(false);
  });
});
