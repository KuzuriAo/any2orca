// SPDX-License-Identifier: MIT
/**
 * `any2orca inspect <file>`: what a project holds, read the way a conversion reads it, without converting:
 * the slicer and printer it was saved for, its filaments, and each plate's objects and the filaments it uses.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { formatSize } from "../../archive/safeUnzip.js";
import type { Inspection } from "../../inspect.js";
import { cleanWarnings, inspect } from "../../project.js";
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

/** The reading as the lines `inspect` prints. */
export function inspectionLines(name: string, inspection: Inspection): string[] {
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
        lines.push(`      ${use.slot}: ${use.uses.map((u) => USES[u] ?? u).join(", ")}, ${use.from} to ${use.to} mm`);
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

/** Reads the project and prints what it holds. Throws for a file that can't be read; the caller reports it. */
export function runInspect(options: InspectCommandOptions, out: (line: string) => void): number {
  const inspection = inspect(new Uint8Array(readFileSync(options.file)), { maxUnpackedBytes: options.maxUnpackedBytes });
  const name = basename(options.file);
  if (options.json) out(JSON.stringify({ ...INSPECT_JSON_FORMAT, file: name, inspection }, null, 2));
  else for (const line of inspectionLines(name, inspection)) out(line);
  return 0;
}
