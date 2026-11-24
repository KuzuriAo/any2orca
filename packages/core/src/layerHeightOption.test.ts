// SPDX-License-Identifier: MIT
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "./errors.js";
import { convert, inspect } from "./index.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const FIXTURE = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";
const RANGES_PATH = "Metadata/layer_config_ranges.xml";
const PROFILES_PATH = "Metadata/layer_heights_profile.txt";
const SETTINGS_PATH = "Metadata/model_settings.config";
const RANGES = '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="3">\n  <range min_z="5" max_z="10">\n   <option opt_key="extruder">2</option>\n   <option opt_key="layer_height">0.1</option>\n  </range>\n </object>\n</objects>\n';

/** The shared fixture with a height range that sets 0.1 mm layers, variable layer heights on its first object, and an object's own layer height. */
function withOwnLayers(): Uint8Array {
  const entries = unzipSync(readFixture(FIXTURE));
  entries[RANGES_PATH] = strToU8(RANGES);
  const first = /<object id="(\d+)">/.exec(strFromU8(entries[SETTINGS_PATH]!))![1]!;
  entries[PROFILES_PATH] = strToU8(`layer_heights_profile_format_version=2\nobject_id=${first}|0;0.2;0.2;0.2;1;0.1\n`);
  entries[SETTINGS_PATH] = strToU8(strFromU8(entries[SETTINGS_PATH]!).replace(/(<object id="\d+">\n)/, '$1    <metadata key="layer_height" value="0.28"/>\n'));
  return zipSync(entries);
}
const settingsOf = (output: Uint8Array) => JSON.parse(strFromU8(unzipSync(output)["Metadata/project_settings.config"]!)) as Record<string, unknown>;

describe("the layerHeight option", () => {
  it("sets one layer height for the whole project: the profile's, with the creator's own layers taken out", async () => {
    const { output, report } = await convert(withOwnLayers(), { profiles: testProfileSource(), nozzle: "0.6", layerHeight: 0.18 });
    const entries = unzipSync(output);
    expect(settingsOf(output).layer_height).toBe("0.18");
    expect(settingsOf(output).print_settings_id).toBe("0.18mm Standard @Snapmaker U1 (0.6 nozzle)");
    expect(entries[PROFILES_PATH]).toBeUndefined();
    expect(strFromU8(entries[RANGES_PATH]!)).not.toContain('opt_key="layer_height"');
    expect(strFromU8(entries[RANGES_PATH]!)).toContain('opt_key="extruder"');
    expect(strFromU8(entries[SETTINGS_PATH]!)).not.toContain('key="layer_height"');
    expect(report.notes).toContainEqual({
      topic: "layers",
      text: "Every layer is 0.18 mm, as you chose. The creator's variable layer heights (layers that change height along an object), layer heights set for ranges of an object's height and layer heights set on objects were replaced.",
    });
    // Nothing is left outside what the nozzle supports, so no note says so, and the plates' layers follow.
    expect(report.notes.some((n) => n.text.startsWith("The project has layers as"))).toBe(false);
    expect(report.plateFilaments!.every((p) => p.layerHeights === undefined || (p.layerHeights.thinnest === 0.18 && p.layerHeights.thickest === 0.18))).toBe(true);
    // What the nozzle supports, for comparing with each plate's layers.
    expect(report.layerLimits).toEqual({ min: 0.12, max: 0.42 });
    // Reading the converted file gives the same layers.
    expect(inspect(output).layerHeight).toBe(0.18);
  });

  it("leaves the creator's layers, with a note, when it isn't set", async () => {
    const { output, report } = await convert(withOwnLayers(), { profiles: testProfileSource(), nozzle: "0.6" });
    expect(unzipSync(output)[PROFILES_PATH]).toBeDefined();
    expect(report.notes.some((n) => n.topic === "layers" && n.text.startsWith("The project has layers as thin as 0.1 mm,"))).toBe(true);
    expect(report.notes.some((n) => n.text.startsWith("Every layer is"))).toBe(false);
  });

  it("says a project with none of the creator's own layers had none to replace", async () => {
    const { report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), nozzle: "0.6", layerHeight: 0.24 });
    expect(settingsOf((await convert(readFixture(FIXTURE), { profiles: testProfileSource(), nozzle: "0.6", layerHeight: 0.24 })).output).layer_height).toBe("0.24");
    expect(report.notes).toContainEqual({ topic: "layers", text: "Every layer is 0.24 mm, as you chose." });
  });

  it("refuses a height no profile of the nozzle has, naming the ones that do", async () => {
    const error = await convert(readFixture(FIXTURE), { profiles: testProfileSource(), nozzle: "0.6", layerHeight: 0.15 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Any2orcaError);
    expect((error as Any2orcaError).code).toBe("profile_not_found");
    expect((error as Error).message).toBe("There is no U1 profile with a 0.15 mm layer height for a 0.6 mm nozzle; its profiles have 0.18, 0.24, 0.3 mm.");
  });

  it("refuses what isn't a layer height, and a profile or preset it would contradict", async () => {
    for (const layerHeight of [0, -0.2, 11, Number.NaN, Number.POSITIVE_INFINITY, "0.2" as unknown as number]) {
      await expect(convert(readFixture(FIXTURE), { profiles: testProfileSource(), layerHeight })).rejects.toThrow(TypeError);
    }
    await expect(convert(readFixture(FIXTURE), { profiles: testProfileSource(), layerHeight: 0.2, profileId: "snapmaker-u1-0.4-standard" })).rejects.toThrow("can't be combined with `profileId` or `preset`");
  });
});

describe("the layerHeight option's record", () => {
  it("is in the output's stamp only when it was chosen", async () => {
    const { decodeStamp, STAMP_PATH } = await import("./stamp.js");
    const chosen = decodeStamp(unzipSync((await convert(readFixture(FIXTURE), { profiles: testProfileSource(), nozzle: "0.6", layerHeight: 0.24 })).output)[STAMP_PATH]!);
    expect(chosen?.options.layerHeight).toBe(0.24);
    const kept = decodeStamp(unzipSync((await convert(readFixture(FIXTURE), { profiles: testProfileSource(), nozzle: "0.6" })).output)[STAMP_PATH]!);
    expect(kept?.options).not.toHaveProperty("layerHeight");
  });
});
