// SPDX-License-Identifier: MIT
/**
 * Bambu-only files that have no Orca equivalent and should be dropped
 * rather than carried into the output.
 *
 * `Metadata/filament_sequence.json`: no Orca equivalent.
 * `Metadata/cut_information.xml`: tracks which objects were created with
 * Bambu Studio's Cut tool. Dropping it is a low-risk experiment against a
 * false "too tall to slice" error that cleared when a cut-tracked object
 * was deleted and re-pasted (which would also discard any cut-history
 * tracking).
 */
export const DROP_FROM_BAMBU = new Set<string>(["Metadata/filament_sequence.json", "Metadata/cut_information.xml"]);

/**
 * Same idea as `DROP_FROM_BAMBU`, but for filenames that vary per
 * plate/object. `Metadata/plate_N.json` is Bambu Studio's own cached
 * slice-result data in BAMBU's coordinate frame -- confirmed as the cause
 * of a false "object too tall to slice" error.
 * The `.py`/`.3mf` patterns catch stray files accidentally dragged into a
 * real-world source file (e.g. a working folder zipped up alongside the
 * actual project). `Metadata/{process,machine,filament}_settings_N.config`
 * are the source slicer's embedded custom presets (about a third of real
 * Bambu Studio projects carry them): they describe the source printer, and
 * Snapmaker Orca would import them as presets. The converter writes its own
 * filament presets in their place.
 */
export const DROP_FROM_BAMBU_PATTERNS: readonly RegExp[] = [
  /^Metadata\/plate_\d+\.json$/,
  /^Metadata\/(?:process|machine|filament)_settings_\d+\.config$/,
  /^Metadata\/.*\.py$/,
  /^Metadata\/.*\.3mf$/,
];

/**
 */
export function shouldDropFromBambu(name: string): boolean {
  if (DROP_FROM_BAMBU.has(name)) return true;
  return DROP_FROM_BAMBU_PATTERNS.some((p) => p.test(name));
}
