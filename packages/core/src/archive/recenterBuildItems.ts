// SPDX-License-Identifier: MIT
import { fmtNum } from "./fmtNum.js";
import { replaceXmlTags } from "./xmlBlocks.js";

/**
 * Rewrite every `<item ...transform="...">` in the `<build>` section of
 * `3dmodel.model`, adding `(dx, dy)` from `shifts[objectid]` to the
 * translation components (tokens 9 and 10 of the 12-number transform).
 *
 * Deliberately uses regex substitution directly on raw XML text rather
 * than a parsed DOM + re-serialize -- this preserves untouched
 * attributes' exact order/whitespace/quoting byte-for-byte, which a
 * DOM round-trip would not. Do not "upgrade" this to a DOM-based
 * approach; it would silently change bytes that should stay identical.
 *
 * Operates on already-decoded text, not bytes (see `adaptModelSettings`'s
 * doc comment for why).
 */
export function recenterBuildItems(
  modelXmlText: string,
  shifts: Readonly<Record<string, readonly [number, number]>>,
  warnings: string[],
): string {
  const buildStart = modelXmlText.indexOf("<build");
  if (buildStart === -1) return modelXmlText;
  const buildEnd = modelXmlText.indexOf("</build>", buildStart);
  if (buildEnd === -1) return modelXmlText;

  const buildSection = modelXmlText.slice(buildStart, buildEnd);
  let itemCount = 0;

  // One pass over the tags: `/<item\s+[^>]*>/g` scanned to the end of the section for every
  // `<item` without a `>`, which a crafted file turned into minutes.
  const newBuildSection = replaceXmlTags(buildSection, "item", (fullTag) => {
    const oidMatch = fullTag.match(/objectid="(\d+)"/);
    const transMatch = fullTag.match(/transform="([^"]+)"/);
    if (!oidMatch || !transMatch) return fullTag;

    const oid = oidMatch[1];
    const transformStr = transMatch[1];
    const [dx, dy] = shifts[oid] ?? [0, 0];

    const tokens = transformStr.split(/\s+/).filter(Boolean);
    if (tokens.length !== 12) {
      warnings.push(`  WARN: unexpected transform format on object ${oid}`);
      return fullTag;
    }

    const tx = Number(tokens[9]);
    const ty = Number(tokens[10]);
    // A token that isn't a number would be written back as "NaN"; the placement is left as it is instead.
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      warnings.push(`  WARN: object ${oid}'s transform holds a value that isn't a number, so its placement is left as it is.`);
      return fullTag;
    }
    tokens[9] = fmtNum(tx + dx);
    tokens[10] = fmtNum(ty + dy);
    itemCount++;

    const newTransform = tokens.join(" ");
    return fullTag.replace(`transform="${transformStr}"`, `transform="${newTransform}"`);
  });

  if (itemCount) {
    warnings.push(`  Recentered ${itemCount} object placement(s) in 3D/3dmodel.model.`);
  }

  return modelXmlText.slice(0, buildStart) + newBuildSection + modelXmlText.slice(buildEnd);
}
