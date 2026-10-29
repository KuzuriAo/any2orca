// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { bedCenter, parseBedCorners } from "./bedCenter.js";

describe("parseBedCorners / bedCenter", () => {
  it("computes bounds and centroid of a rectangular bed", () => {
    const corners = ["0x0", "270x0", "270x271", "0x271"];
    const result = parseBedCorners(corners);
    expect(result).toEqual({ minX: 0, maxX: 270, minY: 0, maxY: 271, centerX: 135, centerY: 135.5 });
    expect(bedCenter(corners)).toEqual([135, 135.5]);
  });

  it("handles an off-origin bed", () => {
    expect(bedCenter(["100x100", "200x100", "200x200", "100x200"])).toEqual([150, 150]);
  });
});
