// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Inspection } from "any2orca";
import type { FileMetadata } from "./types";

export function extractFileMetadata(file: File, inspection: Inspection): FileMetadata {
  return {
    name: file.name,
    size: file.size,
    platesCount: Math.max(1, inspection.plates.length),
    objectsCount: inspection.objects.length,
    filaments: inspection.filaments.map((f, i) => ({
      id: f.slot ?? i + 1,
      color: f.color.startsWith("#") ? f.color : `#${f.color}`,
      name: f.presetName || `Filament Slot ${f.slot ?? i + 1}`,
      colorName: f.colorName?.name,
      type: f.type,
    })),
    nozzleDiameter: inspection.nozzleDiameter ?? undefined,
    layerHeight: inspection.layerHeight ?? undefined,
    sourcePresetName: inspection.sourcePresetName ?? undefined,
    printerModel: inspection.printerModel ?? undefined,
    version: inspection.slicerVersion ?? undefined,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2 GB", "1.4 GB", "512 MB": format unpacked size matching the core library. */
export function formatSize(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${Number(gb.toFixed(1))} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Pre-conversion and post-conversion notification for large projects. */
export function largeProjectNote(bytes: number): string {
  return `This is a large project (${formatSize(bytes)} unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory.`;
}

/**
 * Filter out noisy internal warnings and simplify file-level details into concise actions.
 */
export function sanitizeWarnings(warnings: string[], unpackedBytes?: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of warnings) {
    let w = raw.trim();
    if (!w) continue;
    if (w.includes("SKIP filament_colour: list length mismatch")) continue;
    if (w.includes("left unchanged")) continue;
    if (w.includes("ignored") && w.includes("trailing non-JSON")) continue;

    if (/This is a large project \([^)]+ unpacked\)\. Converting it takes a minute or two and a few GB of memory/i.test(w)) {
      const sizeStr = unpackedBytes
        ? formatSize(unpackedBytes)
        : w.match(/\(([^)]+ unpacked)\)/)?.[1]?.replace(" unpacked", "") || "";
      w = `This is a large project (${sizeStr} unpacked). Converting it takes a minute or two and a few GB of memory; close other tabs if your computer has little memory.`;
    } else {
      w = w
        .replace(/^WARN:\s*/i, "")
        .replace(/^WARN\s+/i, "")
        .replace(/\s+in\s+model_settings\.config\.?/i, "")
        .replace(/\s+in\s+3D\/3dmodel\.model\.?/i, "")
        .replace(/\s+in\s+[A-Za-z0-9_./-]+\.(config|model|xml)\.?/i, "")
        .replace(/\.$/, "");
    }

    if (!seen.has(w)) {
      seen.add(w);
      result.push(w);
    }
  }

  return result;
}
