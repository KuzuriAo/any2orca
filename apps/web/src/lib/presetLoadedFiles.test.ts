// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchLoadedFiles,
  getOfferedPresetFiles,
  NON_U1_REASON,
  isU1Inspection,
  type BatchLoadedItem,
  type LoadedProjectFile,
} from "./presetLoadedFiles";
import type { Inspection } from "any2orca";

function makeMockInspection(vendor: "snapmaker" | "bambu" | "creality" | "anycubic" | "other", printerModel?: string): Inspection {
  return {
    plates: [1],
    objects: [],
    filaments: [],
    nozzleDiameter: "0.4",
    matchNozzleDiameter: "0.4",
    layerHeight: 0.2,
    sourcePresetName: "0.20mm Standard",
    tierName: "Standard",
    printerModel: printerModel ?? (vendor === "snapmaker" ? "Snapmaker U1" : "Printer"),
    sourceVendor: vendor,
    slicerVersion: "2.4.0",
    sourcePrintableArea: null,
    warnings: [],
    unpackedBytes: 1000,
  };
}

describe("presetLoadedFiles", () => {
  it("nothing loaded: returns empty array", () => {
    assert.deepEqual(getOfferedPresetFiles([]), []);
    assert.deepEqual(getOfferedPresetFiles(null), []);
    assert.deepEqual(getOfferedPresetFiles(undefined), []);
  });

  describe("one file", () => {
    it("one U1 file: offered enabled", () => {
      const file = new File(["dummy"], "tuned-u1.3mf");
      const loaded: LoadedProjectFile[] = [
        { file, name: "tuned-u1.3mf", inspection: makeMockInspection("snapmaker") },
      ];

      const offered = getOfferedPresetFiles(loaded);
      assert.equal(offered.length, 1);
      assert.equal(offered[0].name, "tuned-u1.3mf");
      assert.equal(offered[0].isU1, true);
      assert.equal(offered[0].disabled, false);
      assert.equal(offered[0].disabledReason, undefined);
    });

    it("one non-U1 file (e.g. Bambu): offered disabled with reason", () => {
      const file = new File(["dummy"], "bambu-source.3mf");
      const loaded: LoadedProjectFile[] = [
        { file, name: "bambu-source.3mf", inspection: makeMockInspection("bambu", "Bambu Lab X1C") },
      ];

      const offered = getOfferedPresetFiles(loaded);
      assert.equal(offered.length, 1);
      assert.equal(offered[0].name, "bambu-source.3mf");
      assert.equal(offered[0].isU1, false);
      assert.equal(offered[0].disabled, true);
      assert.equal(offered[0].disabledReason, NON_U1_REASON);
    });

    it("one converted output file: offered enabled", () => {
      const file = new File(["dummy"], "model_U1.3mf");
      const loaded: LoadedProjectFile[] = [
        { file, name: "model_U1.3mf", isConvertedOutput: true },
      ];

      const offered = getOfferedPresetFiles(loaded);
      assert.equal(offered.length, 1);
      assert.equal(offered[0].isU1, true);
      assert.equal(offered[0].disabled, false);
      assert.equal(offered[0].isConvertedOutput, true);
    });
  });

  describe("a batch", () => {
    it("batch of U1 files: all offered enabled", () => {
      const f1 = new File(["dummy1"], "part1-tuned.3mf");
      const f2 = new File(["dummy2"], "part2-tuned.3mf");
      const loaded: LoadedProjectFile[] = [
        { file: f1, name: "part1-tuned.3mf", inspection: makeMockInspection("snapmaker") },
        { file: f2, name: "part2-tuned.3mf", inspection: makeMockInspection("snapmaker") },
      ];

      const offered = getOfferedPresetFiles(loaded);
      assert.equal(offered.length, 2);
      assert.ok(offered.every((o) => o.isU1 && !o.disabled));
    });

    it("list for a batch of N completed items creates no File until one is chosen", (t) => {
      const N = 5;
      const sourceFiles = Array.from({ length: N }, (_, i) => new File([`source-${i}`], `part-${i}.3mf`));
      const batchItems: BatchLoadedItem[] = sourceFiles.map((file, i) => ({
        id: `batch-${i}`,
        file,
        inspection: makeMockInspection("bambu", "Bambu Lab X1C"),
        status: "complete",
        convertedBytes: new Uint8Array([80, 75, 3, 4, i]),
        outputFilename: `part-${i}_U1.3mf`,
      }));

      const OriginalFile = globalThis.File;
      let fileConstructions = 0;
      const FileSpy = new Proxy(OriginalFile, {
        construct(target, args, newTarget) {
          fileConstructions++;
          return Reflect.construct(target, args, newTarget);
        },
      });

      t.after(() => {
        globalThis.File = OriginalFile;
      });
      globalThis.File = FileSpy;

      // Simulate building and offering the list across multiple batch updates
      const loadedFirstUpdate = buildBatchLoadedFiles(batchItems);
      const offeredFirstUpdate = getOfferedPresetFiles(loadedFirstUpdate);
      const loadedSecondUpdate = buildBatchLoadedFiles(batchItems);
      const offeredSecondUpdate = getOfferedPresetFiles(loadedSecondUpdate);

      assert.equal(offeredFirstUpdate.length, N * 2);
      assert.equal(offeredSecondUpdate.length, N * 2);
      assert.equal(fileConstructions, 0);

      // Choose one converted output item
      const chosen = offeredSecondUpdate.find((o) => o.isConvertedOutput && o.name === "part-2_U1.3mf");
      assert.ok(chosen);
      assert.equal(chosen.disabled, false);

      const constructedFile = chosen.getFile();
      assert.equal(fileConstructions, 1);
      assert.equal(constructedFile.name, "part-2_U1.3mf");
      assert.equal(constructedFile.size, 5);
    });
  });

  describe("a mix of U1 and non-U1 files", () => {
    it("correctly enables U1 files and disables non-U1 files with guidance reason", () => {
      const f1 = new File(["dummy1"], "source-creality.3mf");
      const f2 = new File(["dummy2"], "tuned-snapmaker.3mf");
      const f3 = new File(["dummy3"], "source-anycubic.3mf");
      const f4 = new File(["dummy4"], "converted-output.3mf");

      const loaded: LoadedProjectFile[] = [
        { file: f1, name: "source-creality.3mf", inspection: makeMockInspection("creality", "Creality K1") },
        { file: f2, name: "tuned-snapmaker.3mf", inspection: makeMockInspection("snapmaker") },
        { file: f3, name: "source-anycubic.3mf", inspection: makeMockInspection("anycubic", "Anycubic Kobra 3") },
        { file: f4, name: "converted-output.3mf", isConvertedOutput: true },
      ];

      const offered = getOfferedPresetFiles(loaded);
      assert.equal(offered.length, 4);

      // f1 (Creality)
      assert.equal(offered[0].isU1, false);
      assert.equal(offered[0].disabled, true);
      assert.equal(offered[0].disabledReason, NON_U1_REASON);

      // f2 (Snapmaker)
      assert.equal(offered[1].isU1, true);
      assert.equal(offered[1].disabled, false);

      // f3 (Anycubic)
      assert.equal(offered[2].isU1, false);
      assert.equal(offered[2].disabled, true);
      assert.equal(offered[2].disabledReason, NON_U1_REASON);

      // f4 (Converted output)
      assert.equal(offered[3].isU1, true);
      assert.equal(offered[3].disabled, false);
      assert.equal(offered[3].isConvertedOutput, true);
    });
  });
});

