# any2orca

Convert Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer and Flash Studio `.3mf` projects to Snapmaker U1 / Orca format, entirely on your own machine. One package: a command-line tool, a library for Node and browsers, and a ready-made Web Worker.

Formerly bambu2orca and the `@kuzuri.ao/b2o` CLI. Same conversion, now local: no account, no API key, no quota, and nothing you convert is sent anywhere.

## Command line

```sh
npx any2orca convert model.3mf            # writes model_U1.3mf next to it
npx any2orca convert *.3mf --out-dir converted   # also in Command Prompt and PowerShell
npx any2orca convert bundle.zip           # a zip of several .3mf files is a batch
npx any2orca profiles                     # the profiles --profile accepts
```

Useful options:

| Option | What it does |
|---|---|
| `--profile <id>` | Use this profile instead of matching one |
| `--snapmaker-orca-version <x.y.z>` | Convert for the Snapmaker Orca release you slice with (default: the newest) |
| `--high-flow`, `--high-flow-toolheads 1,3` | All toolheads, or only these, have the Liber High Flow Hotend |
| `--hardened-nozzle` | Your nozzles are hardened steel instead of the stock stainless 0.4 |
| `--filament-compliance generic\|snapmaker` | Rename filaments for Snapmaker Space |
| `--dry-run` | Show what would happen, without writing files |
| `--watch <folder>` | Convert each new file that appears in a folder |
| `--archive-dir <dir>`, `--skip-existing` | For batches: move finished originals away, or skip files already converted |
| `--profiles-dir <dir>` | Use your own profile catalog |

`any2orca convert --help` lists them all. The exit code is 1 if any file failed.

The full reference, with exit codes, the state file and `telemetry`, is in [`docs/cli.md`](https://github.com/KuzuriAo/any2orca/blob/main/docs/cli.md).

## Library

Every exported function and type is in the [API reference](https://docs.any2orca.com). The common paths:

```js
import { readFile, writeFile } from "node:fs/promises";
import { convert } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const { output, report } = await convert(await readFile("model.3mf"), { profiles: bundledProfileSource() });
await writeFile("model_U1.3mf", output);
console.log(report.profile.displayName, report.warnings);
```

In a UI, open once and convert as often as the user changes options:

```js
import { openProject } from "any2orca";

const project = openProject(bytes);
const info = project.inspect(); // plates, objects and footprints, filament colors, nozzle, layer height
const choice = await project.matchProfile(profiles);
const { output, report } = await project.convert({ profiles, profileId: choice.profileId });
```

Profiles come from a source you pass in; the library never fetches anything on its own:

| Source | Use |
|---|---|
| `bundledProfileSource()` from `any2orca/node` | The installed `any2orca-profiles` package |
| `dirProfileSource(dir)` from `any2orca/node` | A catalog folder (newer or custom profiles) |
| `fetchProfileSource(url)` | A copy of `any2orca-profiles/data` served by your site |
| `memoryProfileSource({ index, profiles })` | Data you already have in memory |
| Your own `{ readIndex, readProfile }` | Anything else; add `release(path)` to serve older Snapmaker Orca releases |

A catalog holds the profiles of each Snapmaker Orca release any2orca supports, and conversions use the newest unless you pass `snapmakerOrcaVersion`:

```js
const catalog = await loadCatalog(profiles);
catalog.releases(); // [{ version, application, isDefault }, ...], newest (the default) first
const { output } = await convert(bytes, { profiles: catalog, snapmakerOrcaVersion: "2.4.0" });
```

- **Pick the release the user slices with.** Snapmaker Orca's command line stops at a value an older release doesn't accept.
- **A release the catalog doesn't hold** throws `Any2orcaError` with code `release_not_found`.
- **Everything else that reads profiles** (`matchProfile`, `extractPreset`, `resolvePreset`, `diffReference`) takes the catalog from `catalog.forRelease(version)`.

More in [Snapmaker Orca releases](https://github.com/KuzuriAo/any2orca/blob/main/docs/snapmaker-orca-releases.md).

Never re-implement profile matching in a UI: use `matchProfile()` (or `pickProfile()` and `parseTierName()`), so every UI picks the same profile for the same file.

Presets (your own tuned print settings, applied to other files; see [`docs/presets.md`](https://github.com/KuzuriAo/any2orca/blob/main/docs/presets.md)):

```js
import { extractPreset } from "any2orca";

const { preset, changes, notes } = await extractPreset(tunedBytes, { profiles }); // show changes, ask for a name
const { output, report } = await project.convert({ profiles, preset: { ...preset, name: "My settings" } });
```

More tools:

| Function | What it does | Guide |
|---|---|---|
| `parsePresetFile()`, `serializePresets()` | Read and write the `any2orca-presets` file format, with size and count limits | [Presets](https://github.com/KuzuriAo/any2orca/blob/main/docs/presets.md) |
| `report.whatChanged`, `formatWhatChanged()` | What the conversion changed, grouped by why; as text with `formatWhatChanged()`, and with every difference when you pass `explain: true` | [What changed](https://github.com/KuzuriAo/any2orca/blob/main/docs/what-changed.md) |
| `diffSettings()` | Compare any two sets of settings | [Compare settings](https://github.com/KuzuriAo/any2orca/blob/main/docs/compare-settings.md) |

## Web Worker

```js
import { createConverterWorker } from "any2orca/worker";
import ConverterWorker from "any2orca/worker-entry?worker"; // Vite; or new Worker(new URL(...), { type: "module" })

const converter = createConverterWorker(new ConverterWorker(), { profilesUrl: "/profiles/" });
const { project, inspection } = await converter.open(bytes, { transfer: true });
const { output, report } = await project.convert({ onProgress: (stage) => console.log(stage) });
```

The converter also compares settings (`converter.diff()`), and makes, checks and applies presets (`project.extractPreset()`, `converter.resolvePreset()`, `project.convert({ preset })`).

Copy `node_modules/any2orca-profiles/data/` to your site's `/profiles/` folder. The worker fetches `index.json` and only the profile files it uses.

If the worker fails to load or stops (out of memory on a very large file, say), every call in flight is rejected with a message saying so, and later calls are refused at once: create a new converter to try again.

## Errors and messages

A call that fails throws `Any2orcaError`. Its `code` is stable, so a UI can branch on it:

| Code | Meaning |
|---|---|
| `invalid_file` | Not a readable 3MF: a damaged zip, missing project files, unsafe entries |
| `too_large` | The project unpacks to more than the size limit (2 GB by default) |
| `invalid_project` | A readable 3MF whose settings or objects are malformed or over a limit |
| `profile_not_found` | The profile id isn't in the catalog and wasn't retired |
| `release_not_found` | The Snapmaker Orca release isn't one the catalog holds |
| `profile_data` | The profile catalog itself is missing or malformed |
| `invalid_preset` | A preset or presets file that is malformed, over a limit, or can't be used with the options given |
| `preset_base_unknown` | A preset can't be made from this file: it isn't set up for a profile in the catalog |

The error's message, and every entry in `report.warnings`, is written for the person converting and doesn't name the library. Any app can show it as it is.

## Strict content security policies

The library evaluates no code, so it runs under a policy without `'unsafe-eval'`, such as a browser extension's or any2orca.com's.

- **Why this needs care:** the library checks its input with zod. zod can compile faster parsers with the `Function` constructor, and first calls it once to see whether it may. A strict policy refuses that call and reports a violation.
- **What the library does:** as it loads, before it creates any schema, it turns zod's compiled parsers off (zod's `jitless` setting). Parsing gives the same results, and conversions take the same time.
- **Your own zod schemas:** the setting is shared by every copy of zod in the same page or worker, so they parse the plain way too. To keep compiled parsers for them, call `z.config({ jitless: false })` before importing any2orca.
- **Store linters:** a linter that reads the code instead of running it (Firefox's `web-ext lint`) still reports one `DANGEROUS_EVAL` warning, for zod's check, which never runs. [`examples/plugin-extension`](https://github.com/KuzuriAo/any2orca/tree/main/examples/plugin-extension) removes it with a small Vite plugin, and explains it for a store's reviewers.

## What leaves your machine

Your files never do. The library makes no network requests. The CLI makes at most two kinds:

| Request | Goes to | Sends | When | Turn off |
|---|---|---|---|---|
| Update check | npm registry | the package name | at most once a day, in an interactive terminal, never in CI | `NO_UPDATE_NOTIFIER=1`, `--no-update-notifier`, or `any2orca telemetry update-check off` |
| Usage stats | a collector you set with `ANY2ORCA_STATS_ENDPOINT` | one small event per conversion (`any2orca telemetry show` lists every field) | only if you turn it on | off unless `any2orca telemetry on`; `DO_NOT_TRACK=1` always wins |

`any2orca telemetry show` prints all of this, plus every stats event actually sent from your machine. `--dry-run-telemetry` prints the event for a file instead of sending it.

## Output stamp

Every converted file gets a small entry, `Metadata/any2orca.json`.

- **What's in it:** the any2orca version, the profile catalog version, the profile used and the options chosen.
- **Why:** so a file can be recognized later. When a bug is fixed, the version inside tells you whether a file came from an affected release, and bug reports get exact details.
- **What isn't:** no file names, paths, times or identifiers. Nothing reads it back by itself, and nothing is sent anywhere.
- **To leave it out:** pass `stamp: false` to `convert()`, or `--no-stamp` on the command line. `decodeStamp()` reads it back.

Details: [`docs/output-stamp.md`](https://github.com/KuzuriAo/any2orca/blob/main/docs/output-stamp.md).

## Limits

Files are read in memory, with limits that protect your machine from a malicious file:

| Limit | Value |
|---|---|
| Unpacked size, in total | 2 GB by default. `maxUnpackedBytes` in code or `--max-unpacked` on the command line raises it, up to 16 GB. Converting needs about twice the unpacked size in memory, and a project over 1 GB comes with a warning saying so. |
| Zip entries | At most 10,000 |
| Compression | No entry over 10 MB, and no whole file, compressing more than 100:1 |
| Entry names | At most 1,024 characters, and no unsafe paths |
| Main model file (`3D/3dmodel.model`) | At most 500 MB. Projects saved with their meshes as separate part files have no such limit. |
| Project settings | At most 2 MB, and 64 levels deep |
| Objects | At most 1,000 |

## License

MIT.

The profile data (`any2orca-profiles`) is AGPL-3.0-or-later, since it is derived from Snapmaker's AGPL presets. It is a separate package, loaded at runtime. [`NOTICE`](https://github.com/KuzuriAo/any2orca/blob/main/packages/core/NOTICE) credits the data this package includes.

any2orca is an independent project, not affiliated with, endorsed by, or sponsored by Snapmaker, Bambu Lab, OrcaSlicer or any printer, slicer or filament maker.
