// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parsePrusaModelConfig } from "./modelConfig.js";

const vol = (i: number, extra = "") => `<volume firstid="${i}" lastid="${i}"><metadata type="volume" key="name" value="v${i}"/>${extra}</volume>`;

describe("parsePrusaModelConfig: an object's own metadata, with its volumes cut out", () => {
  it("reads the object's keys before and after its volumes, and none of a volume's", () => {
    const xml = `<config><object id="1"><metadata type="object" key="name" value="Box"/>${vol(0, '<metadata type="object" key="extruder" value="9"/>')}${vol(1)}<metadata type="object" key="extruder" value="2"/></object></config>`;
    const [object] = parsePrusaModelConfig(xml);
    expect(object.name).toBe("Box");
    expect(object.extruder).toBe(2);
    expect(object.volumes.map((v) => v.name)).toEqual(["v0", "v1"]);
  });

  it("two volumes with the same body are both cut out", () => {
    const body = '<volume firstid="0" lastid="0"><metadata type="object" key="infill" value="from a volume"/></volume>';
    const [object] = parsePrusaModelConfig(`<config><object id="1">${body}${body.replace(/0/g, "1")}${body.replace(/0/g, "1")}</object></config>`);
    expect(object.settings.get("infill")).toBeUndefined();
    expect(object.volumes).toHaveLength(3);
  });

  it("a volume without its triangle range isn't cut out, as before", () => {
    const [object] = parsePrusaModelConfig('<config><object id="1"><volume><metadata type="object" key="name" value="Kept"/></volume></object></config>');
    expect(object.name).toBe("Kept");
    expect(object.volumes).toHaveLength(0);
  });

  it("10,000 volumes in one object, in linear time", () => {
    // The search for each volume's text took about seven seconds at this size.
    const pad = "x".repeat(400);
    const xml = `<config><object id="1">${Array.from({ length: 10_000 }, (_, i) => vol(i, `<mesh>${pad}</mesh>`)).join("")}</object></config>`;
    const started = performance.now();
    const [object] = parsePrusaModelConfig(xml);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(object.volumes).toHaveLength(10_000);
  });
});
