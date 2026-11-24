// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { flattenedNote, flattenLayers } from "./flattenLayers.js";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);
const RANGES = '<?xml version="1.0"?>\n<objects>\n <object id="3">\n  <range min_z="5" max_z="10">\n   <option opt_key="extruder">2</option>\n   <option opt_key="layer_height">0.1</option>\n  </range>\n </object>\n</objects>\n';
const SETTINGS = '<config>\n  <object id="2">\n    <metadata key="name" value="Cow"/>\n    <metadata key="layer_height" value="0.28"/>\n  </object>\n</config>\n';
const PROFILE = "object_id=1|0;0.2;0.2;0.2;1.8;0.12\n";

describe("flattening a project's layer heights", () => {
  it("takes out variable layer heights, a range's layer height and an object's own, leaving the rest", () => {
    const entries = { "Metadata/layer_heights_profile.txt": bytes(PROFILE), "Metadata/layer_config_ranges.xml": bytes(RANGES), "Metadata/model_settings.config": bytes(SETTINGS), "3D/3dmodel.model": bytes("model") };
    const { entries: out, removed } = flattenLayers(entries);
    expect(removed).toEqual(["variable", "range", "object"]);
    expect(out["Metadata/layer_heights_profile.txt"]).toBeUndefined();
    expect(text(out["Metadata/layer_config_ranges.xml"])).toBe(RANGES.replace('   <option opt_key="layer_height">0.1</option>\n', ""));
    expect(text(out["Metadata/model_settings.config"])).toBe(SETTINGS.replace('    <metadata key="layer_height" value="0.28"/>\n', ""));
    expect(out["3D/3dmodel.model"]).toBe(entries["3D/3dmodel.model"]);
    // The archive it was given is left as it was.
    expect(text(entries["Metadata/layer_config_ranges.xml"])).toBe(RANGES);
  });

  it("returns the entries it was given when the project holds none of them", () => {
    const entries = { "Metadata/model_settings.config": bytes('<config><object id="2"><metadata key="name" value="Cow"/></object></config>'), "Metadata/layer_heights_profile.txt": bytes("layer_heights_profile_format_version=2\n") };
    const result = flattenLayers(entries);
    expect(result.removed).toEqual([]);
    expect(result.entries).toBe(entries);
  });

  it("leaves a settings file too large to read as it is", () => {
    const big = new Uint8Array(16 * 1024 * 1024 + 1);
    expect(flattenLayers({ "Metadata/layer_config_ranges.xml": big }).removed).toEqual([]);
  });

  it("says what it replaced", () => {
    expect(flattenedNote(0.18, ["variable", "object"])).toBe("Every layer is 0.18 mm, as you chose. The creator's variable layer heights and layer heights set on objects were replaced.");
    expect(flattenedNote(0.2, ["variable", "range", "object"])).toBe("Every layer is 0.2 mm, as you chose. The creator's variable layer heights, layer heights set for ranges of an object's height and layer heights set on objects were replaced.");
    expect(flattenedNote(0.2, [])).toBe("Every layer is 0.2 mm, as you chose.");
  });
});
