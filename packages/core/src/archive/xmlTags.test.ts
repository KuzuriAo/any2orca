// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { objectWorldBboxXY } from "./objectWorldBboxXY.js";
import { parseObjectMetadata } from "./parseObjectMetadata.js";
import { recenterAssembleItems } from "./recenterAssembleItems.js";
import { recenterBuildItems } from "./recenterBuildItems.js";
import { replaceXmlTags, xmlBlockStartingWith, xmlTags } from "./xmlBlocks.js";

const SAMPLE = [
  '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 20 0"/>',
  "<items>not an item</items>",
  '<item\n  objectid="2"\n  transform="1 0 0 0 1 0 0 0 1 1 2 3" />',
  "<item>",
  "<itemx/>",
  "text <item",
].join("\n");

describe("xmlTags", () => {
  it("finds the same tags as /<tag[^>]*>/g, with their attributes and bounds", () => {
    const expected = [...SAMPLE.matchAll(/<item[^>]*>/g)].map((m) => ({ attrs: m[0].slice("<item".length, -1), start: m.index, end: m.index + m[0].length }));
    expect([...xmlTags(SAMPLE, "item")]).toEqual(expected);
    expect(expected.length).toBe(5);
  });

  it("matches the tag name without case when asked, as a pattern with the i flag does", () => {
    const text = '<METADATA name="name">A</METADATA><Metadata key="b"/><metadatum/>';
    expect([...xmlTags(text, "metadata", true)].map((t) => t.attrs)).toEqual([' name="name"', ' key="b"/']);
    expect([...xmlTags(text, "metadata")]).toEqual([]);
  });
});

describe("xmlBlockStartingWith", () => {
  it("returns the same block as the lazy pattern, both tags included", () => {
    const text = '<object id="10" type="x"/><object id="1" type="model"><mesh/></object> <object id="1">later</object>';
    const lazy = (id: string) => new RegExp(`<object id="${id}"[^>]*>[\\s\\S]*?</object>`).exec(text)![0];
    expect(xmlBlockStartingWith(text, "object", 'id="1"')).toBe(lazy("1"));
    expect(xmlBlockStartingWith(text, "object", 'id="10"')).toBe(lazy("10"));
    expect(xmlBlockStartingWith(text, "object", 'id="2"')).toBeNull();
    expect(xmlBlockStartingWith('<object id="1"><object id="1">', "object", 'id="1"')).toBeNull();
  });
});

describe("replaceXmlTags", () => {
  it("makes the same replacements as text.replace(/<tag\\s+[^>]*>/g, fn)", () => {
    const upper = (tag: string) => tag.toUpperCase();
    expect(replaceXmlTags(SAMPLE, "item", upper)).toBe(SAMPLE.replace(/<item\s+[^>]*>/g, upper));
    expect(replaceXmlTags("nothing here", "item", upper)).toBe("nothing here");
  });
});

describe("objectWorldBboxXY's placement lookup", () => {
  it("takes the first item of the object that has a transform, and that tag's last transform, as the greedy pattern did", () => {
    const text = [
      '<object id="1" type="model"><mesh><vertices><vertex x="1" y="2" z="0"/></vertices></mesh></object>',
      '<build><item objectid="1"/><item objectid="1" transform="0 0 0 0 0 0 0 0 0 0 0 0" transform="1 0 0 0 1 0 0 0 1 10 20 0"/></build>',
    ].join("\n");
    expect(objectWorldBboxXY("1", text, new Map(), {})).toEqual([11, 11, 22, 22]);
  });
});

// Each input below took seconds to tens of seconds with the patterns these scanners replaced,
// and would take minutes at the sizes the readers accept; the bound holds the scan linear.
describe("crafted XML with tags that never end", () => {
  const BOUND_MS = 1000;

  it("an object lookup over 80,000 unclosed openers", () => {
    const text = `<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>${'<object id="1" type="model">'.repeat(80_000)}`;
    const started = performance.now();
    expect(objectWorldBboxXY("1", text, new Map(), {})).toBeNull();
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
  });

  it("object names over 40,000 unterminated metadata tags, in the model and in the settings", () => {
    const body = "<metadata ".repeat(40_000);
    const started = performance.now();
    const found = parseObjectMetadata(`<object id="1">${body}</object>`, `<config><object id="1">${body}</object><plate><model_instance>${body}</model_instance></plate></config>`);
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
    expect(found["1"]).toEqual({ name: undefined, isAssembly: false });
  });

  it("recentering over 40,000 unterminated items in each section", () => {
    const warnings: string[] = [];
    const started = performance.now();
    recenterBuildItems(`<build>${"<item ".repeat(40_000)}</build>`, {}, warnings);
    recenterAssembleItems(`<assemble>${"<assemble_item ".repeat(40_000)}</assemble>`, {}, warnings);
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
    expect(warnings).toEqual([]);
  });
});
