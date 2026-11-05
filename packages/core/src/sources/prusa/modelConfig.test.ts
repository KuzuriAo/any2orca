// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parsePrusaModelConfig } from "./modelConfig.js";

const fixture = () => {
  const bytes = new Uint8Array(readFileSync(new URL("../../test-fixtures/prusaslicer/prusaslicer-2.9.6.3mf", import.meta.url)));
  return new TextDecoder().decode(unzipSync(bytes)["Metadata/Slic3r_PE_model.config"]);
};

describe("the PrusaSlicer model config", () => {
  it("reads the real 2.9.6 fixture: one object, one part, the default extruder", () => {
    const objects = parsePrusaModelConfig(fixture());
    expect(objects).toHaveLength(1);
    const [o] = objects;
    expect(o.id).toBe(1);
    expect(o.name).toBe("Shape-Box");
    expect(o.extruder).toBe(0);
    expect(o.settings.size).toBe(0);
    expect(o.volumes).toHaveLength(1);
    expect(o.volumes[0]).toMatchObject({ firstTriangle: 0, lastTriangle: 11, volumeType: "ModelPart", extruder: 0, name: "Shape-Box" });
    expect(o.volumes[0].settings.size).toBe(0);
  });

  it("keeps per-object and per-volume settings apart, reads modifiers and extruders, and decodes XML entities", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="7" instances_count="2">
  <metadata type="object" key="name" value="Tom &amp; Jerry &quot;v2&quot;"/>
  <metadata type="object" key="extruder" value="2"/>
  <metadata type="object" key="brim_width" value="5"/>
  <volume firstid="0" lastid="99">
   <metadata type="volume" key="name" value="body"/>
   <metadata type="volume" key="volume_type" value="ModelPart"/>
   <metadata type="volume" key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
   <metadata type="volume" key="extruder" value="3"/>
   <mesh edges_fixed="0"/>
  </volume>
  <volume firstid="100" lastid="131">
   <metadata type="volume" key="name" value="denser"/>
   <metadata type="volume" key="volume_type" value="ParameterModifier"/>
   <metadata type="volume" key="fill_density" value="80%"/>
   <metadata type="volume" key="extruder" value="0"/>
  </volume>
 </object>
 <object id="x"><metadata type="object" key="name" value="bad id"/></object>
</config>`;
    const objects = parsePrusaModelConfig(xml);
    expect(objects).toHaveLength(1);
    const [o] = objects;
    expect(o).toMatchObject({ id: 7, name: 'Tom & Jerry "v2"', extruder: 2 });
    expect([...o.settings]).toEqual([["brim_width", "5"]]);
    expect(o.volumes.map((v) => [v.name, v.volumeType, v.extruder, v.firstTriangle, v.lastTriangle])).toEqual([
      ["body", "ModelPart", 3, 0, 99],
      ["denser", "ParameterModifier", 0, 100, 131],
    ]);
    expect([...o.volumes[1].settings]).toEqual([["fill_density", "80%"]]);
    expect(o.volumes[0].settings.size).toBe(0);
  });

  it("reads a crafted config with hundreds of thousands of unclosed blocks in one pass, not minutes", () => {
    const started = Date.now();
    expect(parsePrusaModelConfig(`<config>${'<object id="1" instances_count="1">'.repeat(200_000)}</config>`)).toEqual([]);
    expect(parsePrusaModelConfig(`<config><object id="1">${'<volume firstid="0" lastid="1">'.repeat(200_000)}</object></config>`)).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("gives nothing for text that isn't the config", () => {
    expect(parsePrusaModelConfig("")).toEqual([]);
    expect(parsePrusaModelConfig("<config><object></object></config>")).toEqual([]);
    expect(parsePrusaModelConfig("<html><body>not xml at all")).toEqual([]);
  });
});
