// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../project.js";
import { NEWEST_TEMPLATES_DIR, readFixture, testProfileSource } from "../test-helpers.js";
import { BLOCKLIST, U1_VALUE_KEYS } from "./policy.js";

const machineTemplateKeys = Object.keys(
  JSON.parse(readFileSync(join(NEWEST_TEMPLATES_DIR, "machine_settings_1.config"), "utf-8")),
);
const PROFILE = "snapmaker-u1-0.4-standard";

function absurd(key: string, value: unknown): unknown {
  const one = key.endsWith("_gcode") ? "M104 S999" : "999";
  return Array.isArray(value) ? value.map(() => one) : one;
}

async function convertedSettings(edit?: (settings: Record<string, unknown>) => void): Promise<Record<string, unknown>> {
  const entries = unzipSync(readFixture("synthetic-demo.3mf"));
  const source = JSON.parse(new TextDecoder().decode(entries["Metadata/project_settings.config"]));
  edit?.(source);
  entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
  const { output } = await convert(zipSync(entries), { profiles: testProfileSource(), profileId: PROFILE, stamp: false });
  return JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"]));
}

describe("the machine and U1-value gate, on the real catalog", () => {
  it("keeps Snapmaker's stock value for every printer setting, G-code and U1-value key, even when the source flags it as changed", async () => {
    const stock = await convertedSettings();
    const gated = [
      ...new Set([
        ...BLOCKLIST,
        ...U1_VALUE_KEYS,
        ...machineTemplateKeys,
        ...Object.keys(stock).filter((k) => k.endsWith("_gcode")),
      ]),
    ].filter((k) => k !== "different_settings_to_system" && Object.hasOwn(stock, k));
    expect(gated).toContain("machine_start_gcode");
    expect(gated).toContain("filament_start_gcode");
    expect(gated).toContain("filament_end_gcode");

    const tampered = await convertedSettings((source) => {
      for (const key of gated) source[key] = absurd(key, stock[key]);
      source.different_settings_to_system = [gated.join(";"), ""];
    });
    const leaked = gated.filter((k) => JSON.stringify(tampered[k]) !== JSON.stringify(stock[k]));
    expect(leaked).toEqual([]);
  });
});

describe("MACHINE_SETTINGS_KEYS", () => {
  it("is exactly the U1 machine preset's key set, plus `from`", async () => {
    const { MACHINE_SETTINGS_KEYS } = await import("./policy.js");
    expect([...MACHINE_SETTINGS_KEYS].sort()).toEqual([...machineTemplateKeys, "from"].sort());
  });
});

describe("filament settings flagged as changed", () => {
  it("don't produce a 'doesn't fit the U1's layout' warning, and keep the creator's values", async () => {
    const entries = unzipSync(readFixture("synthetic-demo.3mf"));
    const source = JSON.parse(new TextDecoder().decode(entries["Metadata/project_settings.config"]));
    const filamentKeys = Object.keys(source).filter((k) => k.startsWith("filament_") || k.startsWith("flush_volumes_"));
    source.different_settings_to_system = [filamentKeys.join(";"), ""];
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(source));
    const { output, report } = await convert(zipSync(entries), { profiles: testProfileSource(), profileId: PROFILE, stamp: false });
    expect(report.warnings.filter((w) => w.includes("don't fit"))).toEqual([]);
    const out = JSON.parse(new TextDecoder().decode(unzipSync(output)["Metadata/project_settings.config"]));
    expect(out.filament_colour).toEqual(source.filament_colour);
  });
});
