// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { bundledProfileSource, dirProfileSource } from "../node.js";
import { loadCatalog, type ProfileCatalog } from "../profiles.js";
import { VERSION } from "../version.js";
import { MAX_UNPACKED_BYTES_LIMIT } from "../archive/safeUnzip.js";
import { runConvert, runWatch, type ConvertOptions } from "./commands/convert.js";
import { runDiff } from "./commands/diff.js";
import {
  presetForConvert,
  presetForDiff,
  runPresetsAdd,
  runPresetsExport,
  runPresetsImport,
  runPresetsList,
  runPresetsRemove,
  runPresetsShow,
  type AboveStockPresetChoice,
  type PresetsCommandOptions,
} from "./commands/presets.js";
import { resolveAboveStockChoice } from "../engine/aboveStock.js";
import { runProfiles } from "./commands/profiles.js";
import { runTelemetryClear, runTelemetrySet, runTelemetryShow, runUpdateCheckSet } from "./commands/telemetry.js";
import { readCliConfig, type Env } from "./config.js";
import { expandInputPatterns } from "./expandWildcards.js";
import { describeFsError, isSamePath } from "./sameFile.js";
import { createLogger } from "./logger.js";
import { createStatsReporter, resolveStatsStatus } from "./stats.js";
import { formatTable } from "./table.js";
import { escapeUnsafeForJson, safeTerminalText } from "./terminalText.js";
import { refreshUpdateCache, updateCheckDisabledReason, updateNotice } from "./updateCheck.js";

export interface CliIo {
  env: Env;
  /** Whether stdout is a terminal (no prompts or update notices otherwise). */
  isTTY: boolean;
  out(line: string): void;
  err(line: string): void;
  fetch?: typeof fetch;
}

const HELP_WIDTH = 100;

/** Option tables with descriptions wrapped to fit HELP_WIDTH columns, continuation lines under the description. */
function formatOptions(entries: [flag: string, description: string][]): string {
  const flagWidth = Math.max(...entries.map(([flag]) => flag.length + 2));
  const indent = flagWidth + 3;
  const wrapWidth = Math.max(40, HELP_WIDTH - indent);
  return formatTable(
    entries.map(([flag, description]) => [`  ${flag}`, wrapText(description, wrapWidth).join(`\n${" ".repeat(indent)}`)]),
    3,
  );
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const TOP_LEVEL_HELP = `any2orca ${VERSION}: convert Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer and Flash Studio .3mf projects to Snapmaker U1 / Orca format, entirely on this machine.

Usage: any2orca <command> [options]

Commands:
${formatOptions([
  ["convert <files...>", "Convert one or more .3mf files (or bundle .zip files of several)"],
  ["diff <a.3mf> <b.3mf>", "Compare the settings of two projects, or one with Snapmaker's stock profile"],
  ["presets add | list | show | ...", "Save your own tuned print settings from a 3MF and convert with them"],
  ["profiles", "List the profiles convert can use"],
  ["telemetry show | on | off | clear", "Show or change usage stats and the update check"],
  ["--version", "Print the version"],
])}

Run "any2orca <command> --help" for a command's options.
Nothing you convert ever leaves this machine. See "any2orca telemetry show" for the
only requests this tool can make.
`;

const DIFF_HELP = `Usage: any2orca diff <a.3mf> <b.3mf> [options]
       any2orca diff <file.3mf> --against-stock [<profile id>] [options]
       any2orca diff <file.3mf> --against-preset <name|file> [options]

Compares project settings the way Snapmaker Orca groups and names them: print
settings, each filament slot, machine settings, and anything that isn't a
Snapmaker Orca setting at all. Only differences are listed unless --all.

--against-stock compares one project with Snapmaker's stock profile: the one
convert would pick for it, or the profile id given (see "any2orca profiles").
It compares print and machine settings; filaments come from the creator, so
add --group filament to compare them too.

--against-preset compares one project with a preset as it converts: its base
profile's stock settings with the preset's changes. Give a saved preset's name
(see "any2orca presets list") or a presets file holding one preset. A preset
holds print settings only, so only those are compared unless you add --group.

Options:
${formatOptions([
  ["--against-stock [<id>]", "Compare one project with Snapmaker's stock profile"],
  ["--against-preset <name|file>", "Compare one project with a saved preset, or a presets file holding one"],
  ["--group <name>", "Only this group: print, filament, machine or other (repeatable)"],
  ["--all", "Also list settings that are the same"],
  ["--sort <order>", "attention (default: values above the U1's limits, then above stock, first), setting (Snapmaker Orca's page order) or status"],
  ["--json", "Print the full result as JSON (format any2orca-diff, version 1)"],
  ["--profiles-dir <dir>", "Use a profile catalog folder instead of the bundled one"],
  ["-h, --help", "Show this help"],
])}

Values are measured against the stock profile compared with (the preset's
base profile for --against-preset, or, for two files, the profile the first
would convert with): a speed or acceleration above the U1's machine limits is
marked "above the U1's limit (capped)", and one above Snapmaker's stock value
"above stock". Those rows come first.

Exit codes: 0 no differences, 1 differences, 2 an error.
`;

const PROFILES_HELP = `Usage: any2orca profiles [options]

Lists the profiles "convert --profile <id>" accepts.

Options:
${formatOptions([
  ["--nozzle <mm>", "Only list profiles for this nozzle diameter, e.g. 0.4"],
  ["--profiles-dir <dir>", "Use a profile catalog folder instead of the bundled one"],
  ["-h, --help", "Show this help"],
])}
`;

const PRESETS_HELP = `Usage: any2orca presets add <name> <tuned.3mf> [--above-stock keep|stock | --keep <settings>] [--force]
       any2orca presets list [--json]
       any2orca presets show <name> [--json]
       any2orca presets remove <name>
       any2orca presets export [<name>...] [--out <file>] [--force]
       any2orca presets import <file> [--above-stock keep|stock | --keep <settings>] [--force]

A preset is your own print settings, applied to other people's models:
make one from a .3mf you tuned in Snapmaker Orca, then convert with
"any2orca convert <files...> --preset <name>". It keeps only the print
settings you changed from the U1 profile the file was tuned on: walls,
infill, supports, speeds, seams and so on. Machine settings, G-code,
filaments and the model's layout are never part of a preset.

Speeds and accelerations above Snapmaker's stock values are listed before
saving, and need a choice: keep them all, use Snapmaker's stock value for
all, or keep only some. The U1's machine limits still cap them.

Presets are saved in ${"$"}ANY2ORCA_CONFIG_DIR/presets (default
~/.config/any2orca/presets), one any2orca-presets file per preset, the same
format the web app exports and imports.

Options:
${formatOptions([
  ["--above-stock keep|stock", "For speeds or accelerations above stock: keep them all, or use Snapmaker's stock value for all"],
  ["--keep <setting,...>", "Keep only these settings above stock (keys, e.g. sparse_infill_speed); the rest use stock"],
  ["--force", "Replace a preset (or export file) with the same name"],
  ["--out <file>", "export: write to this file instead of printing"],
  ["--json", "list, show: print JSON"],
  ["--profiles-dir <dir>", "Use a profile catalog folder instead of the bundled one"],
  ["-h, --help", "Show this help"],
])}
`;

const TELEMETRY_HELP = `Usage: any2orca telemetry show
       any2orca telemetry on | off
       any2orca telemetry clear
       any2orca telemetry update-check on | off

${formatOptions([
  ["show", "What this tool can contact, its current settings, and the stats events it has sent"],
  ["on | off", "Share anonymous usage stats (off unless you turn it on)"],
  ["clear", "Delete the local log of sent stats events"],
  ["update-check on | off", "The once-a-day check for a newer version (on by default)"],
])}

Environment: ANY2ORCA_TELEMETRY=1|0, DO_NOT_TRACK=1 (always off),
ANY2ORCA_STATS_ENDPOINT=<https url> (your own collector), NO_UPDATE_NOTIFIER=1.
`;

const CONVERT_HELP = `Usage: any2orca convert <files...> [options]

Converts .3mf files to Snapmaker U1 / Orca format on this machine. A .zip
bundling several .3mf files (e.g. a "download all variants" archive) is
expanded into a batch automatically. Files are converted one at a time.

* and ? in a file name are expanded by this command, so "models/*.3mf" works in
Command Prompt and PowerShell too (file names only, not folder names).

Arguments:
${formatOptions([["<files...>", "One or more .3mf or bundle .zip files. Omit when using --watch"]])}

Options:
${formatOptions([
  ["--profile <id>", 'Use this profile instead of matching one (see "any2orca profiles")'],
  ["--preset <name|file>", 'Convert with your saved preset (see "any2orca presets"), or a presets file holding one preset: its profile, and its print settings over the creator\'s'],
  ["--above-stock keep|stock", "A --preset file's speeds or accelerations above stock: keep them all, or use stock for all (saved presets were decided when saved)"],
  ["--keep <setting,...>", "A --preset file: keep only these settings above stock; the rest use stock"],
  ["--use-stock <setting,...>", "Use Snapmaker's stock value for these settings instead of the creator's faster one (print speeds, e.g. outer_wall_speed)"],
  ["--keep-higher <setting,...>", "Keep the creator's value for these settings even when higher than stock (accelerations, travel speed, filament_max_volumetric_speed). The U1's machine limits still apply"],
  ["--filament-compliance <mode>", '"generic" or "snapmaker": relabel filament identity for marketplace uploads (e.g. Snapmaker Space). Identity only: never changes temperatures, retraction, flow or other tuning. Omit to keep the source file\'s filament names'],
  ["--high-flow", "All four toolheads have the Snapmaker Liber High Flow Hotend. The converted file records it, so Snapmaker Orca matches your printer; colors you put on a high-flow nozzle when slicing use Snapmaker's high-flow speeds on profiles that have them (today only 0.20mm Standard, 0.4mm nozzle). Gains are largest on big prints with long, continuous paths. Ignored, with a note, on nozzle sizes with no high-flow option"],
  ["--high-flow-toolheads <list>", "Only these toolheads have the Liber hotend, numbered 1 to 4, e.g. 1 or 1,3. Otherwise the same as --high-flow; use one or the other"],
  ["--hardened-nozzle", "Your U1 has hardened steel nozzles instead of the stock stainless steel 0.4. The file records it, so Snapmaker Orca warns about abrasive filaments correctly. Only changes 0.4 nozzle conversions; Snapmaker's other sizes are hardened steel already"],
  ["--explain", "After each file, list what the conversion changed, grouped by why: from the creator's file, kept at Snapmaker's stock value, capped for the U1, set for the firmware, layout, and your choices"],
  ["--explain-json", "Also write that, with every settings difference, to <output>.what-changed.json next to each output (format any2orca-what-changed)"],
  ["--max-unpacked <size>", "The most a project may unpack to, e.g. 4GB or 3000MB (default 2GB, at most 16GB). For a very large project; it needs about twice that much memory"],
  ["--no-stamp", "Leave the small version note (Metadata/any2orca.json) out of the converted file. The note says which any2orca version, profile catalog and options made the file, so it can be traced if a bug turns up; it holds no file names, paths, times or identifiers. The file works the same without it"],
  ["--out-dir <dir>", "Write outputs here instead of next to each input (created if missing)"],
  ["--suffix <text>", 'Output filename suffix (default "_U1"; "" removes it, refused if the output would overwrite the input)'],
  ["--skip-existing", "Skip a file whose output already exists, to resume an interrupted batch"],
  ["--watch <dir>", "Watch this folder and convert each new .3mf/.zip as it appears, until Ctrl+C. Takes no <files...>. Requires --out-dir pointing elsewhere"],
  ["--archive-dir <dir>", "After a file converts, move the original here (created if missing)"],
  ["--log-file <path>", "Append every log line, timestamped, to this file as well"],
  ["--quiet", "No output to the terminal. Requires --log-file"],
  ["--dry-run", "Show which profile each file would use, without writing anything"],
  ["--verbose", "Show the matched profile and the full conversion log"],
  ["--profiles-dir <dir>", "Use a profile catalog folder instead of the bundled one"],
  ["--dry-run-telemetry", "Print the usage stats event for each file instead of sending it"],
  ["--stats-endpoint <url>", "Send opted-in usage stats to your own collector (same as ANY2ORCA_STATS_ENDPOINT)"],
  ["-h, --help", "Show this help"],
])}

Folders that get new files over time: --watch converts each new file as it
settles (Ctrl+C to stop):
  any2orca convert --watch ./exports --out-dir ./converted

Or run a plain convert on a schedule, e.g. from cron:
  */5 * * * *  any2orca convert ./exports/*.3mf --archive-dir ./exports/done \\
                 --out-dir ./converted --log-file ./any2orca.log --quiet

With --watch, --archive-dir or --skip-existing, a small state file
(.any2orca-state.json in the output folder) records each input's outcome by
name, size and modification time, so an unchanged file isn't redone and a
file that failed for a reason retrying can't fix isn't retried forever.
`;

function hasHelpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

async function openCatalog(profilesDir: string | undefined): Promise<ProfileCatalog> {
  return loadCatalog(profilesDir ? dirProfileSource(profilesDir) : bundledProfileSource());
}

/** First interactive run with somewhere to send stats: ask once, default No. */
async function maybeAskAboutStats(io: CliIo): Promise<void> {
  if (!io.isTTY || !process.stdin.isTTY) return;
  if (io.env.ANY2ORCA_TELEMETRY !== undefined || io.env.DO_NOT_TRACK !== undefined || io.env.CI) return;
  if (readCliConfig(io.env).stats) return;
  const status = resolveStatsStatus({ ...io.env, ANY2ORCA_TELEMETRY: "1" });
  if (!status.endpoint) return; // nowhere to send yet, so nothing to ask
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    io.out("any2orca can send a small anonymous usage event after each conversion (profile used, counts, date; never your file).");
    io.out('It also checks npm once a day for a newer version. Details: "any2orca telemetry show".');
    const answer = await rl.question("Help improve any2orca by sharing anonymous usage stats? [y/N] ");
    runTelemetrySet(/^y(es)?$/i.test(answer.trim()) ? "on" : "off", io.env, io.out);
  } finally {
    rl.close();
  }
}

async function runCommand(command: string | undefined, rest: string[], io: CliIo): Promise<number> {
  if (!command || command === "help" || hasHelpFlag([command])) {
    io.out(TOP_LEVEL_HELP);
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    io.out(VERSION);
    return 0;
  }

  switch (command) {
    case "diff": {
      if (hasHelpFlag(rest)) {
        io.out(DIFF_HELP);
        return 0;
      }
      try {
        // --against-stock takes an optional value: the next argument, unless it's a flag or a project file.
        const args = [...rest];
        let againstStock: true | string | undefined;
        const at = args.indexOf("--against-stock");
        if (at !== -1) {
          const next = args[at + 1];
          const takesValue = next !== undefined && !next.startsWith("-") && !/\.(3mf|zip)$/i.test(next);
          againstStock = takesValue ? next : true;
          args.splice(at, takesValue ? 2 : 1);
        }
        const { values, positionals } = parseArgs({
          args,
          allowPositionals: true,
          options: {
            group: { type: "string", multiple: true },
            all: { type: "boolean", default: false },
            sort: { type: "string" },
            json: { type: "boolean", default: false },
            "profiles-dir": { type: "string" },
            "against-preset": { type: "string" },
          },
        });
        const againstPreset = values["against-preset"] !== undefined ? presetForDiff(values["against-preset"], io.env) : undefined;
        const allowed = ["print", "filament", "machine", "other"] as const;
        const groups = values.group?.map((g) => {
          if (!(allowed as readonly string[]).includes(g)) throw new Error(`--group takes print, filament, machine or other, not "${g.slice(0, 40)}"`);
          return g as (typeof allowed)[number];
        });
        const sort = values.sort ?? "attention";
        if (sort !== "attention" && sort !== "setting" && sort !== "status") throw new Error(`--sort takes attention, setting or status, not "${sort.slice(0, 20)}"`);
        return await runDiff(
          { files: positionals, againstStock, againstPreset, groups, json: Boolean(values.json), all: Boolean(values.all), sort, catalog: await openCatalog(values["profiles-dir"]) },
          io.out,
        );
      } catch (err) {
        io.err(`Error: ${describeFsError(err)}`);
        return 2;
      }
    }

    case "presets": {
      const [sub, ...args] = rest;
      if (!sub || hasHelpFlag(rest)) {
        io.out(PRESETS_HELP);
        return 0;
      }
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
          "above-stock": { type: "string" },
          keep: { type: "string", multiple: true },
          force: { type: "boolean", default: false },
          json: { type: "boolean", default: false },
          out: { type: "string" },
          "profiles-dir": { type: "string" },
        },
      });
      const options: PresetsCommandOptions = {
        env: io.env,
        catalog: await openCatalog(values["profiles-dir"]),
        aboveStock: presetAboveStockChoice(values),
        force: Boolean(values.force),
        json: Boolean(values.json),
        ...(values.out ? { out: values.out } : {}),
      };
      const usage = (form: string) => new Error(`Usage: any2orca presets ${form} (see: any2orca presets --help)`);
      switch (sub) {
        case "add":
          if (positionals.length !== 2) throw usage("add <name> <tuned.3mf>");
          return runPresetsAdd(positionals[0], positionals[1], options, io.out);
        case "list":
          return runPresetsList(options, io.out, io.err);
        case "show":
          if (positionals.length !== 1) throw usage("show <name>");
          return runPresetsShow(positionals[0], options, io.out);
        case "remove":
          if (positionals.length !== 1) throw usage("remove <name>");
          return runPresetsRemove(positionals[0], options, io.out);
        case "export":
          return runPresetsExport(positionals, options, io.out);
        case "import":
          if (positionals.length !== 1) throw usage("import <file>");
          return runPresetsImport(positionals[0], options, io.out);
        default:
          throw usage("add | list | show | remove | export | import");
      }
    }

    case "profiles": {
      if (hasHelpFlag(rest)) {
        io.out(PROFILES_HELP);
        return 0;
      }
      const { values } = parseArgs({ args: rest, options: { nozzle: { type: "string" }, "profiles-dir": { type: "string" } } });
      runProfiles(await openCatalog(values["profiles-dir"]), values.nozzle, io.out);
      return 0;
    }

    case "telemetry": {
      const [sub, arg] = rest;
      if (!sub || hasHelpFlag(rest)) {
        io.out(TELEMETRY_HELP);
        return 0;
      }
      if (sub === "show") runTelemetryShow(io.env, io.isTTY, io.out);
      else if (sub === "on" || sub === "off") runTelemetrySet(sub, io.env, io.out);
      else if (sub === "clear") runTelemetryClear(io.env, io.out);
      else if (sub === "update-check" && (arg === "on" || arg === "off")) runUpdateCheckSet(arg === "on", io.env, io.out);
      else throw new Error('Usage: any2orca telemetry show | on | off | clear | update-check on|off (see: any2orca telemetry --help)');
      return 0;
    }

    case "convert": {
      if (hasHelpFlag(rest)) {
        io.out(CONVERT_HELP);
        return 0;
      }
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
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
          "profiles-dir": { type: "string" },
          "dry-run-telemetry": { type: "boolean", default: false },
          "stats-endpoint": { type: "string" },
        },
      });
      if (values.watch !== undefined && positionals.length > 0) {
        throw new Error("--watch takes no file arguments; pass the folder to watch as --watch <dir> (see: any2orca convert --help)");
      }
      if (values.watch === undefined && positionals.length === 0) {
        throw new Error("Usage: any2orca convert <files...> [options] (see: any2orca convert --help)");
      }
      // Command Prompt and PowerShell leave `*.3mf` for the program to expand; a Unix shell already has.
      const inputs = expandInputPatterns(positionals);
      const filamentCompliance = values["filament-compliance"];
      if (filamentCompliance !== undefined && filamentCompliance !== "generic" && filamentCompliance !== "snapmaker") {
        throw new Error(`--filament-compliance must be "generic" or "snapmaker", got "${filamentCompliance}" (see: any2orca convert --help)`);
      }
      if (values["high-flow"] && values["high-flow-toolheads"] !== undefined) {
        throw new Error("Use --high-flow (all four toolheads) or --high-flow-toolheads <list>, not both (see: any2orca convert --help)");
      }
      const highFlow = values["high-flow-toolheads"] !== undefined ? parseHighFlowToolheads(values["high-flow-toolheads"]) : Boolean(values["high-flow"]);
      if (values.quiet && !values["log-file"]) throw new Error("--quiet requires --log-file, otherwise errors would have nowhere to go (see: any2orca convert --help)");
      if (values["out-dir"]) {
        if (existsSync(values["out-dir"]) && !statSync(values["out-dir"]).isDirectory()) throw new Error(`--out-dir must be a folder, got "${values["out-dir"]}"`);
        if (!values["dry-run"]) mkdirSync(values["out-dir"], { recursive: true });
      }
      const archiveDir = values["archive-dir"];
      if (archiveDir) {
        for (const input of inputs) {
          if (isSamePath(dirname(resolve(input)), archiveDir)) throw new Error(`--archive-dir must be a different folder than the one "${input}" is in`);
        }
      }
      // Checks --stats-endpoint/ANY2ORCA_STATS_ENDPOINT up front when stats would send, so a typo fails loudly instead of silently not sending.
      resolveStatsStatus(io.env, values["stats-endpoint"]);

      const catalog = await openCatalog(values["profiles-dir"]);
      if (values.profile && !catalog.get(values.profile) && !catalog.retiredSuccessor(values.profile)) {
        throw new Error(`No profile "${values.profile}". Run "any2orca profiles" for the list.`);
      }
      if (values.profile && values.preset) throw new Error("A preset sets its own profile; use --preset or --profile, not both (see: any2orca convert --help)");
      const preset = values.preset ? await presetForConvert(values.preset, io.env, catalog, presetAboveStockChoice(values)) : undefined;
      const useStock = settingList(values["use-stock"]);
      const keepHigher = settingList(values["keep-higher"]);
      const aboveStock = useStock.length + keepHigher.length > 0 ? { stock: useStock, keep: keepHigher } : undefined;
      // Checked here, so a typo fails before anything converts.
      resolveAboveStockChoice(aboveStock);
      if (!values["dry-run"] && !values["dry-run-telemetry"]) await maybeAskAboutStats(io);

      const logger = createLogger({ logFile: values["log-file"], quiet: Boolean(values.quiet) });
      const options: ConvertOptions = {
        catalog,
        profile: values.profile,
        ...(preset ? { preset } : {}),
        ...(aboveStock ? { aboveStock } : {}),
        filamentCompliance,
        highFlow,
        hardenedNozzle: Boolean(values["hardened-nozzle"]),
        noStamp: Boolean(values["no-stamp"]),
        ...(values["max-unpacked"] !== undefined ? { maxUnpackedBytes: parseMaxUnpacked(values["max-unpacked"]) } : {}),
        explain: Boolean(values.explain),
        explainJson: Boolean(values["explain-json"]),
        outDir: values["out-dir"],
        archiveDir: values["archive-dir"],
        suffix: values.suffix ?? "_U1",
        dryRun: Boolean(values["dry-run"]),
        verbose: Boolean(values.verbose),
        skipExisting: Boolean(values["skip-existing"]),
        watch: values.watch !== undefined,
        logger,
        stats: createStatsReporter({
          env: io.env,
          logger,
          dryRun: Boolean(values["dry-run-telemetry"]),
          ...(values["stats-endpoint"] ? { endpoint: values["stats-endpoint"] } : {}),
          ...(io.fetch ? { fetch: io.fetch } : {}),
        }),
      };

      if (values.watch !== undefined) {
        const folder = values.watch;
        if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`--watch requires an existing folder, got "${folder}"`);
        if (!options.outDir) throw new Error("--watch requires --out-dir pointing somewhere other than the watched folder");
        if (resolve(options.outDir) === resolve(folder) || isSamePath(options.outDir, folder)) throw new Error("--out-dir must be a different folder than the one being watched");
        if (archiveDir && (resolve(archiveDir) === resolve(folder) || isSamePath(archiveDir, folder))) {
          throw new Error("--archive-dir must be a different folder than the one being watched");
        }
        await runWatch(folder, options);
      }

      const summary = await runConvert(inputs, options);
      return summary.failed > 0 ? 1 : 0;
    }

    default:
      io.err(`Unknown command "${command}".\n`);
      io.out(TOP_LEVEL_HELP);
      return 1;
  }
}

const UPDATE_CHECK_COMMANDS = new Set(["convert", "diff", "presets", "profiles"]);

/** Runs the CLI and returns its exit code. Never calls process.exit, so tests can drive it. */
export async function runCli(argv: string[], rawIo: CliIo): Promise<number> {
  // Everything printed passes through here, so text from files can't carry terminal control codes.
  // --json output is for programs: unsafe characters stay, as JSON escapes, so the data isn't changed.
  const json = argv.includes("--json");
  const io: CliIo = { ...rawIo, out: (line) => rawIo.out(json ? escapeUnsafeForJson(line) : safeTerminalText(line)), err: (line) => rawIo.err(safeTerminalText(line)) };
  const flagDisabled = argv.includes("--no-update-notifier");
  const args = argv.filter((a) => a !== "--no-update-notifier");
  // Only for real work: not for the version, help, telemetry settings (including turning the check off) or a mistyped command.
  const worthChecking = UPDATE_CHECK_COMMANDS.has(args[0] ?? "") && !hasHelpFlag(args.slice(1));
  const updatesOff = !worthChecking || updateCheckDisabledReason({ env: io.env, isTTY: io.isTTY, flagDisabled }) !== null;
  const notice = updatesOff ? null : updateNotice(io.env);
  if (!updatesOff && readCliConfig(io.env).updateCheck?.lastCheckedAt === undefined) {
    io.err('Note: any2orca checks npm once a day for a newer version (package name only). Turn off: any2orca telemetry update-check off');
  }
  const refresh = updatesOff ? Promise.resolve() : refreshUpdateCache(io.env, io.fetch);

  let code: number;
  try {
    code = await runCommand(args[0], args.slice(1), io);
  } catch (err) {
    io.err(`Error: ${describeFsError(err)}`);
    code = 1;
  }
  await refresh;
  if (notice) io.err(`\n${notice}`);
  return code;
}

/** `--keep a,b --keep c` -> ["a", "b", "c"]. */
function settingList(raw: readonly string[] | undefined): string[] {
  return (raw ?? []).flatMap((value) => value.split(",")).map((key) => key.trim()).filter(Boolean);
}

/** --above-stock keep|stock and --keep <settings>. */
function presetAboveStockChoice(values: { "above-stock"?: string; keep?: string[] }): AboveStockPresetChoice {
  const mode = values["above-stock"];
  if (mode !== undefined && mode !== "keep" && mode !== "stock") throw new Error(`--above-stock takes keep or stock, not "${mode.slice(0, 20)}"`);
  const keep = settingList(values.keep);
  if (mode && keep.length > 0) throw new Error("Use --above-stock or --keep, not both.");
  return keep.length > 0 ? { keep } : mode ? { mode } : {};
}

const TOOLHEADS = 4;

/**
 * `--max-unpacked 4GB` -> bytes. Takes a number with GB or MB (or plain
 * bytes), from 1 MB to the library's 16 GB ceiling; anything else is refused
 * with the reason, never rounded into range.
 */
export function parseMaxUnpacked(raw: string): number {
  const usage = `--max-unpacked takes a size from 1MB to ${MAX_UNPACKED_BYTES_LIMIT / 1024 ** 3}GB, e.g. 4GB or 3000MB`;
  const match = raw.length <= 32 ? /^\s*(\d+(?:\.\d+)?)\s*(GB|MB|B)?\s*$/i.exec(raw) : null;
  if (!match) throw new Error(`${usage}; got "${raw.slice(0, 32)}"`);
  const unit = (match[2] ?? "B").toUpperCase();
  const bytes = Math.floor(Number(match[1]) * (unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : 1));
  if (bytes < 1024 ** 2 || bytes > MAX_UNPACKED_BYTES_LIMIT) throw new Error(`${usage}; got "${raw}"`);
  return bytes;
}

/**
 * `--high-flow-toolheads 1,3` -> `[true, false, true, false]`. Toolheads are
 * numbered 1 to 4 as on the printer. Rejects anything else (empty entries,
 * duplicates, numbers out of range) instead of guessing, since a wrong
 * hotend choice changes the speeds a toolhead prints at.
 */
export function parseHighFlowToolheads(raw: string): boolean[] {
  const usage = `--high-flow-toolheads takes toolhead numbers 1 to ${TOOLHEADS}, comma-separated, e.g. 1 or 1,3`;
  if (raw.length > 32) throw new Error(`${usage}; got a value that is too long`);
  const parts = raw.split(",").map((part) => part.trim());
  const selection = new Array<boolean>(TOOLHEADS).fill(false);
  for (const part of parts) {
    if (!/^[1-9]$/.test(part) || Number(part) > TOOLHEADS) throw new Error(`${usage}; got "${raw}"`);
    const index = Number(part) - 1;
    if (selection[index]) throw new Error(`${usage}; toolhead ${part} is listed twice`);
    selection[index] = true;
  }
  return selection;
}
