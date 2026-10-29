// SPDX-License-Identifier: MIT
import { xmlBlocks } from "./xmlBlocks.js";

/**
 * Map objectid -> plate index (1-based) from `<plate><model_instance>`
 * metadata in `model_settings.config`.
 *
 */
export function parsePlateAssignments(modelSettingsText: string): Record<string, number> {
  const plates = [...xmlBlocks(modelSettingsText, "plate")].map((block) => block.body);
  const assignment: Record<string, number> = {};
  plates.forEach((plate, i) => {
    const plateIndex = i + 1;
    for (const m of plate.matchAll(/key="object_id" value="(\d+)"/g)) {
      assignment[m[1]] = plateIndex;
    }
  });
  return assignment;
}
