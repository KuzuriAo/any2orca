// SPDX-License-Identifier: MIT
import { fmtNum } from "./fmtNum.js";
import { replaceXmlTags } from "./xmlBlocks.js";

/**
 * Same idea as `recenterBuildItems`, but for `<assemble_item>` entries
 * inside `<assemble>` in `model_settings.config`. Only shifts items that
 * carry an `instance_id` attribute (matched to `shifts` by
 * `object_id="(\d+)"`); items without one are left untouched.
 *
 * Same regex-surgery-not-DOM caveat as `recenterBuildItems` applies.
 */
export function recenterAssembleItems(
  configXmlText: string,
  shifts: Readonly<Record<string, readonly [number, number]>>,
  warnings: string[],
): string {
  const start = configXmlText.indexOf("<assemble>");
  if (start === -1) return configXmlText;
  const end = configXmlText.indexOf("</assemble>", start);
  if (end === -1) return configXmlText;

  const section = configXmlText.slice(start, end);
  let shifted = 0;
  let skippedRelative = 0;

  // One pass over the tags: `/<assemble_item\s+[^>]*>/g` scanned to the end of the section for every
  // `<assemble_item` without a `>`, which a crafted file turned into minutes.
  const newSection = replaceXmlTags(section, "assemble_item", (fullTag) => {
    if (!fullTag.includes("instance_id")) {
      skippedRelative++;
      return fullTag;
    }

    const oidMatch = fullTag.match(/object_id="(\d+)"/);
    const transMatch = fullTag.match(/transform="([^"]+)"/);
    if (!transMatch) return fullTag;

    const oid = oidMatch ? oidMatch[1] : null;
    const [dx, dy] = oid !== null ? (shifts[oid] ?? [0, 0]) : [0, 0];

    const transformStr = transMatch[1];
    const tokens = transformStr.split(/\s+/).filter(Boolean);
    if (tokens.length !== 12) {
      warnings.push(`  WARN: unexpected assemble transform format on object ${oid}`);
      return fullTag;
    }

    const tx = Number(tokens[9]);
    const ty = Number(tokens[10]);
    // A token that isn't a number would be written back as "NaN"; the placement is left as it is instead.
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      warnings.push(`  WARN: object ${oid}'s assemble transform holds a value that isn't a number, so its placement is left as it is.`);
      return fullTag;
    }
    tokens[9] = fmtNum(tx + dx);
    tokens[10] = fmtNum(ty + dy);
    shifted++;

    const newTransform = tokens.join(" ");
    return fullTag.replace(`transform="${transformStr}"`, `transform="${newTransform}"`);
  });

  if (shifted) {
    warnings.push(`  Recentered ${shifted} assemble_item(s) in model_settings.config.`);
  }
  if (skippedRelative) {
    warnings.push(`  Left ${skippedRelative} assemble_item(s) untouched.`);
  }

  return configXmlText.slice(0, start) + newSection + configXmlText.slice(end);
}
