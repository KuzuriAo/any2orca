// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { hasPaintAttribute, scanMeshPaint, type MeshPaint, type PaintRequest } from "./meshPaint.js";

const encoder = new TextEncoder();

/** A model file with the given mesh objects: each a square pillar's four corners at z 0 and `top`, two triangles per `paint` entry. */
function modelFile(objects: Array<{ id: string; top: number; paint: Array<string | null> }>): Uint8Array {
  const blocks = objects.map(
    ({ id, top, paint }) =>
      `  <object id="${id}" type="model">\n   <mesh>\n    <vertices>\n` +
      `     <vertex x="0" y="0" z="0"/>\n     <vertex x="10" y="0" z="0"/>\n     <vertex x="10" y="0" z="${top}"/>\n     <vertex x="0" y="0" z="${top}"/>\n` +
      `    </vertices>\n    <triangles>\n` +
      paint.map((code, i) => `     <triangle v1="0" v2="${i % 2 === 0 ? 1 : 2}" v3="${i % 2 === 0 ? 2 : 3}"${code === null ? "" : ` paint_color="${code}"`}/>\n`).join("") +
      `    </triangles>\n   </mesh>\n  </object>\n`,
  );
  return encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<model>\n <resources>\n${blocks.join("")} </resources>\n</model>\n`);
}

function request(lift = 0): PaintRequest {
  const result: MeshPaint = { painted: new Map(), unpainted: false, triangles: 0 };
  return { zOf: (_x, _y, z) => z + lift, result };
}

describe("a mesh's paint", () => {
  it("finds each painted filament with the heights it is painted between", () => {
    const wanted = request();
    expect(scanMeshPaint(modelFile([{ id: "7", top: 20, paint: ["4", "0C"] }]), new Map([["7", [wanted]]]), 16)).toBe(true);
    expect(wanted.result.triangles).toBe(2);
    expect(wanted.result.unpainted).toBe(false);
    expect([...wanted.result.painted]).toEqual([
      [1, [0, 20]],
      [3, [0, 20]],
    ]);
  });

  it("says a mesh with a triangle left unpainted shows its own filament", () => {
    const wanted = request();
    scanMeshPaint(modelFile([{ id: "7", top: 20, paint: ["8", null] }]), new Map([["7", [wanted]]]), 16);
    expect(wanted.result.unpainted).toBe(true);
    expect([...wanted.result.painted.keys()]).toEqual([2]);
  });

  it("counts a filament the project doesn't have, and a value that doesn't decode, as no paint", () => {
    const wanted = request();
    scanMeshPaint(modelFile([{ id: "7", top: 20, paint: ["EC", "Z9"] }]), new Map([["7", [wanted]]]), 4);
    expect(wanted.result.unpainted).toBe(true);
    expect(wanted.result.painted.size).toBe(0);
  });

  it("reads only the meshes asked for, each placed where its request says", () => {
    const low = request();
    const lifted = request(100);
    const file = modelFile([
      { id: "1", top: 5, paint: ["4", "4"] },
      { id: "2", top: 8, paint: ["8", "8"] },
      { id: "3", top: 9, paint: ["0C", "0C"] },
    ]);
    scanMeshPaint(file, new Map([["2", [low, lifted]]]), 16);
    expect([...low.result.painted]).toEqual([[2, [0, 8]]]);
    expect([...lifted.result.painted]).toEqual([[2, [100, 108]]]);
  });

  it("reads the same whatever the chunk size, a tag cut at any byte", () => {
    const file = modelFile([
      { id: "11", top: 20, paint: ["4882", null, "1C0C2C0C1C13"] },
      { id: "12", top: 7, paint: ["0FC"] },
    ]);
    const read = (chunk: number) => {
      const a = request();
      const b = request();
      expect(scanMeshPaint(file, new Map([["11", [a]], ["12", [b]]]), 32, chunk)).toBe(true);
      return [a.result, b.result].map((r) => ({ painted: [...r.painted], unpainted: r.unpainted, triangles: r.triangles }));
    };
    const whole = read(1 << 20);
    expect(whole[0]!.triangles).toBe(3);
    expect(whole[1]!.painted).toEqual([[18, [0, 7]]]);
    for (const chunk of [1, 7, 64, 100, 257]) expect(read(chunk), `chunk ${chunk}`).toEqual(whole);
  });

  it("reports nothing for a mesh the file doesn't hold", () => {
    const wanted = request();
    scanMeshPaint(modelFile([{ id: "1", top: 5, paint: ["4"] }]), new Map([["99", [wanted]]]), 16);
    expect(wanted.result.triangles).toBe(0);
  });

  it("gives up on a tag that never ends, and says so", () => {
    const wanted = request();
    const file = encoder.encode(`<model><object id="1"><triangle v1="0" v2="1" v3="2" paint_color="${"4".repeat(20_000)}`);
    expect(scanMeshPaint(file, new Map([["1", [wanted]]]), 16, 1024)).toBe(false);
    expect(wanted.result.unpainted).toBe(true);
  });

  it("tells a file with paint from one without before scanning it", () => {
    expect(hasPaintAttribute(modelFile([{ id: "1", top: 5, paint: ["4"] }]))).toBe(true);
    expect(hasPaintAttribute(modelFile([{ id: "1", top: 5, paint: [null] }]))).toBe(false);
    expect(hasPaintAttribute(encoder.encode('paint_color=" at the very end is still found: paint_color="'))).toBe(true);
    expect(hasPaintAttribute(encoder.encode("paint_colo"))).toBe(false);
    expect(hasPaintAttribute(new Uint8Array())).toBe(false);
  });
});
