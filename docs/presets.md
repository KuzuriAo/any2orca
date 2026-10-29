# Presets

A preset is your own print settings, applied to other people's models. You tune one project the way you like it in Snapmaker Orca, make a preset from it, and every file you convert with that preset gets your walls, infill, supports, seams and speeds instead of the creator's. Nothing is uploaded: presets are made, kept and applied where your files are.

## What a preset holds

- **A base profile:** the Snapmaker U1 profile your project was tuned on, for example "0.16mm Standard @Snapmaker U1 (0.4 nozzle)". Converting with the preset converts onto this profile, so its layer height and nozzle size win over the original file's.
- **Only what you changed:** the print settings where your project differs from that profile's stock values. A preset with no changes is simply "always use this profile".

A preset never holds machine settings (start and end G-code, retraction, z-hop), filaments or filament slot assignments, or anything tied to the model's layout:

| Left out | Why |
|---|---|
| Machine settings and G-code | They belong to the U1 printer preset the converted file already names. |
| Filaments | They stay as the creator set them, as in every conversion. |
| Print sequence, print order, filament slots for walls, infill, supports and the prime tower, purge volumes | They depend on the model: its layout and how many filaments it uses. A different print sequence can make the toolhead hit printed parts. |
| Post-processing scripts, file name template, notes | Scripts and free text, not print settings. |
| Arc fitting | The U1's firmware doesn't use arc moves. |

When your project changed one of these, making the preset tells you it was left out and why.

## Speeds above stock

A preset may be faster than Snapmaker's stock profile, up to the U1's own machine limits. Because faster isn't safe for every filament or model, every speed or acceleration above stock is listed when you save the preset, and you choose for each one: keep yours, or use Snapmaker's stock value. Using stock simply leaves that setting out of the preset. On the command line that's `--above-stock keep` (keep them all), `--above-stock stock` (stock for all) or `--keep <setting,...>` (keep only these). The U1's machine limits still cap every value when converting: a value above the limit is listed with the number it will be capped at, and no choice raises it past the limit.

The same choice exists for the creator's own values when you convert without a preset; see [What changed](what-changed.md).

## On the command line

Make a preset from a project you tuned and saved in Snapmaker Orca:

```sh
any2orca presets add "My settings" tuned.3mf
```

```
My settings: 3 changes on 0.20mm Standard @Snapmaker U1 (0.4 nozzle)
  SETTING                                                           STOCK  YOURS
  Speed > Other layers speed > Outer wall [outer_wall_speed]        200    180
  Speed > Other layers speed > Sparse infill [sparse_infill_speed]  270    480    above stock
  Strength > Walls > Wall loops [wall_loops]                        2      4
Error: Not saved.
This setting is faster than Snapmaker's stock profile:
  Speed > Other layers speed > Sparse infill [sparse_infill_speed]: 480 (stock 270)
The U1's machine limits still apply, but faster isn't safe for every filament or model. Check them with a test print.
To save the preset, choose: --above-stock keep (keep them all), --above-stock stock (use Snapmaker's stock value for all), or --keep <setting,...> (keep only these, stock for the rest).
```

Then convert with it, one file or a whole folder:

```sh
any2orca convert *.3mf --preset "My settings"
any2orca convert --watch ./downloads --out-dir ./converted --preset "My settings"
```

| Command | Does |
|---|---|
| `presets add <name> <tuned.3mf>` | Make a preset and save it. `--above-stock keep\|stock` or `--keep <setting,...>` to choose for speeds above stock, `--force` to replace one with the same name. |
| `presets list` | Your saved presets. `--json` prints them as a presets file. |
| `presets show <name>` | A preset's base profile and each change, stock value beside yours. |
| `presets remove <name>` | Delete a saved preset. |
| `presets export [<name>...] --out <file>` | Write presets (all, or the ones named) to a presets file to share or back up. |
| `presets import <file>` | Save the presets in a file. Speeds above stock need the same choice again (`--above-stock` or `--keep`): someone else's file hasn't been agreed to. |

`convert --preset` takes a saved preset's name, or a presets file that holds exactly one preset (which needs `--above-stock` or `--keep` if it has speeds above stock). It can't be combined with `--profile`, since a preset sets its own.

Saved presets live in the CLI's config folder: `$ANY2ORCA_CONFIG_DIR/presets`, otherwise `%APPDATA%\any2orca\presets` on Windows or `~/.config/any2orca/presets`. Each is one presets file, named after the preset.

## Where the base profile comes from

When you make a preset, any2orca finds the profile your project was tuned on, in this order:

1. The print profile your project names (a project saved on a stock U1 profile).
2. The profile your own print preset was made from (a project saved with a custom print preset in Snapmaker Orca).
3. Otherwise, the closest U1 profile for the project's nozzle size and layer height. The preset records that the base was matched this way, and you're told before saving.

A project that isn't set up for the U1 (a Bambu Studio project, say) can't make a preset: there's nothing to compare it with. Convert it first, tune it in Snapmaker Orca, save it, then make the preset from that file.

## Settings stored per hotend type

Snapmaker Orca keeps many speeds twice, once for the standard hotend and once for the Liber High Flow Hotend. A preset stores your standard value. When converting with high-flow hotends, a setting your preset changed uses your value for both, as a creator's own change does; settings it didn't change keep Snapmaker's high-flow values.

## What a converted file records

The [output stamp](output-stamp.md) records that a preset was used: its base profile, which settings it set, and a fingerprint of their values. Never the preset's name.

## The presets file

Presets are shared and saved as one JSON format, `any2orca-presets.json`:

```json
{
  "format": "any2orca-presets",
  "version": 1,
  "presets": [
    {
      "name": "My settings",
      "base": "snapmaker-u1-0.4-standard",
      "baseInferred": false,
      "catalog": { "version": "0.1.0", "tracks": "Snapmaker Orca 2.4.0" },
      "changes": { "outer_wall_speed": "180", "wall_loops": "4" },
      "created": "2026-10-21"
    }
  ]
}
```

A presets file can come from anyone, so it's checked before anything in it is used: at most 1 MB and 100 presets, names of at most 40 characters on one line, no unknown fields, and every change must be an allowed print setting with a value Snapmaker Orca accepts for it (its type, range and choices). A change that fails is left out with a note, never applied.

## In your own code

```js
import { extractPreset, openProject, parsePresetFile, serializePresets } from "any2orca";

const { preset, changes, notes } = await extractPreset(tunedBytes, { profiles });
// Show `changes` (label, stock, yours, aboveStock) and `notes`, ask for a name and,
// if any change is aboveStock, an explicit agreement. Then:
const mine = { ...preset, name: "My settings" };

const { output, report } = await openProject(bytes).convert({ profiles, preset: mine });
// report.preset.changes: what was set, with aboveStock marked for a badge.

const text = serializePresets([mine]); // and parsePresetFile(text) to read one back
```

In a browser, the Web Worker does the same off the main thread: `project.extractPreset()`, `converter.resolvePreset(preset)` (what a saved preset will change, for showing before applying), `project.convert({ preset })`, and `converter.diff({ stock: preset.base }, { preset })` to compare a preset with its base profile, or with a project.
