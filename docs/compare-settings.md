# Compare 3MF settings

any2orca can compare the settings of two 3MF projects, or a project with Snapmaker's stock U1 profile or one of your presets, and show what differs the way Snapmaker Orca groups and names its settings. Nothing is uploaded: the comparison runs where the files are.

## What it's for

- **What did the creator change from stock?** Compare a converted project with Snapmaker's stock profile and you see the creator's own choices, and nothing else: walls, infill, supports, seams, speeds. Compare the converted file, not the original: an original Bambu Studio project lists hundreds of extra rows, the source slicer's own settings and defaults that conversion replaces.
- **What would my preset change on this model?** Compare a project with one of your [presets](presets.md) as it converts: the preset's base profile with your settings on it.
- **Are these two files really the same?** Two downloads of "the same" model, an old and a new version, or your copy and a friend's.
- **What did the conversion change?** Compare the original with the converted file. ([What changed](what-changed.md) explains a conversion more clearly, grouped by why each setting changed: `any2orca convert --explain`, or "What changed?" in the web app. The full comparison is part of it.)
- **Catch settings drift in a publish step.** Compare every project against stock, or against a reference project, and fail a build when something changes that shouldn't.

## On the command line

```sh
any2orca diff first.3mf second.3mf
any2orca diff model.3mf --against-stock
any2orca diff model.3mf --against-stock snapmaker-u1-0.4-0.16hq
any2orca diff model.3mf --against-preset "My settings"
any2orca diff first.3mf second.3mf --json > diff.json
```

`--against-stock` uses the profile `convert` would pick for the file, or the profile id you give (`any2orca profiles` lists them). It compares print and machine settings, since filaments come from the creator and not from a stock profile; add `--group filament` to compare them too.

`--against-preset` takes a saved preset's name (`any2orca presets list`) or a presets file holding one preset. It compares the project with what converting onto that preset gives: the preset's base profile, Snapmaker's stock values with your changes on top. A preset holds print settings only, so only those are compared unless you add `--group`.

| Option | Meaning |
|---|---|
| `--group <name>` | Only `print`, `filament`, `machine` or `other`. Repeat it for several. |
| `--all` | Also list settings that are the same on both sides. |
| `--sort <order>` | `attention` (the default: values above the U1's limits, then above stock, first), `setting` (Snapmaker Orca's page order) or `status`. |
| `--json` | The full result as JSON, including complete G-code. |

Exit codes: `0` no differences, `1` differences, `2` an error. That makes it usable as a check in a script or a CI job.

Example, a converted project against Snapmaker's stock profile:

```
Source (A): desk-set_U1.3mf
Target (B): Snapmaker's stock 0.12mm Standard @Snapmaker U1 (0.4 nozzle) profile

Print settings (4)
  Quality > Seam > Seam position [seam_position]                        back       aligned  changed
  Strength > Infill > Sparse infill pattern [sparse_infill_pattern]     gyroid     grid     changed
  Strength > Top/bottom shells > Top shell layers [top_shell_layers]    3          5        changed
  Strength > Walls > Wall loops [wall_loops]                            3          2        changed

4 differences. Use --json for full values (including G-code).
```

## How it decides what's a difference

The comparison follows Snapmaker Orca's own rules, so a difference is a real one:

- **Names and groups** come from Snapmaker Orca itself: each setting is shown where its settings pages show it, for example "Speed > Acceleration > Outer wall", with the setting's key beside it. Groups are print settings, each filament slot, machine settings, and anything that isn't a Snapmaker Orca setting.
- **Values compare by meaning, not by spelling.** `1.0` equals `1`, `15.0%` equals `15%`, a single value equals a list repeating it (Snapmaker Orca repeats one value for every toolhead), and G-code compares without line-ending or trailing-space differences.
- **Filament settings compare slot by slot,** using each file's own layout of standard and high-flow values.
- **A setting only one file has** is shown as "only in source (A)" or "only in target (B)": the source is the first file you give, the target is the second file or the stock profile. A setting Snapmaker Orca doesn't have at all (usually another slicer's own setting, which may exist in Snapmaker Orca under a different name) is shown as "not a Snapmaker Orca setting". The comparison never guesses that two differently named settings are the same.
- **Values worth a look are marked.** Each value is measured against a U1 profile: the stock profile you compare with, or, for two files, the profile the first file would convert with. A speed or acceleration above the U1's machine limits is marked "above the U1's limit (capped)" (the conversion caps it), and a speed, acceleration or filament max volumetric speed above Snapmaker's stock value is marked "above stock" (22 mm³/s, or 40 with a high-flow hotend, for max volumetric speed). Snapmaker's own stock values are never marked, even where its 0.20mm Standard high-flow speeds are above the machine limit by design. These rows come first; in JSON each has `attention: "above-limit"` or `"above-stock"`.
- **Rows follow Snapmaker Orca's settings pages,** in the order the pages show them. Each row in the JSON carries its `page` and `section` (for example "Speed" and "Acceleration"), so a screen can group rows under those headings; a setting Snapmaker Orca shows on no page has neither.
- **Paired values are explained.** Some settings hold two values: the U1 stores some speeds and filament values once for the standard hotend and once for the Liber High Flow Hotend, and other Bambu-lineage printers once per flow variant of their nozzle. A two-nozzle printer such as the H2D stores them per nozzle. A group that has such values gets a note under its heading (for example "Two values: standard hotend, then Liber High Flow Hotend."), and in JSON each such row has `layout: { "a": ..., "b": ... }` with `"u1-hotends"`, `"flow-variants"` or `"nozzle-variants"` for each side. The layout comes from each side's own settings, never from a file's name, and a list of one value per filament has none. `valueLayoutNotes(group.rows)` gives the notes.
- **Bookkeeping is left out:** entries that record how a file was saved rather than how it prints, such as preset inheritance and the changed-settings list.

The names, groups and stock values come from the Snapmaker Orca release the profiles are pinned to, recorded in every result.

## In your own code

```js
import { diffSettings, Project } from "any2orca";

const a = Project.open(firstBytes);
const b = Project.open(secondBytes);
const diff = diffSettings({ label: "first.3mf", settings: a.settings() }, { label: "second.3mf", settings: b.settings() });
```

In a browser, the Web Worker does it off the main thread: `converter.diff({ project, label }, { stock: "snapmaker-u1-0.4-standard" })`. The result is the same JSON the command line prints with `--json` (`format: "any2orca-diff"`, `version: 1`), so results from the web app and the command line are interchangeable.
