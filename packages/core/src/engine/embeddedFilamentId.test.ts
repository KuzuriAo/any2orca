// SPDX-License-Identifier: MIT
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { tolerantJsonParse } from "../archive/tolerantJsonParse.js";
import { convert } from "../project.js";
import { readFixture, testProfileSource } from "../test-helpers.js";

describe("embedded filament presets", () => {
  it("carry the slot's own filament id, never the template's Snapmaker PLA id", async () => {
    const { output } = await convert(readFixture("synthetic-2plate.3mf"), { profiles: testProfileSource(), stamp: false });
    const entries = unzipSync(output);
    const settings = tolerantJsonParse(new TextDecoder().decode(entries["Metadata/project_settings.config"])).value as Record<string, unknown>;
    const ids = (settings.filament_ids ?? []) as unknown[];
    const embedded = Object.keys(entries).filter((n) => /^Metadata\/filament_settings_\d+\.config$/.test(n));
    expect(embedded.length).toBeGreaterThan(0);
    for (const name of embedded) {
      const cfg = JSON.parse(new TextDecoder().decode(entries[name])) as Record<string, unknown>;
      expect(cfg.filament_id).not.toBe("141703112701");
      if (cfg.filament_id !== undefined) expect(ids).toContain(cfg.filament_id);
    }
  });
});
