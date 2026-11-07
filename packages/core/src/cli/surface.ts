// SPDX-License-Identifier: MIT
/**
 * The command line's surface: its commands, subcommands and every option each one accepts. The parser in
 * main.ts reads its options from here, and `cliSurface.test.ts` records the whole table (with the environment
 * variables the CLI reads) in `etc/cli-surface.json`, so a change to what the CLI accepts is deliberate.
 *
 * The surface only grows: add a command, subcommand or option; never rename or remove one outside a major
 * release, and deprecate it first (it keeps working, prints a notice naming its replacement, and is documented).
 */

const PROFILE_OPTIONS = {
  "profiles-dir": { type: "string" },
  "snapmaker-orca-version": { type: "string" },
} as const;

export const DIFF_OPTIONS = {
  group: { type: "string", multiple: true },
  all: { type: "boolean", default: false },
  sort: { type: "string" },
  json: { type: "boolean", default: false },
  ...PROFILE_OPTIONS,
  "against-preset": { type: "string" },
} as const;

export const PRESETS_OPTIONS = {
  "above-stock": { type: "string" },
  keep: { type: "string", multiple: true },
  force: { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  out: { type: "string" },
  ...PROFILE_OPTIONS,
} as const;

export const PROFILES_OPTIONS = {
  nozzle: { type: "string" },
  ...PROFILE_OPTIONS,
} as const;

export const CONVERT_OPTIONS = {
  profile: { type: "string" },
  preset: { type: "string" },
  "above-stock": { type: "string" },
  keep: { type: "string", multiple: true },
  "use-stock": { type: "string", multiple: true },
  "keep-higher": { type: "string", multiple: true },
  "filament-compliance": { type: "string" },
  "high-flow": { type: "boolean", default: false },
  "high-flow-toolheads": { type: "string" },
  "hardened-nozzle": { type: "boolean", default: false },
  "no-stamp": { type: "boolean", default: false },
  "max-unpacked": { type: "string" },
  explain: { type: "boolean", default: false },
  "explain-json": { type: "boolean", default: false },
  "out-dir": { type: "string" },
  suffix: { type: "string", default: "_U1" },
  "dry-run": { type: "boolean", default: false },
  verbose: { type: "boolean", default: false },
  "skip-existing": { type: "boolean", default: false },
  watch: { type: "string" },
  "archive-dir": { type: "string" },
  "log-file": { type: "string" },
  quiet: { type: "boolean", default: false },
  ...PROFILE_OPTIONS,
  "dry-run-telemetry": { type: "boolean", default: false },
  "stats-endpoint": { type: "string" },
} as const;

/** Every command, the words it takes after it, and its options; main.ts dispatches on these names. */
export const CLI_SURFACE = {
  topLevel: ["help", "--help", "-h", "version", "--version", "-v"],
  commands: {
    convert: { positionals: "<files...>", options: CONVERT_OPTIONS },
    // --against-stock takes an optional value, so main.ts reads it before parseArgs.
    diff: { positionals: "<a.3mf> [<b.3mf>]", options: { ...DIFF_OPTIONS, "against-stock": { type: "string", optionalValue: true } } },
    presets: { subcommands: ["add", "list", "show", "remove", "export", "import"], options: PRESETS_OPTIONS },
    profiles: { options: PROFILES_OPTIONS },
    telemetry: { subcommands: ["show", "on", "off", "clear", "update-check on", "update-check off"], options: {} },
  },
} as const;
