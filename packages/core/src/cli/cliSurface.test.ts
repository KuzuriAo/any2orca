// SPDX-License-Identifier: MIT
// The command line's surface, recorded in etc/cli-surface.json: commands, subcommands, every option each
// accepts, and the environment variables the CLI reads. A change shows up as a failure here; when it's meant
// (an addition, or a deprecation the owner agreed to), update the record with `npx vitest run -u` in
// packages/core and commit it with the change.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_SURFACE } from "./surface.js";

const here = dirname(fileURLToPath(import.meta.url));
const sourceFiles = [
  ...readdirSync(here, { recursive: true, encoding: "utf-8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(here, f)),
  join(here, "..", "cli.ts"),
];
const source = sourceFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
const main = readFileSync(join(here, "main.ts"), "utf-8");

/** Every environment variable the CLI's own code reads, by name. */
function environmentVariables(): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/\benv\??\.([A-Z][A-Z0-9_]+)\b/g)) names.add(m[1]);
  for (const m of source.matchAll(/\benv\[\s*"([A-Z][A-Z0-9_]+)"\s*\]/g)) names.add(m[1]);
  return [...names].sort();
}

describe("the command line's surface", () => {
  it("matches the recorded surface", async () => {
    const recorded = { ...CLI_SURFACE, environmentVariables: environmentVariables() };
    await expect(`${JSON.stringify(recorded, null, 2)}\n`).toMatchFileSnapshot(join(here, "..", "..", "etc", "cli-surface.json"));
  });

  it("dispatches every command and subcommand it records", () => {
    for (const [command, spec] of Object.entries(CLI_SURFACE.commands)) {
      expect(main, command).toContain(`case "${command}":`);
      for (const sub of "subcommands" in spec ? spec.subcommands : []) {
        const word = sub.split(" ").pop()!;
        expect(main, `${command} ${sub}`).toMatch(new RegExp(`"${word}"`));
      }
    }
  });

  it("names every option in a help text, so the help can't drift from what's accepted", () => {
    for (const [command, spec] of Object.entries(CLI_SURFACE.commands)) {
      for (const option of Object.keys(spec.options)) expect(main, `${command} --${option}`).toContain(`--${option}`);
    }
  });
});
