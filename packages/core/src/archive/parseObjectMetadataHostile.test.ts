// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseObjectMetadata } from "./parseObjectMetadata.js";

describe("parseObjectMetadata on hostile XML", () => {
  it("stays linear on many unclosed <object openers", () => {
    const openers = '<object id="1">'.repeat(40_000); // ~600 KB; the old pattern took several seconds
    const started = performance.now();
    parseObjectMetadata(openers, openers);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("still reads ordinary object blocks", () => {
    const model = '<object id="3" type="model"><metadata name="name">Cube</metadata><component objectid="1"/></object>';
    const settings = '<config><object id="3"><metadata key="name" value="Renamed"/></object></config>';
    expect(parseObjectMetadata(model, settings)["3"]).toMatchObject({ name: "Renamed", isAssembly: true });
  });
});
