// SPDX-License-Identifier: MIT
/**
 * The pattern an `Application` value must match: a slicer's name, a dash and
 * its version, as Snapmaker Orca writes it (`Snapmaker_Orca-2.4.0`). Checked
 * when a catalog is loaded, since the value is written into the file's XML.
 */
export const APPLICATION_VALUE = /^[A-Za-z][A-Za-z0-9_.+]{0,39}-\d+(\.\d+){1,3}$/;

/**
 * Rewrites `<metadata name="Application">` in `3D/3dmodel.model` to name the
 * slicer release the converted file's settings come from, copying what that
 * release writes in its own saves. Only the value changes; every other byte of the file stays as it was. A no-op when
 * the file has no Application line.
 */
export function setApplicationMetadata(topModelText: string, application: string): string {
  if (!APPLICATION_VALUE.test(application)) throw new Error(`Not a slicer name and version: "${application.slice(0, 64)}"`);
  return topModelText.replace(/(<metadata name="Application">)[^<]*(<\/metadata>)/, `$1${application}$2`);
}
