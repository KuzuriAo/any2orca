// SPDX-License-Identifier: MIT
/**
 * `any2orca inspect <file>`: what a project holds, read the way a conversion reads it, without converting:
 * the slicer and printer it was saved for, its filaments, and each plate's objects and the filaments it uses.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { formatSize } from "../../archive/safeUnzip.js";
import type { PlatePause } from "../../archive/plateFilaments.js";
import type { Inspection } from "../../inspect.js";
import { catalogEngine, type ProfileCatalog } from "../../profiles.js";
import { cleanWarnings, inspect } from "../../project.js";
import { planFilamentSwaps, type FilamentSwap, type SwapPlan } from "../../swapPlan.js";
import { formatTable } from "../table.js";

export interface InspectCommandOptions {
  file: string;
  /** --json: the whole reading as JSON instead of text. */
  json: boolean;
  /** --max-unpacked: the most the project may unpack to, in bytes (default 2 GB). */
  maxUnpackedBytes?: number;
}

/** The name and version of `--json`'s output; the version goes up only when a field's meaning changes or one goes away. */
export const INSPECT_JSON_FORMAT = { format: "any2orca-inspect", version: 1 } as const;

const USES: Readonly<Record<string, string>> = {
  object: "objects",
  part: "parts",
  paint: "paint",
  "height-range": "a height range",
  support: "supports",
  "layer-change": "a tool change at a layer",
};

/** "layer 138 (13 mm)", or the height alone where the plate's layers aren't known. */
function pauseText(p: PlatePause): string {
  return `${p.layer !== undefined ? `layer ${p.layer} (${p.height} mm)` : `${p.height} mm`}${p.kind === "custom" ? ", custom G-code" : ""}`;
}

function swapText(s: FilamentSwap): string {
  const where = s.pauseLayers ? (s.pauseLayers.first === s.pauseLayers.last ? `on layer ${s.pauseLayers.first}` : `on a layer from ${s.pauseLayers.first} to ${s.pauseLayers.last}`) : `between ${s.after} and ${s.before} mm`;
  return `${s.outgoing} to ${s.incoming}, a pause ${where}${s.pauses.length > 0 ? `: in place at ${s.pauses.map(pauseText).join(", ")}` : ": none there yet"}`;
}

/**
 * Each plate's {@link SwapPlan} for a printer with `toolheads` toolheads, by plate; none for a plate that prints
 * object by object, where the slicer applies no pauses.
 */
export function swapPlansFor(inspection: Inspection, toolheads: number): SwapPlan[] {
  return (inspection.plateFilaments ?? []).flatMap((p) => planFilamentSwaps(p, toolheads, inspection.layerHeight ?? 0.2) ?? []);
}

/** The reading as the lines `inspect` prints; `plans` adds how each plate that needs one prints on the U1. */
export function inspectionLines(name: string, inspection: Inspection, plans: readonly SwapPlan[] = [], toolheads = 4): string[] {
  const lines: string[] = [name];
  const facts: string[][] = [];
  const fact = (label: string, value: string | null | undefined) => {
    if (value) facts.push([`  ${label}`, value]);
  };
  fact("Printer", inspection.printerModel ? `${inspection.printerModel}${inspection.sourceVendor !== "other" ? ` (${inspection.sourceVendor})` : ""}` : null);
  fact("Slicer version", inspection.slicerVersion);
  fact("Process preset", inspection.sourcePresetName);
  const sizes = inspection.nozzleDiameters ?? [];
  fact("Nozzle", sizes.length > 0 ? `${sizes.join(", ")} mm` : inspection.nozzleDiameter ? `${inspection.nozzleDiameter} mm` : null);
  fact("Layer height", inspection.layerHeight !== null ? `${inspection.layerHeight} mm` : null);
  fact("Size", `${formatSize(inspection.unpackedBytes)} unpacked`);
  const plateCount = inspection.plateCount ?? inspection.plates.length;
  fact("Plates", `${plateCount}${inspection.plates.length < plateCount ? ` (${inspection.plates.length} with objects)` : ""}`);
  fact("Objects", String(inspection.objects.length));
  lines.push(formatTable(facts));

  lines.push("", `  Filaments (${inspection.filaments.length})`);
  if (inspection.filaments.length > 0) {
    lines.push(
      formatTable(
        inspection.filaments.map((f) => [`    ${f.slot}`, f.color, f.type, f.presetName || "(no preset name)", f.colorName ? `${f.colorName.name}` : ""]),
      ).replace(/[ \t]+$/gm, ""),
    );
  }

  const plates = (inspection.plateFilaments ?? []).filter((p) => p.filaments.length > 0);
  if (plates.length > 0) {
    lines.push("", "  Plates");
    for (const plate of plates) {
      const objects = inspection.objects.filter((o) => (o.plate ?? 1) === plate.plate).length;
      const slots = plate.filaments.map((f) => f.slot);
      const atOnce = plate.mostAtOnce < slots.length ? `, ${plate.mostAtOnce} at the same height` : "";
      lines.push(`    Plate ${plate.plate}: ${objects} object${objects === 1 ? "" : "s"}, filament${slots.length === 1 ? "" : "s"} ${slots.join(", ")}${atOnce}`);
      for (const use of plate.filaments) {
        const layers = use.firstLayer !== undefined ? ` (layers ${use.firstLayer} to ${use.lastLayer})` : "";
        lines.push(`      ${use.slot}: ${use.uses.map((u) => USES[u] ?? u).join(", ")}, ${use.from} to ${use.to} mm${layers}`);
      }
      if (plate.layerHeights) {
        const { thinnest, thickest } = plate.layerHeights;
        lines.push(`      Layers: ${thinnest === thickest ? `${thinnest} mm` : `${thinnest} to ${thickest} mm`}`);
      }
      if (plate.pauses) lines.push(`      Pause${plate.pauses.length === 1 ? "" : "s"}: ${plate.pauses.map(pauseText).join("; ")}`);
      const plan = plans.find((p) => p.plate === plate.plate);
      if (plan) {
        lines.push(`      On the U1's ${toolheads} toolheads: load ${plan.load.join(", ")} to start`);
        for (const head of plan.shared) lines.push(`        filaments ${head.filaments.join(", then ")} share a toolhead: ${head.swaps.map(swapText).join("; ")}`);
      }
    }
  }

  const notes = cleanWarnings(inspection.warnings);
  if (notes.length > 0) {
    lines.push("", "  Notes");
    for (const note of notes) lines.push(`    ${note}`);
  }
  return lines;
}

/**
 * Reads the project and prints what it holds, with how each plate that has more filaments than the U1 has toolheads
 * prints on them (the U1's count, from the catalog's default profile). Throws for a file that can't be read; the
 * caller reports it.
 */
export async function runInspect(options: InspectCommandOptions, out: (line: string) => void, openCatalog: () => Promise<ProfileCatalog>): Promise<number> {
  const inspection = inspect(new Uint8Array(readFileSync(options.file)), { maxUnpackedBytes: options.maxUnpackedBytes });
  const name = basename(options.file);
  const catalog = await openCatalog();
  // The printer preset lists one nozzle per toolhead.
  const nozzles = (await catalogEngine(catalog).load(catalog.index.defaultProfileId)).convertProfile.printer.machineSettingsConfig.nozzle_diameter;
  const toolheads = Array.isArray(nozzles) && nozzles.length > 0 ? nozzles.length : 4;
  const swapPlans = swapPlansFor(inspection, toolheads);
  if (options.json) out(JSON.stringify({ ...INSPECT_JSON_FORMAT, file: name, inspection, ...(swapPlans.length > 0 ? { toolheads, swapPlans } : {}) }, null, 2));
  else for (const line of inspectionLines(name, inspection, swapPlans, toolheads)) out(line);
  return 0;
}
