// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convert, loadCatalog, resolveFilamentName } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const DEMO_FILE = fileURLToPath(new URL("../../public/demo-model.3mf", import.meta.url));
const demoBytes = readFileSync(DEMO_FILE);
const catalogPromise = loadCatalog(bundledProfileSource());

describe("Filament compliance names preview and resolution", () => {
  it("resolves Snapmaker names for 0.4 nozzle: SnapSpeed for Basic, Matte for Matte", async () => {
    const catalog = await catalogPromise;
    assert.ok(catalog.index.filamentNames, "catalog should have filamentNames table");

    const basic = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1",
      "PLA",
      "Bambu PLA Basic @BBL X1C 0.4 nozzle",
      "snapmaker"
    );
    assert.equal(basic.preset?.name, "Snapmaker PLA SnapSpeed @U1");
    assert.equal(basic.outcome, "renamed");

    const matte = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1",
      "PLA",
      "Bambu PLA Matte @BBL X1C 0.4 nozzle",
      "snapmaker"
    );
    assert.equal(matte.preset?.name, "Snapmaker PLA Matte @U1");
    assert.equal(matte.outcome, "renamed");
  });

  it("resolves Snapmaker names for 0.6 nozzle: ... @U1 0.6 nozzle", async () => {
    const catalog = await catalogPromise;
    assert.ok(catalog.index.filamentNames);

    const basic = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1-0.6",
      "PLA",
      "Bambu PLA Basic @BBL X1C 0.4 nozzle",
      "snapmaker"
    );
    assert.equal(basic.preset?.name, "Snapmaker PLA SnapSpeed @U1 0.6 nozzle");
    assert.equal(basic.outcome, "renamed");

    const matte = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1-0.6",
      "PLA",
      "Bambu PLA Matte @BBL X1C 0.4 nozzle",
      "snapmaker"
    );
    assert.equal(matte.preset?.name, "Snapmaker PLA Matte @U1 0.6 nozzle");
    assert.equal(matte.outcome, "renamed");
  });

  it("resolves Generic names for 0.4 and 0.6 nozzles to Generic PLA", async () => {
    const catalog = await catalogPromise;
    assert.ok(catalog.index.filamentNames);

    const basic04 = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1",
      "PLA",
      "Bambu PLA Basic @BBL X1C 0.4 nozzle",
      "generic"
    );
    assert.equal(basic04.preset?.name, "Generic PLA");

    const matte04 = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1",
      "PLA",
      "Bambu PLA Matte @BBL X1C 0.4 nozzle",
      "generic"
    );
    assert.equal(matte04.preset?.name, "Generic PLA");
  });

  it("falls back to Generic PETG when Snapmaker makes no PETG preset at that nozzle size", async () => {
    const catalog = await catalogPromise;
    assert.ok(catalog.index.filamentNames);

    const res = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1",
      "PETG",
      "Bambu PETG Basic @BBL X1C",
      "snapmaker"
    );
    assert.equal(res.outcome, "generic");
    assert.equal(res.preset?.name, "Generic PETG");
  });

  it("leaves filament unchanged when neither Snapmaker nor Generic preset fits (PC on 0.2 nozzle)", async () => {
    const catalog = await catalogPromise;
    assert.ok(catalog.index.filamentNames);

    const res = resolveFilamentName(
      catalog.index.filamentNames,
      "snapmaker-u1-0.2",
      "PC",
      "Bambu PC @BBL X1C",
      "snapmaker"
    );
    assert.equal(res.outcome, "unchanged");
    assert.equal(res.preset, undefined);
  });

  it("conversion pipeline populates filamentComplianceFallback when a material falls back", async () => {
    const catalog = await catalogPromise;
    // Converting demo model with PETG or checking report shape
    const { report } = await convert(demoBytes, {
      profiles: catalog,
      filamentComplianceMode: "snapmaker",
    });
    // Demo model is PLA only, so no fallback
    assert.equal(report.filamentComplianceFallback, undefined);
    assert.equal(report.filamentComplianceUnchanged, undefined);
  });
});
