// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { recenterAssembleItems } from "./recenterAssembleItems.js";
import { recenterBuildItems } from "./recenterBuildItems.js";

describe("a transform token that isn't a number", () => {
  it("leaves the item's placement as written and says so, instead of writing NaN", () => {
    const tag = '<item objectid="7" transform="1 0 0 0 1 0 0 0 1 abc 1e999 0"/>';
    const warnings: string[] = [];
    const out = recenterBuildItems(`<build>${tag}</build>`, { 7: [5, 5] }, warnings);
    expect(out).toBe(`<build>${tag}</build>`);
    expect(out).not.toMatch(/NaN|Infinity/);
    expect(warnings).toEqual(["  WARN: object 7's transform holds a value that isn't a number, so its placement is left as it is."]);
  });

  it("the same for an assemble item", () => {
    const tag = '<assemble_item object_id="7" instance_id="0" transform="1 0 0 0 1 0 0 0 1 x 0 0"/>';
    const warnings: string[] = [];
    const out = recenterAssembleItems(`<assemble>${tag}</assemble>`, { 7: [5, 5] }, warnings);
    expect(out).toBe(`<assemble>${tag}</assemble>`);
    expect(warnings).toEqual(["  WARN: object 7's assemble transform holds a value that isn't a number, so its placement is left as it is."]);
  });

  it("an ordinary item still moves", () => {
    const warnings: string[] = [];
    const out = recenterBuildItems('<build><item objectid="7" transform="1 0 0 0 1 0 0 0 1 10 20 0"/></build>', { 7: [5, -5] }, warnings);
    expect(out).toContain('transform="1 0 0 0 1 0 0 0 1 15 15 0"');
    expect(warnings).toEqual(["  Recentered 1 object placement(s) in 3D/3dmodel.model."]);
  });
});
