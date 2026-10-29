// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Inspection } from "any2orca";

export const NON_U1_REASON = "Convert it first, then tune it in Snapmaker Orca.";

export interface LoadedProjectFile {
  file: File;
  name?: string;
  inspection?: Inspection | null;
  isConvertedOutput?: boolean;
}

export interface OfferedPresetFile {
  file: File;
  name: string;
  isU1: boolean;
  disabled: boolean;
  disabledReason?: string;
  isConvertedOutput?: boolean;
}

/**
 * Determines if an inspection is for a Snapmaker U1 project.
 * Uses core inspection properties without guessing from file names or slicer strings.
 */
export function isU1Inspection(inspection?: Inspection | null): boolean {
  if (!inspection) return false;
  if (inspection.sourceVendor === "snapmaker") return true;
  if (typeof inspection.printerModel === "string" && /snapmaker\s*u1/i.test(inspection.printerModel)) {
    return true;
  }
  return false;
}

/**
 * Returns offered preset files for display in the "Use a file you've already loaded" control.
 * Non-U1 source files (Bambu, Creality, Anycubic) are marked disabled with the guidance reason.
 * Converted outputs and Snapmaker Orca projects are marked enabled.
 */
export function getOfferedPresetFiles(
  candidates: Array<LoadedProjectFile | File> | null | undefined
): OfferedPresetFile[] {
  if (!candidates || candidates.length === 0) return [];

  return candidates.map((item) => {
    const isFile = item instanceof File;
    const file = isFile ? item : item.file;
    const name = isFile ? item.name : (item.name || item.file.name);
    const isConverted = !isFile && Boolean(item.isConvertedOutput);
    const inspection = isFile ? ((item as any).inspection ?? null) : (item.inspection ?? null);

    let isU1 = false;
    if (isConverted || (isFile && (item as any).isConvertedOutput)) {
      isU1 = true;
    } else if (inspection) {
      isU1 = isU1Inspection(inspection);
    } else if (isFile && typeof (item as any).isU1 === "boolean") {
      isU1 = (item as any).isU1;
    } else if (isFile && typeof (item as any).sourceVendor === "string") {
      isU1 = (item as any).sourceVendor === "snapmaker";
    }

    return {
      file,
      name,
      isU1,
      disabled: !isU1,
      ...(isU1 ? {} : { disabledReason: NON_U1_REASON }),
      isConvertedOutput: isConverted,
    };
  });
}

