// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resizeFlushVolumes } from "./resizeFlushVolumes.js";

describe("resizeFlushVolumes", () => {
  it("returns null when flush_volumes_matrix/vector are missing", () => {
    const warnings: string[] = [];
    expect(resizeFlushVolumes({}, 5, warnings)).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("writes zeros of the right size, with a warning, when the matrix fits no filament count", () => {
    const warnings: string[] = [];
    const result = resizeFlushVolumes({ flush_volumes_matrix: [1, 2, 3], flush_volumes_vector: [0, 0, 0] }, 2, warnings);
    expect(result).toEqual({ flush_volumes_matrix: ["0", "0", "0", "0"], flush_volumes_vector: ["0", "0", "0", "0"] });
    expect(warnings[0]).toContain("doesn't fit any filament count");
  });

  it("takes a two-nozzle source's first n x n block", () => {
    const warnings: string[] = [];
    // Two 2x2 blocks, one per nozzle; the vector has 2n entries.
    const result = resizeFlushVolumes({ flush_volumes_matrix: ["1", "2", "3", "4", "5", "6", "7", "8"], flush_volumes_vector: ["9", "9", "9", "9"] }, 2, warnings);
    expect(result).toEqual({ flush_volumes_matrix: ["1", "2", "3", "4"], flush_volumes_vector: ["9", "9", "9", "9"] });
  });

  it("returns the arrays as strings, silently, when the source already matches the filament count", () => {
    const warnings: string[] = [];
    const result = resizeFlushVolumes({ flush_volumes_matrix: [1, 2, 3, 4], flush_volumes_vector: ["10", "20", "30", "40"] }, 2, warnings);
    expect(result).toEqual({ flush_volumes_matrix: ["1", "2", "3", "4"], flush_volumes_vector: ["10", "20", "30", "40"] });
    expect(warnings).toEqual([]);
  });

  it("shrinks via a top-left submatrix/prefix-vector and notes it when the source is larger than the filament count", () => {
    const warnings: string[] = [];
    // 3x3 matrix: [[0,1,2],[3,4,5],[6,7,8]] -- top-left 2x2 is [[0,1],[3,4]]
    const matrix = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
    const vector = ["10", "11", "12", "13", "14", "15"];
    const result = resizeFlushVolumes({ flush_volumes_matrix: matrix, flush_volumes_vector: vector }, 2, warnings);
    expect(result).toEqual({ flush_volumes_matrix: ["0", "1", "3", "4"], flush_volumes_vector: ["10", "11", "12", "13"] });
    expect(warnings[0]).toContain("Resized flush_volumes_matrix/vector from 9/6 entries to 2");
  });

  it("pads with 0 and warns distinctly when the filament count is larger than the source dimension", () => {
    const warnings: string[] = [];
    const result = resizeFlushVolumes({ flush_volumes_matrix: ["1", "2", "3", "4"], flush_volumes_vector: ["10", "20", "30", "40"] }, 3, warnings);
    expect(result).toEqual({
      flush_volumes_matrix: ["1", "2", "0", "3", "4", "0", "0", "0", "0"],
      flush_volumes_vector: ["10", "20", "30", "40", "0", "0"],
    });
    expect(warnings[0]).toContain("fewer than this project's 3");
  });

  it("reproduces the real Feraligatr sample: 5 filaments, a stale 6x6 matrix, resizes to 5x5", () => {
    const warnings: string[] = [];
    const matrix = Array.from({ length: 36 }, (_, i) => i);
    const vector = Array.from({ length: 12 }, (_, i) => i);
    const result = resizeFlushVolumes({ flush_volumes_matrix: matrix, flush_volumes_vector: vector }, 5, warnings);
    expect(result?.flush_volumes_matrix).toHaveLength(25);
    expect(result?.flush_volumes_vector).toHaveLength(10);
  });
});
