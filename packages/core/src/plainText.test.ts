// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { plainText } from "./plainText.js";
import { cleanWarnings } from "./project.js";

describe("plainText", () => {
  it("replaces control characters and direction overrides, keeping newlines, tabs and ordinary text", () => {
    expect(plainText("Benchy é中文\n\tok")).toBe("Benchy é中文\n\tok");
    expect(plainText("a\u001b[2Jb")).toBe("a�[2Jb");
    expect(plainText("x\u001b]52;c;ZXZpbA==\u0007")).toBe("x�]52;c;ZXZpbA==�");
    expect(plainText("\u0000\u007f\u009b‮⁦")).toBe("�".repeat(5));
  });

  it("is applied to conversion warnings, which can quote names from the file", () => {
    expect(cleanWarnings(["WARN: object \u001b]0;pwned\u0007 moved to fit"])).toEqual(["object �]0;pwned� moved to fit"]);
  });
});
