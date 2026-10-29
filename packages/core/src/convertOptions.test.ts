// SPDX-License-Identifier: MIT
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { Any2orcaError } from "./errors.js";
import { convert, type ConvertOptions } from "./project.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const input = () => readFixture("synthetic-2plate.3mf");

describe("convert() options from a caller", () => {
  it("refuses an unknown filament naming mode instead of converting as Generic", async () => {
    const options = { profiles: testProfileSource(), filamentComplianceMode: "evil", stamp: false } as unknown as ConvertOptions;
    await expect(convert(input(), options)).rejects.toThrow(/filamentComplianceMode/);
  });

  it("says that `profiles` is required, instead of a TypeError from inside", async () => {
    await expect(convert(input(), {} as ConvertOptions)).rejects.toThrow(/profiles/);
  });

  it("refuses a flag that isn't a boolean", async () => {
    const options = { profiles: testProfileSource(), stamp: "no" } as unknown as ConvertOptions;
    await expect(convert(input(), options)).rejects.toThrow(/stamp/);
  });
});

describe("coordinates too large to convert", () => {
  it("fail as invalid_project with a sentence, not a schema dump", async () => {
    const entries = unzipSync(input());
    const model = new TextDecoder().decode(entries["3D/3dmodel.model"]);
    entries["3D/3dmodel.model"] = new TextEncoder().encode(model.replace(/(<item [^>]*transform=")([^"]*)"/, (_m, a: string, t: string) => `${a}${t.split(" ").map((v, i) => (i === 9 ? "1e308" : v)).join(" ")}"`));
    const error = await convert(zipSync(entries), { profiles: testProfileSource(), stamp: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Any2orcaError);
    expect((error as Any2orcaError).code).toBe("invalid_project");
    expect((error as Error).message).not.toMatch(/^\[|"code":/);
  });
});
