// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../profiles.js";
import { applyConvertResponse, prepareConvertRequest } from "./zip.js";
import { setApplicationMetadata } from "./setApplicationMetadata.js";

const MODEL = '<?xml version="1.0"?>\n<model unit="millimeter">\n <metadata name="Application">BambuStudio-02.08.02.61</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources/>\n</model>\n';

describe("setApplicationMetadata", () => {
  it("changes only the Application value, byte for byte", () => {
    const out = setApplicationMetadata(MODEL, "Snapmaker_Orca-2.4.0");
    expect(out).toBe(MODEL.replace("BambuStudio-02.08.02.61", "Snapmaker_Orca-2.4.0"));
  });

  it("leaves a file without an Application line unchanged", () => {
    const text = MODEL.replace(/ <metadata name="Application">[^\n]*\n/, "");
    expect(setApplicationMetadata(text, "Snapmaker_Orca-2.4.0")).toBe(text);
  });

  it("refuses anything that isn't a slicer name and version, so nothing else reaches the XML", () => {
    for (const bad of ["", "Snapmaker_Orca", "Snapmaker Orca-2.4.0", 'x"/><evil/>-1.0', "Snapmaker_Orca-2.4.0</metadata>", "a-1.0\n"]) {
      expect(() => setApplicationMetadata(MODEL, bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("applyConvertResponse with an Application value", () => {
  it("writes it, adds no OrcaSlicer line, and changes nothing else in 3dmodel.model", () => {
    const fixture = new Uint8Array(readFileSync(new URL("../test-fixtures/synthetic-2plate.3mf", import.meta.url)));
    const parsed = prepareConvertRequest(fixture);
    const before = new TextDecoder().decode(parsed.zipEntries["3D/3dmodel.model"]);
    const output = applyConvertResponse(parsed, { projectSettings: {}, configFiles: {}, shifts: {}, application: "Snapmaker_Orca-2.4.0" });
    const after = new TextDecoder().decode(unzipSync(output)["3D/3dmodel.model"]);
    expect(after).not.toContain('<metadata name="OrcaSlicer">');
    expect(after).toBe(before.replace(/(<metadata name="Application">)[^<]*/, "$1Snapmaker_Orca-2.4.0"));
  });
});

describe("the catalog's Application value", () => {
  // The real index with another slicer, and without its releases list, which would name the real release.
  const index = (slicer: Record<string, unknown>) => ({
    readIndex: async () => {
      const { releases: _ignored, ...real } = JSON.parse(readFileSync(new URL("../../../profiles/data/index.json", import.meta.url), "utf-8"));
      return { ...real, slicer };
    },
    readProfile: async () => ({}),
  });

  it("must match the pinned slicer version", async () => {
    await expect(loadCatalog(index({ name: "Snapmaker Orca", version: "2.4.0", application: "Snapmaker_Orca-2.4.1" }))).rejects.toThrow();
    await expect(loadCatalog(index({ name: "Snapmaker Orca", version: "2.4.0", application: '<x/>-2.4.0' }))).rejects.toThrow();
    await expect(loadCatalog(index({ name: "Snapmaker Orca", version: "2.4.0", application: "Snapmaker_Orca-2.4.0" }))).resolves.toBeDefined();
  });

  it("is required: a catalog has to say what its slicer writes", async () => {
    await expect(loadCatalog(index({ name: "Snapmaker Orca", version: "2.4.0" }))).rejects.toThrow(/slicer\.application/);
  });
});
