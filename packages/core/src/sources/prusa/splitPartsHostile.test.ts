// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { PrusaObject } from "./modelConfig.js";
import { splitMultiPartObjects } from "./splitParts.js";

const volume = (first: number, last: number, extruder: number) => ({ firstTriangle: first, lastTriangle: last, volumeType: "ModelPart", extruder, name: `part ${extruder}`, settings: new Map<string, string>() });
const twoParts = (id: number): PrusaObject => ({ id, name: `o${id}`, extruder: 0, volumes: [volume(0, 0, 1), volume(1, 1, 2)], settings: new Map() });
const mesh = (id: number) =>
  `<object id="${id}" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="1" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2" paint_color="4"/><triangle v1="1" v2="3" v3="2"/></triangles></mesh></object>`;

describe("splitMultiPartObjects", () => {
  it("writes each part as its own mesh object with the vertices it uses, renumbered, and the object as their components", () => {
    const { text, parts } = splitMultiPartObjects(`<resources>${mesh(1)}</resources>`, [twoParts(1)], []);
    expect(text).toBe(
      [
        '<resources><object id="2" type="model">',
        "   <mesh>",
        "    <vertices>",
        '     <vertex x="0" y="0" z="0"/>',
        '     <vertex x="1" y="0" z="0"/>',
        '     <vertex x="0" y="1" z="0"/>',
        "    </vertices>",
        "    <triangles>",
        '     <triangle v1="0" v2="1" v3="2" paint_color="4"/>',
        "    </triangles>",
        "   </mesh>",
        "  </object>",
        '  <object id="3" type="model">',
        "   <mesh>",
        "    <vertices>",
        '     <vertex x="1" y="0" z="0"/>',
        '     <vertex x="1" y="1" z="0"/>',
        '     <vertex x="0" y="1" z="0"/>',
        "    </vertices>",
        "    <triangles>",
        '     <triangle v1="0" v2="1" v3="2"/>',
        "    </triangles>",
        "   </mesh>",
        "  </object>",
        '  <object id="1" type="model">',
        "   <components>",
        '    <component objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>',
        '    <component objectid="3" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>',
        "   </components>",
        "  </object></resources>",
      ].join("\n"),
    );
    expect([...parts.get(1)!].map((p) => p.id)).toEqual([2, 3]);
  });

  it("splits an object the config lists twice once, as if it were listed once", () => {
    const once = splitMultiPartObjects(mesh(1), [twoParts(1)], []);
    const twice = splitMultiPartObjects(mesh(1), [twoParts(1), twoParts(1)], []);
    expect(twice.text).toBe(once.text);
    expect(twice.parts).toEqual(once.parts);
  });

  it("an object that never closes before the next one begins: the first one listed keeps the shared stretch", () => {
    const text = `${mesh(1).replace("</object>", "")}${mesh(2)}`;
    const { parts } = splitMultiPartObjects(text, [twoParts(2), twoParts(1)], []);
    expect([...parts.keys()]).toEqual([2]);
  });

  it("leaves a mesh whose triangle names a vertex past the last one, and says so", () => {
    const warnings: string[] = [];
    const bad = mesh(1).replace('v3="2" paint', 'v3="99999999999999999999" paint');
    const { text, parts } = splitMultiPartObjects(bad, [twoParts(1)], warnings);
    expect(text).toBe(bad);
    expect(parts.size).toBe(0);
    expect(warnings).toEqual(['  WARN: "o1" has 2 parts whose mesh couldn\'t be split, so it\'s converted as one part on its own filament.']);
  });
});

// Each input took seconds with the code these tests hold linear; the bound keeps it that way.
describe("splitMultiPartObjects on large and crafted models", () => {
  it("400 multi-part objects in a 24 MB model", () => {
    const filler = `<!--${"f".repeat(60_000)}-->`;
    const ids = Array.from({ length: 400 }, (_, i) => i + 1);
    const text = ids.map((id) => `${mesh(id)}${filler}`).join("");
    const started = performance.now();
    const { parts } = splitMultiPartObjects(text, ids.map(twoParts), []);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(parts.size).toBe(400);
  });

  it("40,000 vertex tags that never end, inside one multi-part object", () => {
    const warnings: string[] = [];
    const started = performance.now();
    splitMultiPartObjects(`<object id="1" type="model">${"<vertex ".repeat(40_000)}</object>`, [twoParts(1)], warnings);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(warnings).toHaveLength(1);
  });
});
