// SPDX-License-Identifier: MIT
import { closingTagAt, xmlBlocks, xmlTags } from "./xmlBlocks.js";

/**
 * Extract object names, sequence numbers, and assembly status for each object id from
 * `3D/3dmodel.model` and `Metadata/model_settings.config`.
 */
export interface ObjectMetadata {
  name?: string;
  sequence?: number;
  isAssembly: boolean;
}

/**
 * The attributes of every `<metadata ...>` in `block`, a self-closing tag's `/` removed:
 * what `/<metadata\s+([^>]*?)\/?>/g` captured (the leading whitespace kept, which the
 * attribute lookups don't see), in one pass over the block. That
 * pattern scans to the end of the block for every `<metadata` that has no `>`, which a
 * crafted file turns into minutes (40,000 of them in 0.4 MB took eight seconds).
 */
function* metadataAttrs(block: string): Generator<string> {
  for (const { attrs } of xmlTags(block, "metadata")) {
    if (!/^\s/.test(attrs)) continue;
    yield attrs.endsWith("/") ? attrs.slice(0, -1) : attrs;
  }
}

/**
 * The text of an object's `<metadata ... name="name">text</metadata>` entry, or undefined:
 * the same match as `/<metadata\s+[^>]*?name="name"[^>]*>([^<]+)<\/metadata>/i`, in one pass.
 */
function metadataNameText(body: string): string | undefined {
  for (const { attrs, end } of xmlTags(body, "metadata", true)) {
    if (!/^\s/.test(attrs) || !/name="name"/i.test(attrs)) continue;
    const textEnd = body.indexOf("<", end);
    if (textEnd === -1 || textEnd === end || !closingTagAt(body, textEnd, "metadata")) continue;
    return body.slice(end, textEnd).trim();
  }
  return undefined;
}

export function parseObjectMetadata(
  topModelText: string,
  modelSettingsText?: string,
): Record<string, ObjectMetadata> {
  const result: Record<string, ObjectMetadata> = {};

  // Helper to extract an attribute value regardless of position or quote style
  function getAttr(attrString: string, attrName: string): string | undefined {
    const match = new RegExp(`\\b${attrName}=["']([^"']+)["']`, "i").exec(attrString);
    return match ? match[1].trim() : undefined;
  }

  // 1. Parse top-level <object> blocks from 3D/3dmodel.model
  for (const { attrs, body } of xmlBlocks(topModelText, "object")) {
    const id = getAttr(attrs, "id");
    if (!id) continue;

    // Check if it's an assembly (has <component> children)
    const hasComponents = /<component\s/i.test(body);

    // Check name in attribute: name="..." or <metadata name="name">...</metadata>
    let name = getAttr(attrs, "name");
    if (!name) {
      name = metadataNameText(body);
    }

    result[id] = {
      name,
      isAssembly: hasComponents,
    };
  }

  // 2. Parse Metadata/model_settings.config
  if (modelSettingsText) {
    // Check <object id="..."> blocks containing <metadata key="name" value="..."/>
    for (const { attrs, body } of xmlBlocks(modelSettingsText, "object")) {
      const id = getAttr(attrs, "id");
      if (!id) continue;

      let name = getAttr(attrs, "name");
      if (!name) {
        for (const metaAttrs of metadataAttrs(body)) {
          const key = getAttr(metaAttrs, "key") || getAttr(metaAttrs, "name");
          const val = getAttr(metaAttrs, "value");
          if (key === "name" || key === "object_name") {
            name = val;
            break;
          }
        }
      }

      if (name) {
        if (result[id]) {
          result[id].name = name;
        } else {
          result[id] = { name, isAssembly: false };
        }
      }
    }

    // Check <plate> blocks to assign 1-based sequence order per plate
    for (const { body: plateBlock } of xmlBlocks(modelSettingsText, "plate")) {
      let seqIndex = 1;
      for (const { body: block } of xmlBlocks(plateBlock, "model_instance")) {
        let objectId: string | undefined;
        let instName: string | undefined;

        for (const metaAttrs of metadataAttrs(block)) {
          const key = getAttr(metaAttrs, "key") || getAttr(metaAttrs, "name");
          const val = getAttr(metaAttrs, "value");
          if (!key || !val) continue;

          if (key === "object_id") {
            objectId = val;
          } else if (key === "name" || key === "object_name") {
            instName = val;
          }
        }

        if (objectId) {
          const seq = seqIndex++;
          if (result[objectId]) {
            result[objectId].sequence = seq;
            if (instName && !result[objectId].name) {
              result[objectId].name = instName;
            }
          } else {
            result[objectId] = {
              name: instName,
              sequence: seq,
              isAssembly: false,
            };
          }
        }
      }
    }
  }

  return result;
}
