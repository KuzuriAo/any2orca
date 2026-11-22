// SPDX-License-Identifier: MIT
// Which filaments each plate uses: read from the shared scene's seven-plate save (test-fixtures/sources/README.md,
// "The prime tower plates") and from copies of it with one thing changed. Snapmaker Orca 2.4.1's slices of the
// converted fixture use the same filaments on every plate that slices, and the same number at one height.
import { strFromU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert, FILAMENT_USES, inspect, type PlateFilaments } from "./index.js";
import type { ProfileSource } from "./profiles.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const FIXTURE = "sources/bambu-studio-2.9.1.70-polymaker-prime-tower.3mf";
const MODEL_SETTINGS = "Metadata/model_settings.config";
const PROJECT_SETTINGS = "Metadata/project_settings.config";
const enc = new TextEncoder();

/** The fixture with some entries edited (or added, when the fixture has none of that name). */
function edited(edits: Record<string, (text: string) => string>, file = FIXTURE): Uint8Array {
  const entries = unzipSync(readFixture(file));
  for (const [name, edit] of Object.entries(edits)) {
    const before = entries[name] ? strFromU8(entries[name]) : "";
    const after = edit(before);
    if (after === before) throw new Error(`the edit of ${name} changed nothing`);
    entries[name] = enc.encode(after);
  }
  return zipSync(entries);
}

/** Sets one project setting. */
const setting = (key: string, value: string) => (text: string) => JSON.stringify({ ...(JSON.parse(text) as Record<string, unknown>), [key]: value });

/** Each plate as "slot:uses" entries, for comparing at a glance. */
function summary(plates: readonly PlateFilaments[] | undefined): Record<number, string[]> {
  return Object.fromEntries((plates ?? []).map((p) => [p.plate, p.filaments.map((f) => `${f.slot}:${f.uses.join("+")}`)]));
}

const plate = (plates: readonly PlateFilaments[] | undefined, number: number) => plates!.find((p) => p.plate === number)!;

describe("the filaments each plate uses", () => {
  it("reads every plate of the scene: its objects' filaments, and the one painted on a face of plate 3's cube", () => {
    const { plateFilaments } = inspect(readFixture(FIXTURE));
    expect(summary(plateFilaments)).toEqual({
      1: ["1:object", "2:object", "3:object"],
      2: ["4:object"],
      3: ["1:object", "2:object", "3:paint"],
      4: ["1:object", "2:object"],
      5: ["1:object", "2:object"],
      6: ["1:object", "2:object", "3:object", "5:object", "6:object"],
      7: ["1:object", "2:object"],
    });
    expect(plateFilaments!.map((p) => p.mostAtOnce)).toEqual([3, 1, 3, 2, 2, 5, 2]);
    // The cube and cylinder are 25.6 mm tall; plate 1's disc, scaled to three times its size, 0.9 mm.
    expect(plate(plateFilaments, 1).filaments).toEqual([
      { slot: 1, uses: ["object"], from: 0, to: 25.6 },
      { slot: 2, uses: ["object"], from: 0, to: 25.6 },
      { slot: 3, uses: ["object"], from: 0, to: 0.9 },
    ]);
    // The painted face is a side of the cube, so the paint runs its whole height.
    expect(plate(plateFilaments, 3).filaments[2]).toEqual({ slot: 3, uses: ["paint"], from: 0, to: 25.6 });
  });

  it("lists an empty plate with no filaments", () => {
    const bytes = edited({ [MODEL_SETTINGS]: (t) => t.replace("</plate>", "</plate>\n  <plate>\n    <metadata key=\"plater_id\" value=\"99\"/>\n  </plate>") });
    const { plateFilaments, plateCount } = inspect(bytes);
    expect(plateCount).toBe(8);
    expect(plateFilaments).toHaveLength(8);
    expect(plateFilaments!.filter((p) => p.filaments.length === 0).map((p) => p.mostAtOnce)).toEqual([0]);
  });

  it("names the uses it knows in a fixed order", () => {
    expect(FILAMENT_USES).toEqual(["object", "part", "paint", "height-range", "support", "layer-change"]);
  });
});

describe("a part's filament", () => {
  /** Plate 1's cube is object 2, with one part, 1, on the object's filament 1. */
  const cubePart = (replacement: string) => (text: string) => text.replace('<part id="1" subtype="normal_part" uuid="9a2abeb2-8c1a-43c8-a887-64eba32337dd">', replacement);

  it("replaces the object's when the part sets its own", () => {
    const bytes = edited({ [MODEL_SETTINGS]: cubePart('<part id="1" subtype="normal_part">\n      <metadata key="extruder" value="5"/>') });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["2:object", "3:object", "5:part"]);
  });

  it("is the object's when the part says 0", () => {
    const bytes = edited({ [MODEL_SETTINGS]: cubePart('<part id="1" subtype="normal_part">\n      <metadata key="extruder" value="0"/>') });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["1:object", "2:object", "3:object"]);
  });

  it.each(["negative_part", "support_blocker", "support_enforcer"])("doesn't count for a %s, which prints nothing", (subtype) => {
    const bytes = edited({ [MODEL_SETTINGS]: cubePart(`<part id="1" subtype="${subtype}">\n      <metadata key="extruder" value="5"/>`) });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["2:object", "3:object"]);
  });

  it("counts for a modifier", () => {
    const bytes = edited({ [MODEL_SETTINGS]: cubePart('<part id="1" subtype="modifier_part">\n      <metadata key="extruder" value="6"/>') });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["2:object", "3:object", "6:part"]);
  });

  it("prints with filament 1 when it names a filament the project doesn't have, as the slicer does", () => {
    const bytes = edited({ [MODEL_SETTINGS]: (t) => t.replace('<metadata key="name" value="Cylinder"/>\n    <metadata key="extruder" value="2"/>', '<metadata key="name" value="Cylinder"/>\n    <metadata key="extruder" value="99"/>') });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["1:object", "3:object"]);
  });
});

describe("paint", () => {
  /** Plate 3's cube is mesh 11 in object_6.model: 12 triangles, two painted with filament 3. */
  const paintAll = (code: string) => (text: string) => text.replace(/ paint_color="[^"]*"/g, "").replace(/(<triangle [^/]*)\/>/g, `$1 paint_color="${code}"/>`);

  it("on every triangle of a part leaves none of the part's own filament", () => {
    const bytes = edited({ "3D/Objects/object_6.model": paintAll("0C") });
    expect(summary(inspect(bytes).plateFilaments)[3]).toEqual(["2:object", "3:paint"]);
  });

  it("on every triangle still leaves the part's own filament inside when the project sets a paint depth", () => {
    const bytes = edited({ "3D/Objects/object_6.model": paintAll("0C"), [PROJECT_SETTINGS]: setting("mmu_segmented_region_max_width", "2") });
    expect(summary(inspect(bytes).plateFilaments)[3]).toEqual(["1:object", "2:object", "3:paint"]);
  });

  it("with a filament past 16 reads its number from the extra digits", () => {
    const bytes = edited({
      "3D/Objects/object_6.model": (t) => t.replaceAll('paint_color="0C"', 'paint_color="EC"'),
      [PROJECT_SETTINGS]: (t) => {
        const settings = JSON.parse(t) as Record<string, unknown>;
        return JSON.stringify({ ...settings, filament_colour: Array.from({ length: 17 }, () => "#112233"), filament_settings_id: Array.from({ length: 17 }, () => "Generic PLA") });
      },
    });
    expect(summary(inspect(bytes).plateFilaments)[3]).toEqual(["1:object", "2:object", "17:paint"]);
  });

  it("with a filament the project doesn't have is no paint", () => {
    const bytes = edited({ "3D/Objects/object_6.model": (t) => t.replaceAll('paint_color="0C"', 'paint_color="EC"') });
    expect(summary(inspect(bytes).plateFilaments)[3]).toEqual(["1:object", "2:object"]);
  });

  it("only on the top face shares the top layer with the part's own filament", () => {
    // The cube's top is at z 25.6; its mesh's vertices at local z 12.8 are the top ones.
    const top = (text: string) => {
      const zs = [...text.matchAll(/<vertex x="[^"]+" y="[^"]+" z="([^"]+)"/g)].map((m) => Number(m[1]));
      let painted = 0;
      const out = text.replace(/ paint_color="[^"]*"/g, "").replace(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g, (tag, a: string, b: string, c: string) => {
        if (![a, b, c].every((v) => zs[Number(v)]! > 12)) return tag;
        painted++;
        return `<triangle v1="${a}" v2="${b}" v3="${c}" paint_color="1C"/>`;
      });
      expect(painted).toBe(2);
      return out;
    };
    const cube = plate(inspect(edited({ "3D/Objects/object_6.model": top })).plateFilaments, 3);
    expect(cube.filaments.find((f) => f.slot === 4)).toEqual({ slot: 4, uses: ["paint"], from: 25.6, to: 25.6 });
    expect(cube.mostAtOnce).toBe(3);
  });
});

describe("supports", () => {
  it("add their filament on every plate when the project has supports on", () => {
    const bytes = edited({ [PROJECT_SETTINGS]: (t) => setting("support_filament", "4")(setting("enable_support", "1")(t)) });
    const plates = inspect(bytes).plateFilaments;
    expect(summary(plates)[4]).toEqual(["1:object", "2:object", "4:support"]);
    // On plate 2 filament 4 is the objects' own as well.
    expect(summary(plates)[2]).toEqual(["4:object+support"]);
    expect(plate(plates, 4).filaments[2]).toMatchObject({ from: 0, to: 25.6 });
  });

  it("add nothing when the support filament is 0, the filament that is printing", () => {
    const bytes = edited({ [PROJECT_SETTINGS]: setting("enable_support", "1") });
    expect(summary(inspect(bytes).plateFilaments)).toEqual(summary(inspect(readFixture(FIXTURE)).plateFilaments));
  });

  it("add nothing while supports are off, whatever filament is set for them", () => {
    const bytes = edited({ [PROJECT_SETTINGS]: setting("support_interface_filament", "5") });
    expect(summary(inspect(bytes).plateFilaments)[4]).toEqual(["1:object", "2:object"]);
  });

  it("count for the one object that turns them on, and for a raft", () => {
    const withObjectSupport = edited({
      [PROJECT_SETTINGS]: setting("support_interface_filament", "5"),
      [MODEL_SETTINGS]: (t) => t.replace('<object id="16">\n    <metadata key="name" value="Cube"/>', '<object id="16">\n    <metadata key="name" value="Cube"/>\n    <metadata key="enable_support" value="1"/>'),
    });
    expect(summary(inspect(withObjectSupport).plateFilaments)[4]).toEqual(["1:object", "2:object", "5:support"]);
    expect(summary(inspect(withObjectSupport).plateFilaments)[5]).toEqual(["1:object", "2:object"]);

    const withRaft = edited({ [PROJECT_SETTINGS]: (t) => setting("support_filament", "6")(setting("raft_layers", "2")(t)) });
    expect(summary(inspect(withRaft).plateFilaments)[5]).toEqual(["1:object", "2:object", "6:support"]);
  });
});

/** Tool changes for plate `plateNumber`, each [height, filament]. */
function toolChanges(plateNumber: number, changes: Array<[number, number]>, mode = "MultiAsSingle"): () => string {
  const layers = changes.map(([z, filament]) => `<layer top_z="${z}" type="2" extruder="${filament}" color="#112233" extra="" gcode="tool_change"/>`).join("\n");
  return () => `<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_layer>\n<plate>\n<plate_info id="${plateNumber}"/>\n${layers}\n<mode value="${mode}"/>\n</plate>\n</custom_gcodes_per_layer>\n`;
}
const CUSTOM_GCODE = "Metadata/custom_gcode_per_layer.xml";

describe("tool changes at a layer", () => {
  it("add their filaments on a plate that otherwise prints with one, each from its height up to the next", () => {
    // Plate 2 prints with filament 4 only.
    const bytes = edited({ [CUSTOM_GCODE]: toolChanges(2, [[5, 1], [10, 2], [15, 3], [20, 5]]) });
    const second = plate(inspect(bytes).plateFilaments, 2);
    expect(second.filaments).toEqual([
      { slot: 1, uses: ["layer-change"], from: 4.8, to: 10 },
      { slot: 2, uses: ["layer-change"], from: 9.8, to: 15 },
      { slot: 3, uses: ["layer-change"], from: 14.8, to: 20 },
      { slot: 4, uses: ["object"], from: 0, to: 5 },
      { slot: 5, uses: ["layer-change"], from: 19.8, to: 25.6 },
    ]);
    // Five filaments on the plate, two in the layer where one hands over to the next.
    expect(second.mostAtOnce).toBe(2);
  });

  it("are read at a height written with every digit a float has, as the slicer writes it", () => {
    // From a real project: one change, at 29.4 mm as a 32-bit float.
    const bytes = edited({ [CUSTOM_GCODE]: () => toolChanges(2, [[5, 2]])().replace('top_z="5"', 'top_z="20.399999618530273"') });
    expect(plate(inspect(bytes).plateFilaments, 2).filaments).toEqual([
      { slot: 2, uses: ["layer-change"], from: 20.2, to: 25.6 },
      { slot: 4, uses: ["object"], from: 0, to: 20.4 },
    ]);
  });

  it("are left out on a plate with several filaments, where the slicer doesn't apply them", () => {
    const bytes = edited({ [CUSTOM_GCODE]: toolChanges(1, [[5, 6]]) });
    expect(summary(inspect(bytes).plateFilaments)[1]).toEqual(["1:object", "2:object", "3:object"]);
  });

  it("are left out in another mode, and so are a pause and a color change by hand", () => {
    expect(summary(inspect(edited({ [CUSTOM_GCODE]: toolChanges(2, [[5, 1]], "MultiExtruder") })).plateFilaments)[2]).toEqual(["4:object"]);
    const pauses = edited({ [CUSTOM_GCODE]: () => toolChanges(2, [[5, 1]])().replace('type="2"', 'type="1"') });
    expect(summary(inspect(pauses).plateFilaments)[2]).toEqual(["4:object"]);
    const colorChange = edited({ [CUSTOM_GCODE]: () => toolChanges(2, [[5, 1]])().replace('type="2"', 'type="0"') });
    expect(summary(inspect(colorChange).plateFilaments)[2]).toEqual(["4:object"]);
  });
});

describe("a filament set for a range of an object's height", () => {
  it("counts between the range's heights, for the object at that place in the project", () => {
    // The ranges file numbers objects in the order the model builds them, from 1: the cone on plate 2 (object 6) is the third.
    const ranges = () => '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="3">\n  <range min_z="5" max_z="10">\n   <option opt_key="extruder">2</option>\n   <option opt_key="layer_height">0.2</option>\n  </range>\n  <range min_z="10" max_z="12">\n   <option opt_key="extruder">0</option>\n  </range>\n </object>\n</objects>\n';
    const second = plate(inspect(edited({ "Metadata/layer_config_ranges.xml": ranges })).plateFilaments, 2);
    expect(second.filaments).toEqual([
      { slot: 2, uses: ["height-range"], from: 5, to: 10 },
      { slot: 4, uses: ["object"], from: 0, to: 25.6 },
    ]);
    expect(second.mostAtOnce).toBe(2);
  });
});

describe("the notes a conversion gives about its plates", () => {
  it("say which plate needs more filaments at once than the U1 has toolheads, first, then what each other plate uses", async () => {
    const { report } = await convert(readFixture(FIXTURE), { profiles: testProfileSource() });
    expect(summary(report.plateFilaments)).toEqual(summary(inspect(readFixture(FIXTURE)).plateFilaments));
    // What a plate's filaments mean for printing it has its own topic, ahead of the settings; what each plate uses is with the plates.
    const plates = report.notes.filter((n) => n.topic === "plate-filaments" || n.topic === "plates");
    expect(plates.map((n) => n.topic)).toEqual(["plate-filaments", "plates", "plates", "plates", "plates", "plates", "plates"]);
    expect(report.notes.findIndex((n) => n.topic === "plate-filaments")).toBeLessThan(report.notes.findIndex((n) => n.topic !== "plate-filaments" && n.topic !== "filament-diameter"));
    expect(plates.map((n) => n.text)).toEqual([
      "Plate 6 needs 5 filaments at the same height (it uses filaments 1, 2, 3, 5 and 6), and the U1 prints with 4 at a time, so it can't print as it is. In Snapmaker Orca, move some of its objects to another plate or use fewer filaments on it.",
      "Plate 1 uses filaments 1, 2 and 3.",
      "Plate 2 uses filament 4.",
      "Plate 3 uses filaments 1, 2 and 3.",
      "Plate 4 uses filaments 1 and 2.",
      "Plate 5 uses filaments 1 and 2.",
      "Plate 7 uses filaments 1 and 2.",
    ]);
    expect(plates[0]!.slots).toEqual([1, 2, 3, 5, 6]);
    expect(plates[2]!.slots).toEqual([4]);
    // Only the plate that can't print as it is counts as a warning.
    expect(report.warnings).toEqual([plates[0]!.text.replace(/\.$/, "")]);
  });

  it("say a plate with more filaments than toolheads, never more than four at once, prints with filament changes", async () => {
    const bytes = edited({ [CUSTOM_GCODE]: toolChanges(2, [[5, 1], [10, 2], [15, 3], [20, 5]]) });
    const { report } = await convert(bytes, { profiles: testProfileSource() });
    const note = report.notes.find((n) => n.text.startsWith("Plate 2"));
    expect(note).toEqual({
      topic: "plate-filaments",
      slots: [1, 2, 3, 4, 5],
      text: "Plate 2 uses 5 filaments (filaments 1, 2, 3, 4 and 5), no more than 2 at the same height. The U1 prints with 4 at a time, so this plate needs filament changes at pauses, which you set up in Snapmaker Orca.",
    });
    expect(report.warnings.some((w) => w.startsWith("Plate 2 uses 5 filaments"))).toBe(true);
  });

  it("say nothing about plates for a project with no more filaments than toolheads", async () => {
    const { report } = await convert(readFixture("sources/bambu-studio-2.9.1.70.3mf"), { profiles: testProfileSource() });
    expect(report.notes.filter((n) => n.topic === "plates")).toEqual([]);
    expect(summary(report.plateFilaments)).toEqual({ 1: ["1:object", "2:object", "3:object"], 2: ["4:object"] });
  });

  it("leave the converted file as it was: the reading changes no byte of the output", async () => {
    const plain = await convert(readFixture(FIXTURE), { profiles: testProfileSource() });
    const again = await convert(readFixture(FIXTURE), { profiles: testProfileSource() });
    expect(again.output).toEqual(plain.output);
  });
});

describe("a PrusaSlicer project", () => {
  it("is read the same way: parts, paint that covers an object, and one object per bed", () => {
    const { plateFilaments } = inspect(readFixture("prusaslicer/prusaslicer-2.9.6-beds.3mf"));
    expect(summary(plateFilaments)).toEqual({
      1: ["1:part", "2:part", "3:part"],
      // The cylinder is painted all over, filament 4 below and 2 above, meeting inside a layer.
      2: ["2:paint", "4:paint"],
      3: ["4:object"],
      4: ["1:object", "3:paint"],
    });
    expect(plateFilaments!.map((p) => p.mostAtOnce)).toEqual([3, 2, 1, 2]);
  });
});

/** The project's settings with more filaments: copies of the first one, in every per-filament list. */
function withFilaments(count: number): (text: string) => string {
  return (text) => {
    const settings = JSON.parse(text) as Record<string, unknown>;
    const n = (settings.filament_colour as string[]).length;
    for (const [key, value] of Object.entries(settings)) {
      if (!Array.isArray(value)) continue;
      if (key === "flush_volumes_matrix" && value.length === n * n) {
        settings[key] = Array.from({ length: count * count }, (_, i) => (Math.floor(i / count) === i % count ? "0" : "300"));
      } else if (value.length === n) {
        settings[key] = [...value, ...Array.from({ length: count - n }, () => value[0] as unknown)];
      } else if (value.length === 2 * n) {
        settings[key] = [...value, ...Array.from({ length: count - n }, () => [value[0], value[1]] as unknown[]).flat()];
      }
    }
    return JSON.stringify(settings);
  };
}

describe("a filament above the number a Snapmaker Orca release prints in shared layers", () => {
  /** Seventeen filaments; plate 3's cube face is painted with filament 17 instead of 3. */
  const paintedWith17 = () => edited({ [PROJECT_SETTINGS]: withFilaments(17), "3D/Objects/object_6.model": (t) => t.replaceAll('paint_color="0C"', 'paint_color="EC"') });

  it("gets a note, first among the notes about plates' filaments, that names the plate, both filaments and the way around it", async () => {
    const { report } = await convert(paintedWith17(), { profiles: testProfileSource() });
    expect(summary(report.plateFilaments)[3]).toEqual(["1:object", "2:object", "17:paint"]);
    const [first] = report.notes.filter((n) => n.topic === "plate-filaments");
    expect(first).toEqual({
      topic: "plate-filaments",
      slots: [17],
      text: "Filament 17 is used on plate 3 together with filament 1. Snapmaker Orca 2.4.1 can leave a filament numbered above 16 out of some layers when the filament 16 numbers below it prints on the same plate, with no message. To avoid it, use another filament slot for one of the two in Snapmaker Orca, or print them on different plates, and check the sliced preview.",
    });
    expect(report.warnings.some((w) => w.startsWith("Filament 17 is used on plate 3"))).toBe(true);
  });

  it("names the release the file is converted for", async () => {
    const { report } = await convert(paintedWith17(), { profiles: testProfileSource(), snapmakerOrcaVersion: "2.4.0" });
    expect(report.notes.find((n) => n.text.startsWith("Filament 17"))?.text).toContain("Snapmaker Orca 2.4.0 can leave a filament numbered above 16 out");
  });

  it("gets no note where it is alone on its plate, or where no plate uses it", async () => {
    // Plate 2's two objects moved from filament 4 to 17: nothing else prints on that plate.
    const alone = edited({ [PROJECT_SETTINGS]: withFilaments(17), [MODEL_SETTINGS]: (t) => t.replaceAll('<metadata key="extruder" value="4"/>', '<metadata key="extruder" value="17"/>') });
    const { report } = await convert(alone, { profiles: testProfileSource() });
    expect(summary(report.plateFilaments)[2]).toEqual(["17:object"]);
    expect(report.notes.some((n) => n.text.includes("numbers below it"))).toBe(false);

    const unused = await convert(edited({ [PROJECT_SETTINGS]: withFilaments(17) }), { profiles: testProfileSource() });
    expect(unused.report.notes.some((n) => n.text.includes("numbers below it"))).toBe(false);
  });

  it("names every plate and filament it concerns, once", async () => {
    const bytes = edited({
      [PROJECT_SETTINGS]: withFilaments(18),
      "3D/Objects/object_6.model": (t) => t.replaceAll('paint_color="0C"', 'paint_color="EC"'),
      // Plate 4's cube (object 16) on filament 18, next to its cylinder on 2.
      [MODEL_SETTINGS]: (t) => t.replace('<object id="16">\n    <metadata key="name" value="Cube"/>\n    <metadata key="extruder" value="1"/>', '<object id="16">\n    <metadata key="name" value="Cube"/>\n    <metadata key="extruder" value="18"/>'),
    });
    const { report } = await convert(bytes, { profiles: testProfileSource() });
    const notes = report.notes.filter((n) => n.text.includes("numbers below it"));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.slots).toEqual([17, 18]);
    expect(notes[0]!.text).toMatch(/^Filaments 17 and 18 are used on plates 3 and 4 together with filaments 1 and 2\. .* use another filament slot for one of the two in Snapmaker Orca, or print them on different plates, and check the sliced preview\.$/);
  });

  it("gets no note where the filament 16 numbers below it isn't on the plate", async () => {
    // Plate 2's cone on filament 17 and its prism on 18: neither 1 nor 2 prints there.
    const bytes = edited({
      [PROJECT_SETTINGS]: withFilaments(18),
      [MODEL_SETTINGS]: (t) => t.replace('<metadata key="name" value="Cone"/>\n    <metadata key="extruder" value="4"/>', '<metadata key="name" value="Cone"/>\n    <metadata key="extruder" value="17"/>').replace('<metadata key="name" value="Hexagonal Prism"/>\n    <metadata key="extruder" value="4"/>', '<metadata key="name" value="Hexagonal Prism"/>\n    <metadata key="extruder" value="18"/>'),
    });
    const { report } = await convert(bytes, { profiles: testProfileSource() });
    expect(summary(report.plateFilaments)[2]).toEqual(["17:object", "18:object"]);
    expect(report.notes.some((n) => n.text.includes("numbers below it"))).toBe(false);
  });

  it("names the filament and its partner where other filaments are on the plate too", async () => {
    // Plate 4's cube (object 16) on filament 18, next to its cylinder on 2; no plate has 17 with 1.
    const bytes = edited({
      [PROJECT_SETTINGS]: withFilaments(18),
      [MODEL_SETTINGS]: (t) => t.replace('<object id="16">\n    <metadata key="name" value="Cube"/>\n    <metadata key="extruder" value="1"/>', '<object id="16">\n    <metadata key="name" value="Cube"/>\n    <metadata key="extruder" value="18"/>'),
    });
    const { report } = await convert(bytes, { profiles: testProfileSource() });
    const note = report.notes.find((n) => n.text.includes("numbers below it"));
    expect(note?.slots).toEqual([18]);
    expect(note?.text).toMatch(/^Filament 18 is used on plate 4 together with filament 2\. /);
  });

  it("gets no note for a release whose catalog names no limit", async () => {
    // The same catalog as a release with the fix would have it: no limit in its slicer entry.
    const source = testProfileSource();
    const fixed: ProfileSource = {
      ...source,
      readIndex: async () => {
        const index = (await source.readIndex()) as { slicer: Record<string, unknown>; releases?: unknown };
        const { sharedLayerFilamentLimit: _limit, ...slicer } = index.slicer;
        return { ...index, slicer };
      },
      readProfile: (id) => source.readProfile(id),
    };
    const { report } = await convert(paintedWith17(), { profiles: fixed });
    expect(summary(report.plateFilaments)[3]).toEqual(["1:object", "2:object", "17:paint"]);
    expect(report.notes.some((n) => n.text.includes("numbers below it"))).toBe(false);
  });
});
