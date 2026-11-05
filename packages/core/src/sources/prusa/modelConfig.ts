// SPDX-License-Identifier: MIT
/**
 * Reads `Metadata/Slic3r_PE_model.config`, where PrusaSlicer keeps what the
 * 3MF model file can't: each object's name and per-object settings, and each
 * of its volumes (parts and modifiers) with the triangle range it owns in the
 * object's single mesh, its filament (`extruder`), its matrix, and any
 * per-volume settings.
 *
 * ```xml
 * <config>
 *  <object id="1" instances_count="1">
 *   <metadata type="object" key="name" value="Shape-Box"/>
 *   <metadata type="object" key="extruder" value="2"/>
 *   <volume firstid="0" lastid="11">
 *    <metadata type="volume" key="name" value="Shape-Box"/>
 *    <metadata type="volume" key="volume_type" value="ModelPart"/>
 *    <metadata type="volume" key="extruder" value="0"/>
 *    <mesh .../>
 *   </volume>
 *  </object>
 * </config>
 * ```
 *
 * PrusaSlicer's own XML writer produces this, so a small reader for exactly
 * that shape is enough; it's untrusted input all the same, so everything is
 * bounded and anything unexpected is skipped, never trusted.
 */

export interface PrusaVolume {
  /** The triangle range of this volume in the object's mesh, inclusive. */
  firstTriangle: number;
  lastTriangle: number;
  /** "ModelPart", "NegativeVolume", "ParameterModifier", "SupportEnforcer", "SupportBlocker"; a part when unsaid. */
  volumeType: string;
  /** The filament slot, 1-based; 0 (PrusaSlicer's "default") means the object's. */
  extruder: number;
  name: string;
  /** Per-volume settings besides the ones above, as written (PrusaSlicer keys). */
  settings: Map<string, string>;
}

export interface PrusaObject {
  /** The object id, as in the model file's `<object id>`. */
  id: number;
  name: string;
  /** The filament slot, 1-based; 0 means the printer's default (filament 1). */
  extruder: number;
  volumes: PrusaVolume[];
  /** Per-object settings besides the ones above, as written (PrusaSlicer keys). */
  settings: Map<string, string>;
}

import { xmlBlocks } from "../../archive/xmlBlocks.js";

const MAX_OBJECTS = 10_000;
const MAX_VOLUMES = 10_000;
/** Metadata keys that aren't settings: identity and the volume's own bookkeeping. */
const NOT_SETTINGS = new Set(["name", "extruder", "volume_type", "matrix", "source_file", "source_object_id", "source_volume_id", "source_offset_x", "source_offset_y", "source_offset_z", "source_in_inches", "source_in_meters", "source_is_builtin_volume", "mesh"]);

function metadata(block: string, type: "object" | "volume"): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/<metadata\s+type="(object|volume)"\s+key="([a-z_0-9]{1,80})"\s+value="([^"]*)"\s*\/>/g)) {
    if (m[1] === type) out.set(m[2], decodeXml(m[3]));
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#(\d{1,7}));/g, (_, name: string, code: string) => {
    if (code) return String.fromCodePoint(Math.min(Number(code), 0x10ffff));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name] ?? "";
  });
}

const int = (s: string | undefined, fallback: number): number => {
  const n = Number(s);
  return s !== undefined && /^-?\d{1,9}$/.test(s) ? n : fallback;
};

/**
 * Every object in the config, in file order; an object without a usable id is skipped. The blocks are found in one
 * pass (xmlBlocks): a lazy `<object>[\s\S]*?</object>` pattern rescans the rest of the file for every opener without a
 * closer, which a crafted file turns into minutes.
 */
export function parsePrusaModelConfig(xml: string): PrusaObject[] {
  const objects: PrusaObject[] = [];
  for (const { attrs, body } of xmlBlocks(xml, "object")) {
    if (objects.length >= MAX_OBJECTS) break;
    const id = /^\s*id="(\d{1,9})"/.exec(` ${attrs}`)?.[1] ?? /\bid="(\d{1,9})"/.exec(attrs)?.[1];
    if (!id) continue;
    // Object-level metadata sits outside the volumes; each volume's body is cut out, by its position, so a volume's keys
    // aren't read as the object's. (Searching for each body's text instead rebuilt the object's text once per volume.)
    const volumes: PrusaVolume[] = [];
    const ownPieces: string[] = [];
    let ownFrom = 0;
    for (const v of xmlBlocks(body, "volume")) {
      if (volumes.length >= MAX_VOLUMES) break;
      const first = /\bfirstid="(\d{1,9})"/.exec(v.attrs)?.[1];
      const last = /\blastid="(\d{1,9})"/.exec(v.attrs)?.[1];
      if (first === undefined || last === undefined) continue;
      ownPieces.push(body.slice(ownFrom, v.bodyStart));
      ownFrom = v.bodyEnd;
      const meta = metadata(v.body, "volume");
      volumes.push({
        firstTriangle: int(first, 0),
        lastTriangle: int(last, 0),
        volumeType: meta.get("volume_type") ?? "ModelPart",
        extruder: int(meta.get("extruder"), 0),
        name: meta.get("name") ?? "",
        settings: new Map([...meta].filter(([k]) => !NOT_SETTINGS.has(k))),
      });
    }
    ownPieces.push(body.slice(ownFrom));
    const own = metadata(ownPieces.join(""), "object");
    objects.push({
      id: int(id, 0),
      name: own.get("name") ?? "",
      extruder: int(own.get("extruder"), 0),
      volumes,
      settings: new Map([...own].filter(([k]) => !NOT_SETTINGS.has(k))),
    });
  }
  return objects;
}
