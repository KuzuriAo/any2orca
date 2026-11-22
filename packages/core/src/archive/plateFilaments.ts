// SPDX-License-Identifier: MIT
/**
 * Which filaments each plate of a project uses, how, and between which heights.
 *
 * It follows the slicer's own rule for the filaments a print uses (Snapmaker Orca's `Print::object_extruders` and
 * `support_material_extruders`, and the condition under which `ToolOrdering` applies layer tool changes): each part's
 * filament, or its object's when the part sets none; the filaments painted on it; a filament set for a range of
 * heights; the support and raft filaments where an object has supports; and a tool change at a layer, on a plate
 * that otherwise prints with one filament.
 *
 * The heights are read from the model, not from a slice, so "the most filaments at the same height" is an estimate:
 * a filament counts for the whole span between the lowest and the highest point it is used at.
 *
 * Everything read here comes from the file, which is untrusted: numbers are range-checked, lists are capped, and a
 * file that names more than the caps allow is read up to them.
 */
import { MODEL_SETTINGS_PATH, TOP_MODEL_PATH } from "./paths.js";
import { hasPaintAttribute, scanMeshPaint, type MeshPaint, type PaintRequest } from "./meshPaint.js";
import type { PartPlacement } from "./objectWorldBboxXY.js";
import { xmlBlocks, xmlTags } from "./xmlBlocks.js";

/** How a plate uses a filament, in the order `uses` lists them. */
export const FILAMENT_USES = ["object", "part", "paint", "height-range", "support", "layer-change"] as const;
/** The uses this release of the library reports. */
export type KnownFilamentUse = (typeof FILAMENT_USES)[number];
/**
 * One of {@link FILAMENT_USES}, or a use a later any2orca release added: "object" is an object's own filament,
 * "part" a filament set on one of its parts, "paint" a painted color, "height-range" a filament set for a range of
 * an object's height, "support" its supports or raft, "layer-change" a tool change at a layer.
 */
export type FilamentUse = KnownFilamentUse | (string & {});

/** One filament a plate uses. */
export interface PlateFilamentUse {
  /** The filament's slot, counting from 1 as slicers show them. */
  slot: number;
  /** Every way the plate uses it, in the order of {@link FILAMENT_USES}. */
  uses: FilamentUse[];
  /** The lowest height it is used at, in mm above the plate. */
  from: number;
  /** The highest height it is used at, in mm above the plate. */
  to: number;
}

/** The filaments one plate uses. */
export interface PlateFilaments {
  /** The plate's number, counting from 1. */
  plate: number;
  /** Each filament the plate uses, by slot. Empty for a plate with no objects. */
  filaments: PlateFilamentUse[];
  /**
   * The most filaments the plate needs at the same height: an estimate from the model's geometry, in which a
   * filament counts for the whole span between the lowest and highest point it is used at.
   */
  mostAtOnce: number;
}

const utf8Decoder = new TextDecoder("utf-8");

const LAYER_RANGES_PATH = "Metadata/layer_config_ranges.xml";
const CUSTOM_GCODE_PATH = "Metadata/custom_gcode_per_layer.xml";
/** Small settings files; a larger one isn't read. */
const MAX_AUX_BYTES = 16 * 1024 * 1024;
/** Far past any real project; bounds the lists a crafted file can make this read. */
const MAX_BLOCKS = 20_000;
const MAX_RANGES = 10_000;
const MAX_TOOL_CHANGES = 10_000;
/** A height in mm that a printer could have; anything else in the file isn't a height. */
const MAX_HEIGHT = 100_000;

/** The parts of a model that print with a filament: a negative part cuts, and a blocker or enforcer only steers supports. */
const PRINTING_SUBTYPES: ReadonlySet<string> = new Set(["normal_part", "modifier_part"]);

interface PartSettings {
  id: string;
  subtype: string;
  values: Map<string, string>;
}

interface ObjectSettings {
  values: Map<string, string>;
  parts: PartSettings[];
}

/** The `key="..." value="..."` pairs of the `<metadata>` tags in `text`. */
function metadataValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const { attrs } of xmlTags(text, "metadata")) {
    const key = /(?:^|\s)key="([^"]{1,80})"/.exec(attrs)?.[1];
    const value = /(?:^|\s)value="([^"]{0,200})"/.exec(attrs)?.[1];
    if (key !== undefined && value !== undefined && !values.has(key)) values.set(key, value);
  }
  return values;
}

/** Each wanted object's own settings and its parts', from `model_settings.config`. */
function readObjectSettings(modelSettings: string, wanted: ReadonlySet<string>): Map<string, ObjectSettings> {
  const byId = new Map<string, ObjectSettings>();
  let seen = 0;
  for (const { attrs, body } of xmlBlocks(modelSettings, "object")) {
    if (++seen > MAX_BLOCKS) break;
    const id = /(?:^|\s)id="(\d{1,9})"/.exec(attrs)?.[1];
    if (id === undefined || !wanted.has(id) || byId.has(id)) continue;
    const parts: PartSettings[] = [];
    // The object's own settings are the metadata outside its parts.
    const outside: string[] = [];
    let copiedTo = 0;
    for (const part of xmlBlocks(body, "part")) {
      if (parts.length >= MAX_BLOCKS) break;
      outside.push(body.slice(copiedTo, part.bodyStart));
      copiedTo = part.bodyEnd;
      const partId = /(?:^|\s)id="(\d{1,9})"/.exec(part.attrs)?.[1];
      if (partId === undefined) continue;
      parts.push({ id: partId, subtype: /(?:^|\s)subtype="([a-z_]{1,40})"/.exec(part.attrs)?.[1] ?? "normal_part", values: metadataValues(part.body) });
    }
    outside.push(body.slice(copiedTo));
    byId.set(id, { values: metadataValues(outside.join("")), parts });
  }
  return byId;
}

/**
 * The project's objects in the order the model builds them (its `<item>` list): the order the height ranges file
 * numbers them in, from 1, as the slicer does when it loads one.
 */
function buildOrder(topModel: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const { attrs } of xmlTags(topModel, "item")) {
    const id = /(?:^|\s)objectid="(\d{1,9})"/.exec(attrs)?.[1];
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    if (order.length >= MAX_BLOCKS) break;
  }
  return order;
}

/** A filament number from a setting: a whole number from 0 (none set) up; anything else is 0. */
function filamentNumber(value: unknown): number {
  const text = Array.isArray(value) ? value[0] : value;
  const n = typeof text === "number" ? text : typeof text === "string" && /^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function isOn(value: unknown): boolean {
  const text = typeof value === "string" ? value.trim().toLowerCase() : value;
  return text === "1" || text === "true" || text === 1 || text === true;
}

function positiveNumber(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function height(value: string | undefined): number | null {
  // The slicer writes a height with all the digits a float has ("29.399999618530273").
  if (value === undefined || !/^-?\d{1,7}(\.\d{1,25})?(e-?\d{1,3})?$/i.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= MAX_HEIGHT ? n : null;
}

/** Filament ranges set for a span of an object's height, by the object's position in the project (from 1). */
function readHeightRanges(xml: string): Map<number, Array<{ filament: number; from: number; to: number }>> {
  const ranges = new Map<number, Array<{ filament: number; from: number; to: number }>>();
  let count = 0;
  for (const object of xmlBlocks(xml, "object")) {
    const index = Number(/(?:^|\s)id="(\d{1,9})"/.exec(object.attrs)?.[1] ?? NaN);
    if (!Number.isInteger(index)) continue;
    for (const range of xmlBlocks(object.body, "range")) {
      if (++count > MAX_RANGES) return ranges;
      const from = height(/(?:^|\s)min_z="([^"]{1,40})"/.exec(range.attrs)?.[1]);
      const to = height(/(?:^|\s)max_z="([^"]{1,40})"/.exec(range.attrs)?.[1]);
      if (from === null || to === null || to < from) continue;
      for (const option of xmlBlocks(range.body, "option")) {
        if (!/(?:^|\s)opt_key="extruder"/.test(option.attrs)) continue;
        const filament = filamentNumber(option.body);
        if (filament > 0) ranges.set(index, [...(ranges.get(index) ?? []), { filament, from, to }]);
      }
    }
  }
  return ranges;
}

/** Each plate's tool changes at a layer, lowest first, where the plate's changes are in the mode that applies them. */
function readToolChanges(xml: string): Map<number, Array<{ filament: number; z: number }>> {
  const byPlate = new Map<number, Array<{ filament: number; z: number }>>();
  let count = 0;
  for (const plate of xmlBlocks(xml, "plate")) {
    const id = Number(/<plate_info\s[^>]*?id="(\d{1,6})"/.exec(plate.body)?.[1] ?? NaN);
    if (!Number.isInteger(id) || id < 1) continue;
    // The slicer applies them only in this mode (a plate that prints with one filament on a printer with several).
    if (/<mode\s[^>]*?value="([^"]{1,40})"/.exec(plate.body)?.[1] !== "MultiAsSingle") continue;
    const changes: Array<{ filament: number; z: number }> = [];
    for (const { attrs } of xmlTags(plate.body, "layer")) {
      if (++count > MAX_TOOL_CHANGES) break;
      // Type 2 is a tool change; 0 is a color change by hand and 1 a pause, neither of which is a filament slot.
      if (/(?:^|\s)type="([^"]{1,10})"/.exec(attrs)?.[1] !== "2") continue;
      const z = height(/(?:^|\s)top_z="([^"]{1,40})"/.exec(attrs)?.[1]);
      const filament = filamentNumber(/(?:^|\s)extruder="([^"]{1,10})"/.exec(attrs)?.[1]);
      if (z !== null && z >= 0 && filament > 0) changes.push({ filament, z });
    }
    if (changes.length > 0) byPlate.set(id, changes.sort((a, b) => a.z - b.z));
  }
  return byPlate;
}

/** What {@link readPlateFilaments} reads a project from. */
export interface PlateFilamentsInput {
  zipEntries: Readonly<Record<string, Uint8Array>>;
  /** The settings to read by: the source project's for what the creator's file says, the converted project's for what the U1 prints. */
  projectSettings: Readonly<Record<string, unknown>>;
  /** The project's objects with the plate each is on. */
  objects: ReadonlyArray<{ id: string; plate?: number }>;
  /** Each object's parts as the model places them (the readers' vertex pass). */
  partPlacements?: ReadonlyMap<string, readonly PartPlacement[]>;
  /** How many plates the project has, empty ones included. */
  plateCount: number;
  /** The parts' paint, from {@link readPartPaint}: read once per project, since it scans the meshes. */
  paint: PartPaint;
}

/** Each painted part's paint, by its placement. */
export type PartPaint = ReadonlyMap<PartPlacement, MeshPaint>;

/** How many filaments a project's settings have. */
export function filamentCountOf(projectSettings: Readonly<Record<string, unknown>>): number {
  const colors = projectSettings.filament_colour;
  const names = projectSettings.filament_settings_id;
  return Math.max(1, Array.isArray(colors) ? colors.length : 0, Array.isArray(names) ? names.length : 0);
}

/**
 * The paint of every part whose model file has any: one pass over each such file. A painted filament number above
 * `filamentCount` counts as no paint, as the slicer treats it.
 */
export function readPartPaint(
  zipEntries: Readonly<Record<string, Uint8Array>>,
  objects: ReadonlyArray<{ id: string }>,
  partPlacements: ReadonlyMap<string, readonly PartPlacement[]> | undefined,
  filamentCount: number,
): PartPaint {
  const paintOf = new Map<PartPlacement, MeshPaint>();
  const requestsByFile = new Map<string, Map<string, PaintRequest[]>>();
  const paintedFile = new Map<string, boolean>();
  for (const object of objects) {
    for (const part of partPlacements?.get(object.id) ?? []) {
      const file = part.path ?? TOP_MODEL_PATH;
      const bytes = zipEntries[file];
      if (!bytes) continue;
      if (!paintedFile.has(file)) paintedFile.set(file, hasPaintAttribute(bytes));
      if (!paintedFile.get(file)) continue;
      const result: MeshPaint = { painted: new Map(), unpainted: false, triangles: 0 };
      paintOf.set(part, result);
      const { R, T } = part;
      // The z row of `v * R + T` (transform.ts).
      const request: PaintRequest = { zOf: (x, y, z) => R[0][2] * x + R[1][2] * y + R[2][2] * z + T[2], result };
      const byMesh = requestsByFile.get(file) ?? new Map<string, PaintRequest[]>();
      byMesh.set(part.id, [...(byMesh.get(part.id) ?? []), request]);
      requestsByFile.set(file, byMesh);
    }
  }
  for (const [file, byMesh] of requestsByFile) scanMeshPaint(zipEntries[file]!, byMesh, filamentCount);
  return paintOf;
}

interface Use {
  slot: number;
  use: KnownFilamentUse;
  from: number;
  to: number;
}

/**
 * The most ranges that share a layer, with layers `layerHeight` thick from the plate up. A range counts for every
 * layer it reaches into, so two that meet inside a layer share that layer, and two that meet exactly between layers
 * (one part on top of another) don't; a range with no thickness, a painted top face, say, counts for the layer under it.
 */
function mostAtOnce(ranges: ReadonlyArray<{ from: number; to: number }>, layerHeight: number): number {
  /** A height in layers, snapped to a whole number when it is one but for rounding. */
  const layers = (mm: number) => {
    const q = mm / layerHeight;
    return Math.abs(q - Math.round(q)) < 1e-6 ? Math.round(q) : q;
  };
  const events: Array<[number, number]> = [];
  for (const { from, to } of ranges) {
    let first = Math.floor(layers(from));
    const end = Math.max(1, Math.ceil(layers(to)));
    if (first >= end) first = end - 1;
    events.push([first, 1], [end, -1]);
  }
  // At the same layer an end comes before a start.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let most = 0;
  for (const [, change] of events) {
    open += change;
    if (open > most) most = open;
  }
  return most;
}

const round = (mm: number) => Math.round(mm * 1000) / 1000;

/** Every plate's filaments; see the module comment for what counts and how the heights are read. */
export function readPlateFilaments(input: PlateFilamentsInput): PlateFilaments[] {
  const { zipEntries, projectSettings, objects, paint: paintOf } = input;
  const filamentCount = filamentCountOf(projectSettings);
  /** The slicer prints a filament number the project doesn't have with filament 1. */
  const existing = (filament: number) => (filament > filamentCount ? 1 : filament);
  const layerHeight = positiveNumber(projectSettings.layer_height) || 0.2;

  const modelSettingsBytes = zipEntries[MODEL_SETTINGS_PATH];
  const modelSettings = modelSettingsBytes ? utf8Decoder.decode(modelSettingsBytes) : "";
  const settingsById = readObjectSettings(modelSettings, new Set(objects.map((o) => o.id)));

  const rangesBytes = zipEntries[LAYER_RANGES_PATH];
  const heightRanges = rangesBytes && rangesBytes.length <= MAX_AUX_BYTES ? readHeightRanges(utf8Decoder.decode(rangesBytes)) : new Map<number, Array<{ filament: number; from: number; to: number }>>();
  // Read only for a project that has such ranges: the main model file can be large.
  const topModelBytes = heightRanges.size > 0 ? zipEntries[TOP_MODEL_PATH] : undefined;
  const order = topModelBytes ? buildOrder(utf8Decoder.decode(topModelBytes)) : [];
  const customGcodeBytes = zipEntries[CUSTOM_GCODE_PATH];
  const toolChanges = customGcodeBytes && customGcodeBytes.length <= MAX_AUX_BYTES ? readToolChanges(utf8Decoder.decode(customGcodeBytes)) : new Map<number, Array<{ filament: number; z: number }>>();

  const usesByPlate = new Map<number, Use[]>();
  const topByPlate = new Map<number, number>();
  /** The filaments a plate's objects print with, supports aside: what decides whether its tool changes apply. */
  const objectFilamentsByPlate = new Map<number, Set<number>>();

  for (const object of objects) {
    const plate = object.plate ?? 1;
    const uses = usesByPlate.get(plate) ?? [];
    usesByPlate.set(plate, uses);
    const objectFilaments = objectFilamentsByPlate.get(plate) ?? new Set<number>();
    objectFilamentsByPlate.set(plate, objectFilaments);
    const add = (slot: number, use: KnownFilamentUse, from: number, to: number) => {
      // A height that isn't known (no mesh found) counts from the plate up to where the object is known to end.
      const low = Number.isFinite(from) ? Math.max(0, from) : 0;
      const high = Number.isFinite(to) ? Math.max(low, to) : low;
      uses.push({ slot, use, from: low, to: high });
      if (use !== "support") objectFilaments.add(slot);
    };

    const settings = settingsById.get(object.id);
    const placements = input.partPlacements?.get(object.id) ?? [];
    const objectFilament = filamentNumber(settings?.values.get("extruder"));
    let objectTop = 0;
    for (const p of placements) if (Number.isFinite(p.zMax) && p.zMax > objectTop) objectTop = p.zMax;

    const setting = (key: string): unknown => settings?.values.get(key) ?? projectSettings[key];
    // Paint reaches all the way into a part unless a depth is set; with one, the inside prints with the part's own filament.
    const paintDepthSet = positiveNumber(setting("mmu_segmented_region_max_width")) > 0;

    // Parts: the settings file's list, or, for a part it doesn't name, the model's own.
    const partSettings = new Map((settings?.parts ?? []).map((p) => [p.id, p]));
    const placementById = new Map<string, PartPlacement>();
    for (const p of placements) if (!placementById.has(p.id)) placementById.set(p.id, p);
    const partIds = settings && settings.parts.length > 0 ? settings.parts.map((p) => p.id) : placements.map((p) => p.id);
    if (partIds.length === 0) add(existing(objectFilament || 1), "object", 0, 0);
    for (const partId of partIds) {
      const part = partSettings.get(partId);
      if (part && !PRINTING_SUBTYPES.has(part.subtype)) continue;
      const placement = placementById.get(partId) ?? (placements.length === 1 && partIds.length === 1 ? placements[0] : undefined);
      const from = placement ? placement.zMin : NaN;
      const to = placement ? placement.zMax : objectTop;
      const own = filamentNumber(part?.values.get("extruder"));
      const paint = placement ? paintOf.get(placement) : undefined;
      const found = paint !== undefined && paint.triangles > 0;
      // A part painted all over prints none of its own filament.
      if (!found || paint.unpainted || paintDepthSet) add(existing(own || objectFilament || 1), own > 0 ? "part" : "object", from, to);
      if (found && part?.subtype !== "modifier_part") {
        for (const [filament, [zMin, zMax]] of paint.painted) add(filament, "paint", Number.isNaN(zMin) ? from : zMin, Number.isNaN(zMax) ? to : zMax);
      }
    }
    if (objectTop > (topByPlate.get(plate) ?? 0)) topByPlate.set(plate, objectTop);

    // A filament set for a range of the object's height: the ranges file numbers objects in the order the model builds them.
    const position = order.indexOf(object.id) + 1;
    for (const range of position > 0 ? (heightRanges.get(position) ?? []) : []) add(existing(range.filament), "height-range", range.from, Math.min(range.to, objectTop || range.to));

    // Supports and raft, where the object has them; filament 0 is "whichever is printing", which adds none.
    if (isOn(setting("enable_support")) || positiveNumber(setting("enforce_support_layers")) > 0 || positiveNumber(setting("raft_layers")) > 0) {
      for (const key of ["support_filament", "support_interface_filament"]) {
        const filament = filamentNumber(setting(key));
        if (filament > 0) add(existing(filament), "support", 0, objectTop);
      }
    }
  }

  // Tool changes at a layer, on a plate whose objects print with one filament of a project that has several.
  for (const [plate, changes] of toolChanges) {
    const uses = usesByPlate.get(plate);
    const objectFilaments = objectFilamentsByPlate.get(plate);
    if (!uses || !objectFilaments || objectFilaments.size !== 1 || filamentCount < 2) continue;
    const top = topByPlate.get(plate) ?? 0;
    const first = changes[0]!.z;
    // The plate's own filament prints up to the first change.
    for (const use of uses) if (use.use !== "support" && use.to > first) use.to = Math.max(use.from, first);
    changes.forEach((change, i) => {
      const next = changes[i + 1]?.z ?? Math.max(top, change.z);
      // The change takes effect with the layer that ends at its height.
      uses.push({ slot: existing(change.filament), use: "layer-change", from: Math.max(0, change.z - layerHeight), to: Math.max(change.z, next) });
    });
  }

  const plateCount = Math.min(MAX_BLOCKS, Math.max(1, input.plateCount, ...usesByPlate.keys()));
  const plates: PlateFilaments[] = [];
  for (let plate = 1; plate <= plateCount; plate++) {
    const bySlot = new Map<number, { uses: Set<KnownFilamentUse>; from: number; to: number }>();
    for (const use of usesByPlate.get(plate) ?? []) {
      const known = bySlot.get(use.slot);
      if (known) {
        known.uses.add(use.use);
        known.from = Math.min(known.from, use.from);
        known.to = Math.max(known.to, use.to);
      } else {
        bySlot.set(use.slot, { uses: new Set([use.use]), from: use.from, to: use.to });
      }
    }
    const filaments = [...bySlot.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, { uses, from, to }]): PlateFilamentUse => ({ slot, uses: FILAMENT_USES.filter((u) => uses.has(u)), from: round(from), to: round(to) }));
    plates.push({ plate, filaments, mostAtOnce: mostAtOnce(filaments, layerHeight) });
  }
  return plates;
}
