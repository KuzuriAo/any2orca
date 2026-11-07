// SPDX-License-Identifier: MIT
// What every committed test project converts to, file by file inside the converted 3MF: its size and a hash
// of its contents, recorded in test-fixtures/expected/outputs.json. Converted files must not change by
// accident: when this fails, read which project and which file changed. If the change is meant, update the
// record with `npx vitest run -u` in packages/core, and give the change a changeset marked Output-affecting.
//
// The stamp's version fields are blanked first, so a release alone changes nothing here; hashes are of the
// unpacked contents, so the zip's compression doesn't matter.
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "./index.js";
import { STAMP_PATH } from "./stamp.js";
import { readFixture, testProfileSource } from "./test-helpers.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "test-fixtures");
const projects = ["sources", "prusaslicer"].flatMap((dir) =>
  readdirSync(join(fixtures, dir))
    .filter((f) => f.endsWith(".3mf"))
    .sort()
    .map((f) => `${dir}/${f}`),
);

function contents(name: string, bytes: Uint8Array): Uint8Array {
  if (name !== STAMP_PATH) return bytes;
  const stamp = JSON.parse(new TextDecoder().decode(bytes)) as { version?: string; profiles?: { version?: string } };
  stamp.version = "(any2orca version)";
  if (stamp.profiles) stamp.profiles.version = "(catalog version)";
  return new TextEncoder().encode(JSON.stringify(stamp));
}

async function record(project: string): Promise<Record<string, string>> {
  const { output } = await convert(readFixture(project), { profiles: testProfileSource() });
  const files = unzipSync(output);
  return Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((name) => {
        const bytes = contents(name, files[name]!);
        return [name, `${bytes.byteLength} ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`];
      }),
  );
}

describe("converted output of the committed test projects", () => {
  it("covers every committed project", () => {
    expect(projects.length).toBeGreaterThanOrEqual(17);
  });

  it("matches the recorded output, file by file", async () => {
    const all: Record<string, Record<string, string>> = {};
    for (const project of projects) all[project] = await record(project);
    await expect(`${JSON.stringify(all, null, 2)}\n`).toMatchFileSnapshot(join(fixtures, "expected", "outputs.json"));
  }, 120_000);

  it("is the same on a second run, so the record can't flap", async () => {
    const project = projects.find((p) => p.startsWith("prusaslicer/"))!;
    expect(await record(project)).toEqual(await record(project));
  }, 60_000);
});
