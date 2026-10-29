// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseHighFlowToolheads } from "./main.js";

describe("parseHighFlowToolheads", () => {
  it("maps toolhead numbers 1 to 4 onto one entry per toolhead", () => {
    expect(parseHighFlowToolheads("1")).toEqual([true, false, false, false]);
    expect(parseHighFlowToolheads("1,3")).toEqual([true, false, true, false]);
    expect(parseHighFlowToolheads(" 4 , 2 ")).toEqual([false, true, false, true]);
    expect(parseHighFlowToolheads("1,2,3,4")).toEqual([true, true, true, true]);
  });

  for (const bad of ["", "0", "5", "1,", ",1", "1,,2", "1,1", "a", "1.5", "-1", "12", "1;2", "1,2,3,4,5"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(() => parseHighFlowToolheads(bad)).toThrow(/--high-flow-toolheads/);
    });
  }

  it("rejects an overlong value without echoing it back", () => {
    expect(() => parseHighFlowToolheads("1,".repeat(40))).toThrow(/too long/);
  });
});
