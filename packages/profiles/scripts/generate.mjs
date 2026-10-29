#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Builds data/ (what the package actually ships) from catalog.json and
 * templates/. Run it after changing either, and after `changeset version`
 * bumps this package, since data/index.json carries the package version.
 *
 *   node scripts/generate.mjs           write data/
 *   node scripts/generate.mjs --check   fail if data/ is out of date (used by `npm test`)
 *
 * Output:
 *   data/index.json            the catalog: versions, printers, profiles, retired ids,
 *                              filament names for the Snapmaker/Generic naming options
 *   data/profiles/<id>.json    one self-contained file per profile
 *
 * No dependencies on purpose: this is the one script a contributor runs
 * after editing a template.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatesDir = join(root, "templates");
const dataDir = join(root, "data");
const SCHEMA = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readTemplate(name) {
  if (name.includes("..") || name.startsWith("/")) throw new Error(`catalog.json names a template outside templates/: ${name}`);
  return readJson(join(templatesDir, name));
}

function fail(message) {
  throw new Error(`catalog.json: ${message}`);
}

function build() {
  const catalog = readJson(join(root, "catalog.json"));
  const { version } = readJson(join(root, "package.json"));
  const highFlow = readTemplate("high_flow.json");
  const filamentShape = readTemplate("filament_settings_1.config");

  const ids = new Set();
  const printers = new Map();
  for (const printer of catalog.printers) {
    if (!ID_PATTERN.test(printer.id)) fail(`bad printer id ${JSON.stringify(printer.id)}`);
    const machineSettings = readTemplate(printer.machineFile);
    const printableArea = machineSettings.printable_area;
    const extruderClearanceRadius = Number(machineSettings.extruder_clearance_radius);
    if (!Array.isArray(printableArea)) fail(`${printer.machineFile} has no printable_area array`);
    if (!Number.isFinite(extruderClearanceRadius)) fail(`${printer.machineFile} has no numeric extruder_clearance_radius`);
    printers.set(printer.id, {
      summary: {
        id: printer.id,
        displayName: printer.displayName,
        nozzleDiameter: printer.nozzleDiameter,
        highFlowSupported: highFlow.printers[printer.nozzleDiameter] === true,
      },
      machineSettings,
      printableArea,
      extruderClearanceRadius,
    });
  }

  for (const name of Object.keys(highFlow.profiles)) {
    if (!catalog.profiles.some((p) => p.displayName === name)) fail(`high_flow.json names "${name}", which isn't a profile`);
  }

  const files = {};
  const summaries = [];
  for (const profile of catalog.profiles) {
    if (!ID_PATTERN.test(profile.id)) fail(`bad profile id ${JSON.stringify(profile.id)}`);
    if (ids.has(profile.id)) fail(`duplicate profile id ${profile.id}`);
    ids.add(profile.id);
    const printer = printers.get(profile.printerId);
    if (!printer) fail(`${profile.id} names unknown printer ${profile.printerId}`);

    const processSettings = readTemplate(profile.processFile);
    const layerHeight = Number.parseFloat(processSettings.layer_height);
    if (typeof processSettings.layer_height !== "string" || !Number.isFinite(layerHeight)) {
      fail(`${profile.processFile} has no numeric layer_height`);
    }
    const highFlowOverrides = highFlow.profiles[profile.displayName] ?? {};

    summaries.push({
      id: profile.id,
      printerId: profile.printerId,
      displayName: profile.displayName,
      nozzleDiameter: printer.summary.nozzleDiameter,
      layerHeight,
      autoSelectable: profile.autoSelectable !== false,
      highFlowSpeeds: Object.keys(highFlowOverrides).length > 0,
    });
    files[`profiles/${profile.id}.json`] = {
      schema: SCHEMA,
      id: profile.id,
      displayName: profile.displayName,
      printer: {
        id: printer.summary.id,
        printableArea: printer.printableArea,
        extruderClearanceRadius: printer.extruderClearanceRadius,
        highFlowSupported: printer.summary.highFlowSupported,
        machineSettings: printer.machineSettings,
      },
      baselineProjectSettings: readTemplate(profile.baselineFile),
      filamentShape,
      highFlowOverrides,
    };
  }

  for (const retired of catalog.retired) {
    if (ids.has(retired.id)) fail(`retired id ${retired.id} is also a live profile`);
    if (!ids.has(retired.successorId)) fail(`retired id ${retired.id} points at unknown successor ${retired.successorId}`);
  }
  if (!ids.has(catalog.defaultProfileId)) fail(`defaultProfileId ${catalog.defaultProfileId} isn't a profile`);

  // Filament names for the Snapmaker/Generic naming options, generated from the filament presets Snapmaker installs.
  const { _comment, ...filamentNames } = readTemplate("filament_names.json");
  for (const printerId of Object.keys(filamentNames.printers)) {
    if (!printers.has(printerId)) fail(`filament_names.json names unknown printer ${printerId}`);
  }
  for (const printerId of printers.keys()) {
    if (!filamentNames.printers[printerId]) fail(`filament_names.json has no presets for printer ${printerId}`);
  }

  // Nozzle diameter,
  // then layer height, finest first. Ties keep catalog order. Matching
  // depends on this (an equidistant layer height goes to the earlier one).
  summaries.sort((a, b) => Number(a.nozzleDiameter) - Number(b.nozzleDiameter) || a.layerHeight - b.layerHeight);

  files["index.json"] = {
    schema: SCHEMA,
    dataVersion: version,
    slicer: catalog.slicer,
    defaultProfileId: catalog.defaultProfileId,
    printers: [...printers.values()].map((p) => p.summary),
    profiles: summaries,
    retired: catalog.retired,
    ...(catalog.source ? { source: catalog.source } : {}),
    filamentNames,
  };

  return Object.fromEntries(Object.entries(files).map(([path, value]) => [path, `${JSON.stringify(value, null, 2)}\n`]));
}

function listData(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listData(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

const files = build();
if (process.argv.includes("--check")) {
  const stale = [];
  for (const [path, text] of Object.entries(files)) {
    const target = join(dataDir, path);
    if (!existsSync(target) || readFileSync(target, "utf-8") !== text) stale.push(path);
  }
  for (const path of listData(dataDir)) if (!(path in files)) stale.push(`${path} (no longer generated)`);
  if (stale.length > 0) {
    console.error(`data/ is out of date; run "npm run generate -w any2orca-profiles". Stale: ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(`data/ is up to date (${Object.keys(files).length} files).`);
} else {
  rmSync(dataDir, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dataDir, path)), { recursive: true });
    writeFileSync(join(dataDir, path), text);
  }
  console.log(`Wrote ${Object.keys(files).length} files to data/.`);
}
