// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { decodeStamp, encodeStamp, type OutputStamp } from "./stamp.js";

const stamp: OutputStamp = {
  stamp: 1,
  generator: "any2orca",
  version: "0.1.0",
  profiles: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
  profileId: "snapmaker-u1-0.4-standard",
  options: { highFlowHotends: false, hardenedNozzles: false, filamentComplianceMode: null },
};
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("decodeStamp", () => {
  it("reads back what encodeStamp wrote", () => {
    expect(decodeStamp(encodeStamp(stamp))).toEqual(stamp);
  });

  it("returns null for anything that isn't a readable note", () => {
    expect(decodeStamp(undefined)).toBeNull();
    expect(decodeStamp(new TextEncoder().encode("not json"))).toBeNull();
    expect(decodeStamp(bytes({ ...stamp, generator: "other" }))).toBeNull();
    expect(decodeStamp(new Uint8Array(64 * 1024 + 1))).toBeNull();
  });

  it("refuses a note whose text carries control characters or direction overrides", () => {
    expect(decodeStamp(bytes({ ...stamp, version: "0.1.0\u001b]52;c;ZXZpbA==\u0007" }))).toBeNull();
    expect(decodeStamp(bytes({ ...stamp, profiles: { ...stamp.profiles, tracks: "Snapmaker\nOrca" } }))).toBeNull();
    expect(decodeStamp(bytes({ ...stamp, profileId: "snapmaker‮u1" }))).toBeNull();
  });

  it("still reads a note from a later release that adds fields", () => {
    expect(decodeStamp(bytes({ ...stamp, future: { anything: true } }))).toEqual(stamp);
  });
});
