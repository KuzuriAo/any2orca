// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { clampColorPenetration } from "./clampColorPenetration.js";

describe("clampColorPenetration", () => {
  it("lowers a penetration larger than its shell layers, on each side independently", () => {
    const settings: Record<string, unknown> = {
      top_color_penetration_layers: "5",
      top_shell_layers: "3",
      bottom_color_penetration_layers: "3",
      bottom_shell_layers: "5",
    };
    const notes: string[] = [];
    clampColorPenetration(settings, notes);
    expect(settings.top_color_penetration_layers).toBe("3");
    expect(settings.bottom_color_penetration_layers).toBe("3"); // already within its shell: untouched
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/top_color_penetration_layers lowered from 5 to 3/);
    expect(notes.some((n) => n.includes("WARN"))).toBe(false); // routine, not user-facing
  });

  it("leaves values that fit, and equal values, alone", () => {
    const settings: Record<string, unknown> = { top_color_penetration_layers: "3", top_shell_layers: "3", bottom_color_penetration_layers: "2", bottom_shell_layers: "4" };
    clampColorPenetration(settings, []);
    expect(settings).toEqual({ top_color_penetration_layers: "3", top_shell_layers: "3", bottom_color_penetration_layers: "2", bottom_shell_layers: "4" });
  });

  it("does nothing when either number is missing or not a whole number", () => {
    for (const settings of [
      { top_shell_layers: "3" },
      { top_color_penetration_layers: "5" },
      { top_color_penetration_layers: "x", top_shell_layers: "3" },
      { top_color_penetration_layers: "5", top_shell_layers: "-1" },
      { top_color_penetration_layers: "1.5", top_shell_layers: "1" },
    ] as Record<string, unknown>[]) {
      const before = JSON.stringify(settings);
      clampColorPenetration(settings, []);
      expect(JSON.stringify(settings)).toBe(before);
    }
  });

  it("reads a one-entry list the way Snapmaker Orca stores some settings", () => {
    const settings: Record<string, unknown> = { top_color_penetration_layers: ["6"], top_shell_layers: ["4"] };
    clampColorPenetration(settings, []);
    expect(settings.top_color_penetration_layers).toBe("4");
  });
});
