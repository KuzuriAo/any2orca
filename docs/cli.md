# CLI reference

`any2orca convert`, `diff`, `presets`, `profiles` and `telemetry`. Every command also answers `--help`; this page adds what `--help` doesn't cover, and documents it in one place.

A converted file names Snapmaker's own printer, print and filament presets, so Snapmaker Orca opens it ready to slice; there's no preset to pick first. If Snapmaker Orca asks whether to keep the project's presets, keep them.

```sh
npx any2orca convert model.3mf      # no install needed
npm install -g any2orca             # or install it once
```

## `any2orca convert <files...> [options]`

Converts one or more `.3mf` files. A `.zip` bundling several `.3mf` files (a "download all variants" archive) is expanded into a batch automatically; each entry inside it converts as its own file. Inputs are converted one at a time, never in parallel.

| Flag | Default | Meaning |
|---|---|---|
| `--profile <id>` | auto-matched | Use this profile instead of matching one. See [`any2orca profiles`](#any2orca-profiles-options). |
| `--preset <name\|file>` | unset | Convert with your own print settings: a saved preset's name, or a presets file holding one preset. Converts onto the preset's profile and writes its settings over the creator's. Not with `--profile`. See [Presets](presets.md). |
| `--above-stock keep\|stock` | unset | A `--preset` file's speeds or accelerations above stock: keep them all, or use Snapmaker's stock value for all. A saved preset was decided when it was saved. |
| `--keep <setting,...>` | unset | A `--preset` file: keep only these settings above stock; the rest use stock. |
| `--use-stock <setting,...>` | unset | Use Snapmaker's stock value for these print speeds instead of the creator's faster ones, e.g. `outer_wall_speed`. |
| `--keep-higher <setting,...>` | unset | Keep the creator's value for these settings even when it's higher than stock: accelerations, travel speed, or `filament_max_volumetric_speed` (not capped at 22/40). The U1's machine limits still apply. `--explain` shows the flag next to each value it applies to. |
| `--filament-compliance <mode>` | unset | `generic` or `snapmaker`: relabel filament identity for marketplace uploads, by product line (plain PLA becomes Snapmaker PLA SnapSpeed, Matte stays Matte), using only presets Snapmaker Orca has for the nozzle size converted to. Where Snapmaker has no preset for a line, Generic is used; where neither has one, the name stays. Identity only (name, id, vendor), never temperatures, retraction or flow. |
| `--high-flow` | off | All four toolheads have the Snapmaker Liber High Flow Hotend. The file records it, so Snapmaker Orca matches your printer: a filament printing on a high-flow toolhead uses its high-flow filament values (temperature, max volumetric speed, pressure advance and the rest), and Snapmaker's high-flow speeds apply on the profiles that have them (0.20mm Standard on the 0.4 nozzle today). Filament N prints on toolhead N; filaments 5 and up are swapped onto a toolhead when printing, so with only some toolheads high flow they stay standard, with a note. Ignored, with a note, on a nozzle size with no high-flow option. |
| `--high-flow-toolheads <list>` | unset | Only these toolheads have the Liber High Flow Hotend, numbered 1 to 4, e.g. `1` or `1,3`. Otherwise the same as `--high-flow`; use one or the other. |
| `--hardened-nozzle` | off | Your U1 has hardened steel nozzles instead of the stock stainless steel 0.4. The file records it, so Snapmaker Orca warns about abrasive filaments (carbon or glass fiber) correctly. Only changes 0.4 nozzle conversions: Snapmaker makes the other sizes only in hardened steel. |
| `--explain` | off | After each file, print what the conversion changed, grouped by why. See [What changed](what-changed.md). |
| `--explain-json` | off | Also write that record, with every settings difference, as `<output>.what-changed.json` next to each output. |
| `--max-unpacked <size>` | `2GB` | The most a project may unpack to, e.g. `4GB` or `3000MB`, up to `16GB`. For a very large project; converting needs about twice that much memory. A project over the limit is refused with the reason, and one over 1 GB converts with a warning. |
| `--no-stamp` | off | Leave the small version note (`Metadata/any2orca.json`) out of the converted file. It says which any2orca version, profile catalog and options made the file, so it can be recognized if a bug turns up; see [the output stamp](output-stamp.md). The file works the same without it. |
| `--out-dir <dir>` | next to each input | Created if missing. |
| `--suffix <text>` | `_U1` | Output filename suffix. `""` removes it; refused if that would make the output overwrite the input. |
| `--skip-existing` | off | Skip a file whose output already exists. For resuming an interrupted batch. |
| `--watch <dir>` | unset | Watch this folder, converting each new `.3mf`/`.zip` as it settles, until Ctrl+C. Takes no `<files...>`. Requires `--out-dir` pointing somewhere else; `--archive-dir` must be somewhere else too. |
| `--archive-dir <dir>` | unset | After a file fully converts, move the original here (created if missing). |
| `--log-file <path>` | unset | Append every log line, timestamped, to this file too. |
| `--quiet` | off | No terminal output. Requires `--log-file`, so errors still go somewhere. |
| `--dry-run` | off | Show which profile each file would use; write nothing. |
| `--verbose` | off | Also show the matched profile and the full conversion log. |
| `--profiles-dir <dir>` | the bundled catalog | Use a profile catalog folder instead. |
| `--dry-run-telemetry` | off | Print the usage-stats event for each file instead of sending it. |
| `--stats-endpoint <url>` | `$ANY2ORCA_STATS_ENDPOINT` | Send opted-in stats to your own collector. Must be `https://`, or `http://localhost` for testing one. `ANY2ORCA_STATS_ENDPOINT` is only read when stats are on, so a bad value can't stop a conversion while stats are off. |

### Exit codes

`0` if every input converted; `1` if any input failed, or if the arguments themselves are invalid (caught before anything runs). `--watch` runs until Ctrl+C and has no exit code of its own.

### The state file

With `--watch`, `--archive-dir` or `--skip-existing`, a small file records each input's outcome, so the same unchanged file isn't redone on the next run:

- **Location:** `.any2orca-state.json` in the output directory (`--out-dir`, or next to the inputs).
- **Format:** `{ "<input filename>": { "fingerprint": "<size>:<mtimeMs>", "outcome": "succeeded" | "failed-once" | "permanently-failed" } }`. The fingerprint is the file's size and modification time, not a content hash, so even a same-size edit (fixing a typo in a plate name) is seen as changed.
- **`succeeded`**: skipped on a later run as long as the fingerprint matches.
- **`failed-once`**: the first time an unchanged file fails with a problem in the file itself (a corrupt archive, an unknown `--profile`). It's tried once more, in case it was still being copied in.
- **`permanently-failed`**: the same unchanged file failed that way twice, never for a transient problem (disk full, an unreadable catalog). Skipped on later runs until the file actually changes or you fix and replace it.
- A path is compared by the file itself, not its spelling: an output that is the input under another case or through a symlink is refused, and two inputs with the same name in one batch can't overwrite each other's output (the second is refused; give them different names or convert them separately).
- Never written for `--dry-run`, which has nothing to record.

### Patterns

A folder that gets new files over time:

```sh
any2orca convert --watch ./exports --out-dir ./converted
```

A one-shot batch on a schedule, e.g. cron, with `--archive-dir` so nothing needs rescanning next time:

```sh
*/5 * * * *  any2orca convert ./exports/*.3mf --archive-dir ./exports/done --out-dir ./converted --log-file ./any2orca.log --quiet
```

## `any2orca diff <a.3mf> <b.3mf> [options]`

Compares the settings of two projects, or of one project with Snapmaker's stock profile (`--against-stock [<profile id>]`) or with a preset as it converts (`--against-preset <name|file>`), grouped and named the way Snapmaker Orca shows them. Options: `--group print|filament|machine|other` (repeatable), `--all` (include settings that are the same), `--sort attention|setting|status` (default `attention`: values above the U1's limits, then above stock, first), `--json`, `--profiles-dir <dir>`. It reads project files of up to 512 MB. Exit codes: `0` no differences, `1` differences, `2` an error. What it's for and how it decides what's a difference: [Compare 3MF settings](compare-settings.md).

## `any2orca presets`

```
any2orca presets add <name> <tuned.3mf> [--above-stock keep|stock | --keep <settings>] [--force]
any2orca presets list [--json]
any2orca presets show <name> [--json]
any2orca presets remove <name>
any2orca presets export [<name>...] [--out <file>] [--force]
any2orca presets import <file> [--above-stock keep|stock | --keep <settings>] [--force]
```

Makes a preset from a project you tuned in Snapmaker Orca (only the print settings you changed from its U1 profile), keeps your presets, and shares them as `any2orca-presets.json` files. `add` and `import` list any speeds or accelerations above stock and need a choice for them: `--above-stock keep`, `--above-stock stock`, or `--keep <setting,...>` to keep only some. Saved presets are in `presets/` inside the [config folder](#config-file). Exit codes: `0` done, `1` an error, or for `import`, any preset skipped. What a preset holds and leaves out: [Presets](presets.md).

## `any2orca profiles [options]`

Lists the profiles `convert --profile <id>` accepts, sorted by id.

| Flag | Meaning |
|---|---|
| `--nozzle <mm>` | Only list profiles for this nozzle diameter, e.g. `0.4`. |
| `--profiles-dir <dir>` | Use a profile catalog folder instead of the bundled one. |

Each row shows the profile's id, display name, nozzle diameter and quality (Standard or High Quality). `(manual-select only)` marks a profile that shares its layer height with another at the same nozzle size, so `convert`'s automatic matching never picks it; it's still a valid `--profile` value. `(high-flow speeds)` marks a profile with its own tuning for `--high-flow`.

## `any2orca telemetry`

```
any2orca telemetry show
any2orca telemetry on | off
any2orca telemetry clear
any2orca telemetry update-check on | off
```

- **`show`** prints everything this tool can contact and why: whether usage stats are on, the collector address if any, every field the stats event carries (read straight from its schema, so this can't drift from what's actually sent), what's never sent, whether the update check is on, and the log of every stats event actually sent from this machine.
- **`on` / `off`** sets your stats choice. Off by default everywhere. Turning it on doesn't send anything by itself unless a collector is configured (`ANY2ORCA_STATS_ENDPOINT`, or `--stats-endpoint` on a given run); `show` says so explicitly when that's the case.
- **`clear`** deletes the local log of sent events. Doesn't change whether stats are on.
- **`update-check on | off`** turns the once-a-day npm version check on or off. On by default.

### Environment variables

| Variable | Effect |
|---|---|
| `ANY2ORCA_TELEMETRY=1` / `0` | Force stats on or off for this run, overriding the saved choice. `0` always wins over everything, including an explicit `on`. |
| `DO_NOT_TRACK=1` | Always turns stats off, same as `ANY2ORCA_TELEMETRY=0`. |
| `ANY2ORCA_STATS_ENDPOINT=<https url>` | Where opted-in stats are sent. Unset means nothing is ever sent, regardless of the on/off choice. |
| `NO_UPDATE_NOTIFIER=1` | Turns the update check off for this run. Same as `--no-update-notifier` or `telemetry update-check off`. |
| `ANY2ORCA_CONFIG_DIR=<dir>` | Where the config file, and the sent-stats log, are stored. Defaults to `%APPDATA%\any2orca` on Windows, otherwise `$XDG_CONFIG_HOME/any2orca` or `~/.config/any2orca`. |
| `CI` (set to anything) | Turns the update check off. The npm-registry request is never made in CI. |

### The first-run prompt

The first time `convert` runs interactively (a real terminal, not `--dry-run`, not already configured by an environment variable or a prior choice) with somewhere for stats to go, it asks once: *"Help improve any2orca by sharing anonymous usage stats? [y/N]"*. Default is no. Skipped entirely in a non-interactive shell, in CI, or if there's no `ANY2ORCA_STATS_ENDPOINT` configured yet.

### Config file

`config.json` in the config directory above:

```json
{
  "stats": { "choice": "on", "decidedOn": "2026-10-15" },
  "updateCheck": { "enabled": true, "lastCheckedAt": 1760000000000, "latest": "0.1.0", "outputAffecting": "..." }
}
```

Written atomically (temp file, then renamed into place), so an interrupted write can't corrupt it. A missing or unreadable file is treated as "no choice made yet," not an error.

## See also

- [`packages/core/README.md`](../packages/core/README.md): the library and Web Worker API, and the full "what leaves your machine" table.
- [Integration guide](integration-guide.md): using the library in a pipeline instead of the CLI.
- [Output stamp](output-stamp.md): the `Metadata/any2orca.json` every converted file gets, with the version and profile used.
