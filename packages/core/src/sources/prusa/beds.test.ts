// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { bedGap, bedGridCoords, bedIndexOf, bedTranslation, parseBedShape } from "./beds.js";

describe("PrusaSlicer's several beds", () => {
  it("walks the grid outward in rings, as PrusaSlicer numbers its beds", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(bedGridCoords)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it("spaces beds by the smaller of 100 mm and three tenths of the diagonal", () => {
    const xl = parseBedShape("0x0,360x0,360x360,0x360")!;
    expect(bedGap(xl)).toBe(100);
    expect(bedTranslation(1, xl)).toEqual([460, 0]);
    expect(bedTranslation(2, xl)).toEqual([0, 460]);
    const mk3 = parseBedShape("0x0,250x0,250x210,0x210")!;
    expect(bedGap(mk3)).toBeCloseTo(97.95, 2);
    expect(bedTranslation(3, mk3)[0]).toBeCloseTo(347.95, 2);
    expect(parseBedShape("")).toBeNull();
    expect(parseBedShape("0x0,250x0")).toBeNull();
    expect(parseBedShape("nope")).toBeNull();
  });

  it("puts an object on the first bed its box touches, and on none when it's off every bed", () => {
    const xl = parseBedShape("0x0,360x0,360x360,0x360")!;
    // The owner's four-bed scene: one object per bed, at the positions PrusaSlicer 2.9.6 wrote.
    expect(bedIndexOf([138, 229, 126, 226], xl)).toBe(0);
    expect(bedIndexOf([626, 667, 152, 193], xl)).toBe(1);
    expect(bedIndexOf([151, 196, 612, 657], xl)).toBe(2);
    expect(bedIndexOf([624, 660, 615, 651], xl)).toBe(3);
    // In the gap between bed 0 and bed 1, touching neither.
    expect(bedIndexOf([380, 440, 10, 20], xl)).toBeNull();
    // Straddling the edge of bed 0 counts as bed 0, the first touched.
    expect(bedIndexOf([340, 380, 10, 20], xl)).toBe(0);
  });
});
