// SPDX-License-Identifier: MIT
// A project with an empty plate before a used one: the empty plate keeps its number and its place on the grid, each
// later plate's objects land on their own plate (not the one before it), and the report says which plate is empty.
// A real MakerWorld project showed the fault in Snapmaker Orca: plates 1, 3 and 4 used, opened as 1, 2 and 3.
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, inspect } from "./index.js";
import { testProfileSource } from "./test-helpers.js";

const fixture = (path: string) => new URL(`./test-fixtures/${path}`, import.meta.url);
const enc = new TextEncoder();

/** The U1's 270 mm bed is 0.5 to 270.5 mm, and Snapmaker Orca's plate pitch is 1.2 beds. */
const PITCH = 270 * 1.2;
function cellOf(x: number, y: number, cols: number): number {
  const col = Math.floor((x - 0.5 + PITCH * 0.1) / PITCH);
  const row = Math.floor((-(y - 0.5) + PITCH * 0.9) / PITCH);
  return row * cols + col + 1;
}
/** Which grid cell (plate number) each object's position falls in, in a converted file. */
function cellsOf(output: Uint8Array, cols: number): Record<string, number> {
  const model = strFromU8(unzipSync(output)["3D/3dmodel.model"]!);
  const out: Record<string, number> = {};
  for (const item of model.match(/<item [^>]*>/g) ?? []) {
    const id = /objectid="(\d+)"/.exec(item)![1]!;
    const t = /transform="([^"]+)"/.exec(item)![1]!.split(" ").map(Number);
    out[id] = cellOf(t[9]!, t[10]!, cols);
  }
  return out;
}
function plateObjects(output: Uint8Array): Record<number, string[]> {
  const settings = strFromU8(unzipSync(output)["Metadata/model_settings.config"]!);
  const out: Record<number, string[]> = {};
  [...settings.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].forEach(([, body], i) => (out[i + 1] = [...body!.matchAll(/object_id" value="(\d+)"/g)].map((m) => m[1]!)));
  return out;
}

describe("a project with an empty plate before a used one", () => {
  it("Bambu Studio family: the demo's second plate moved to plate 3, with an empty plate 2 between", async () => {
    const entries = unzipSync(new Uint8Array(readFileSync(fixture("synthetic-demo.3mf"))));
    const settings = strFromU8(entries["Metadata/model_settings.config"]!);
    const second = settings.indexOf("  <plate>", settings.indexOf("</plate>"));
    const empty = '  <plate>\n    <metadata key="plater_id" value="2"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n  </plate>\n';
    entries["Metadata/model_settings.config"] = enc.encode(settings.slice(0, second) + empty + settings.slice(second).replace('key="plater_id" value="2"', 'key="plater_id" value="3"'));
    const bytes = zipSync(entries);

    expect(inspect(bytes)).toMatchObject({ plates: [1, 3], plateCount: 3 });
    const { output, report } = await convert(bytes, { profiles: testProfileSource() });
    expect(report.plates).toBe(3);
    expect(report.plateOrigins).toEqual({ 1: [0, 0], 2: [324, 0], 3: [0, -324] });
    expect(report.warnings).toContain("plate 2 has no objects in the project; it stays empty, so the other plates keep their numbers");
    // Three plates in two columns: object 3 belongs on plate 3 (column 0, row 1), not on plate 2's cell.
    expect(plateObjects(output)).toEqual({ 1: ["1", "2"], 2: [], 3: ["3"] });
    expect(cellsOf(output, 2)).toEqual({ 1: 1, 2: 1, 3: 3 });
  });

  it("PrusaSlicer: the four-bed project with its second bed emptied (the cylinder moved to bed 4)", async () => {
    const entries = unzipSync(new Uint8Array(readFileSync(fixture("prusaslicer/prusaslicer-2.9.7-beds-pauses.3mf"))));
    const model = strFromU8(entries["3D/3dmodel.model"]!);
    // Bed 4 is the one at (460, 460) on the XL's grid; (540, 540) is on it, clear of the box.
    const moved = model.replace(/(<item objectid="2" transform="(?:\S+ ){9})\S+ \S+/, "$1540 540");
    expect(moved).not.toBe(model);
    entries["3D/3dmodel.model"] = enc.encode(moved);
    const { output, report } = await convert(zipSync(entries), { profiles: testProfileSource() });

    expect(report.plates).toBe(4);
    expect(report.warnings).toContainEqual(expect.stringContaining("the project's 4 beds become 4 plates"));
    expect(report.warnings).toContain("plate 2 has no objects in the project; it stays empty, so the other plates keep their numbers");
    expect(plateObjects(output)).toEqual({ 1: ["1"], 2: [], 3: ["3"], 4: ["2", "4"] });
    expect(cellsOf(output, 2)).toEqual({ 1: 1, 3: 3, 2: 4, 4: 4 });
    // Bed 2's pause stays on plate 2, which is empty, so it acts on nothing; bed 4's stays with bed 4's objects.
    const gcodes = strFromU8(unzipSync(output)["Metadata/custom_gcode_per_layer.xml"]!);
    expect([...gcodes.matchAll(/<plate_info id="(\d+)"\/>/g)].map((m) => m[1])).toEqual(["1", "2", "4"]);
  });
});
