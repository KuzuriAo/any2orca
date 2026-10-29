// SPDX-License-Identifier: MIT
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { tolerantJsonParse } from "./archive/tolerantJsonParse.js";
import { ProfileFileSchema, ProfileIndexSchema } from "./profiles.js";
import { inspect } from "./project.js";
import { readCatalogJson, readFixture } from "./test-helpers.js";

const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

describe("inspection strings", () => {
  it("carry no control or direction-override characters from the file", async () => {
    const entries = unzipSync(readFixture("synthetic-2plate.3mf"));
    const settings = tolerantJsonParse(new TextDecoder().decode(entries["Metadata/project_settings.config"])).value as Record<string, unknown>;
    settings.printer_model = "X1C\u001b]52;c;ZXZpbA==\u0007";
    settings.print_settings_id = "0.20mm Standard ‮@BBL X1C";
    settings.filament_settings_id = ["Bambu PLA \u001b[2J", "Bambu PETG Basic"];
    entries["Metadata/project_settings.config"] = new TextEncoder().encode(JSON.stringify(settings));
    const inspection = await inspect(zipSync(entries));
    const strings = JSON.stringify(inspection, (_key, value) => value);
    expect(JSON.parse(strings, (_key, value) => {
      if (typeof value === "string") expect(value).not.toMatch(UNSAFE);
      return value;
    })).toBeDefined();
  });
});

describe("profile catalog text", () => {
  it("refuses control characters in display names", () => {
    const index = readCatalogJson("index.json") as { printers: { displayName: string }[] };
    index.printers[0].displayName = "U1\u001b[31m";
    expect(ProfileIndexSchema.safeParse(index).success).toBe(false);
  });

  it("refuses a negative or absurd extruder clearance radius", () => {
    for (const radius of [-1e300, -1, 1e9]) {
      const file = readCatalogJson("profiles/snapmaker-u1-0.4-standard.json") as { printer: { extruderClearanceRadius: number } };
      file.printer.extruderClearanceRadius = radius;
      expect(ProfileFileSchema.safeParse(file).success, String(radius)).toBe(false);
    }
  });
});
