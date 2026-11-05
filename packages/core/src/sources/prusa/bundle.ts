// SPDX-License-Identifier: MIT
/**
 * A PrusaSlicer vendor bundle as `any2orca-profiles` ships it
 * (`sources/prusaslicer/<Vendor>.json`): the vendor's print presets as the
 * bundle has them, each with its own keys and its `inherits` list, and the
 * old names `renamed_from` lines map to current ones. Resolving a preset
 * follows PrusaSlicer's own rule (`PresetBundle.cpp`,
 * `flatten_configbundle_hierarchy`): a preset's own keys win, then the last
 * parent listed, down to the first; parents are resolved the same way first.
 */
import "../../zodSetup.js";
import { z } from "zod";

const PRESET_NAME = z.string().min(1).max(200);
const KEY = z.string().regex(/^[a-z_0-9 ]{1,80}$/);

export const PrusaBundleSchema = z
  .object({
    schema: z.literal(1),
    vendor: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
    name: z.string().max(200),
    configVersion: z.string().max(64),
    slicer: z.object({ name: z.string().max(64), repository: z.string().max(200), tag: z.string().max(64), commit: z.string().regex(/^[0-9a-f]{40}$/) }),
    license: z.string().max(64),
    groups: z.array(z.literal("print")).min(1),
    printerModels: z.record(z.string().max(64), z.object({ name: z.string().max(200), variants: z.array(z.string().max(64)).max(100).optional() })),
    presets: z.object({
      print: z.record(PRESET_NAME, z.object({ inherits: z.array(PRESET_NAME).max(20).optional(), values: z.record(KEY, z.string().max(20_000)) })),
    }),
    renamedFrom: z.record(PRESET_NAME, PRESET_NAME),
  })
  .strict();
export type PrusaBundle = z.infer<typeof PrusaBundleSchema>;

/** Deeper than any real bundle; a cycle or a hostile file stops here. */
const MAX_DEPTH = 32;

/**
 * The print preset's full values, with inheritance applied, or null when the
 * bundle doesn't have it. Abstract presets (names in `*`) resolve too; they're
 * what concrete ones inherit from.
 */
export function resolvePrintPreset(bundle: PrusaBundle, name: string): Record<string, string> | null {
  const resolved = new Map<string, Record<string, string> | null>();
  const resolve = (presetName: string, depth: number): Record<string, string> | null => {
    if (depth > MAX_DEPTH) return null;
    if (resolved.has(presetName)) return resolved.get(presetName) ?? null;
    const preset = bundle.presets.print[presetName];
    if (!preset) return null;
    // Marked before the parents are followed, so a cycle resolves to what's been found so far instead of recursing.
    resolved.set(presetName, null);
    const values: Record<string, string> = { ...preset.values };
    // Parents in reverse order, each adding only the keys still missing: own keys, then the last parent, down to the first.
    for (const parent of [...(preset.inherits ?? [])].reverse()) {
      const parentValues = resolve(parent, depth + 1);
      if (!parentValues) continue;
      for (const [key, value] of Object.entries(parentValues)) if (!Object.hasOwn(values, key)) values[key] = value;
    }
    resolved.set(presetName, values);
    return values;
  };
  return resolve(name, 0);
}

/**
 * The bundle's name for a preset name a project recorded: the name itself, a
 * current name for one the bundle renamed, or the preset a project-embedded
 * copy was made from. PrusaSlicer names an embedded copy
 * `<file>.3mf (<preset>)`, nested once more at each re-save
 * (`a.3mf (b.3mf (0.20mm QUALITY @MK3))`), so the innermost name is the one.
 */
export function lookupPrintPresetName(bundle: PrusaBundle, recorded: string): string | null {
  const candidates: string[] = [recorded];
  let inner = recorded;
  for (let i = 0; i < 8; i++) {
    const m = /^.+? \((.+)\)$/.exec(inner);
    if (!m) break;
    inner = m[1];
    candidates.push(inner);
  }
  for (const candidate of candidates) {
    if (Object.hasOwn(bundle.presets.print, candidate) && !candidate.startsWith("*")) return candidate;
    const renamed = bundle.renamedFrom[candidate];
    if (renamed && Object.hasOwn(bundle.presets.print, renamed)) return renamed;
  }
  return null;
}
