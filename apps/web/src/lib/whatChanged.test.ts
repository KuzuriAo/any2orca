// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convert, loadCatalog, formatWhatChanged, withoutChanges, type WhatChanged } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const DEMO_FILE = fileURLToPath(new URL("../../public/demo-model.3mf", import.meta.url));

const demoBytes = readFileSync(DEMO_FILE);
const catalogPromise = loadCatalog(bundledProfileSource());

describe("WhatChanged panel data and exports", () => {
  it("converts a real 3MF fixture and produces a valid WhatChanged record with diff", async () => {
    const catalog = await catalogPromise;
    const { report } = await convert(demoBytes, { profiles: catalog, explain: true });
    const record = report.whatChanged;

    assert.equal(record.format, "any2orca-what-changed");
    assert.equal(record.version, 1);
    assert.ok(record.profile.displayName.length > 0);
    assert.ok(["matched", "you", "preset"].includes(record.profile.chosenBy));
    assert.ok(record.groups.length > 0);
    assert.ok(record.diff !== undefined);

    // Profile line matching
    const howMap: Record<string, string> = {
      matched: "matched to the file",
      you: "chosen by you",
      preset: "from your preset",
    };
    const profileLine = `Converted with ${record.profile.displayName} (${howMap[record.profile.chosenBy]}).`;
    const formatted = formatWhatChanged(record);
    assert.ok(formatted.startsWith(profileLine));
  });

  it("produces an export payload byte-identical to JSON.stringify(record, null, 2)", async () => {
    const catalog = await catalogPromise;
    const { report } = await convert(demoBytes, { profiles: catalog, explain: true });
    const record = report.whatChanged;

    const exportedJson = JSON.stringify(record, null, 2);
    const parsed = JSON.parse(exportedJson);
    assert.deepEqual(parsed, record);

    // Byte-identical round trip test
    const reSerialized = JSON.stringify(parsed, null, 2);
    assert.equal(reSerialized, exportedJson);
  });

  it("handles sentence items where both before and after are null without arrows", async () => {
    const catalog = await catalogPromise;
    const { report } = await convert(demoBytes, { profiles: catalog, explain: true });
    const record = report.whatChanged;

    // Search for summary lines (e.g. filaments or printer settings or plate shifts)
    const sentenceItems = record.groups.flatMap((g) =>
      g.items.filter((i) => i.before === null && i.after === null)
    );

    assert.ok(sentenceItems.length > 0, "Should have at least one sentence item");
    for (const item of sentenceItems) {
      assert.equal(item.before, null);
      assert.equal(item.after, null);
      assert.ok(item.label.length > 0);
      assert.equal(item.key, undefined, "Sentence items must not have a setting key");
    }
  });

  it("handles missing diff when converted without explain", async () => {
    const catalog = await catalogPromise;
    const { report } = await convert(demoBytes, { profiles: catalog, explain: false });
    const record = report.whatChanged;

    assert.equal(record.format, "any2orca-what-changed");
    assert.equal(record.diff, undefined);
    assert.ok(record.groups.length > 0);

    const formatted = formatWhatChanged(record);
    assert.ok(formatted.length > 0);
  });

  it("withoutChanges leaves out selected keys while preserving other preset changes", () => {
    const original = {
      name: "Tuned Fast",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: { tag: "v2.4.0", commit: "abc" },
      changes: {
        wall_loops: "4",
        sparse_infill_speed: "480",
        outer_wall_speed: "250",
      },
      created: "2026-10-21",
    };

    const modified = withoutChanges(original, ["sparse_infill_speed"]);
    assert.deepEqual(modified.changes, {
      wall_loops: "4",
      outer_wall_speed: "250",
    });
    assert.equal(original.changes.sparse_infill_speed, "480", "Must not mutate original preset");

    const stockAll = withoutChanges(original, ["wall_loops", "sparse_infill_speed", "outer_wall_speed"]);
    assert.deepEqual(stockAll.changes, {});
  });
});
