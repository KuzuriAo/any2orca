# What changed in a conversion

Every conversion keeps a record of what it did to the file's settings, grouped by why. The web app shows it under "What changed?", and the command line prints it with `any2orca convert --explain`. Both list the same changes in the same groups and order, and both export the same JSON.

## The groups

| Group | What's in it | Before | After |
|---|---|---|---|
| **From the creator's file** | Settings the creator changed, carried into the converted file, and one line for the filaments (colors, materials and filament settings stay as the creator set them, except their G-code). | Snapmaker's stock value | The creator's |
| **Kept at Snapmaker's stock value** | Settings the creator's file has with another value that the converted file doesn't use, each with the reason: the file doesn't mark it as changed (usually the creator's printer's own default), it's always the U1's own value, or it's a speed or acceleration higher than stock (only lower ones carry over). Printer settings (G-code, retraction, speed limits, bed size) always come from the U1 and are summed up in one line. That includes every kind of G-code, a filament's own start and end G-code too: G-code runs on the printer, and the creator's was written for another one. | The creator's file | Snapmaker's stock value |
| **Capped for the U1** | Values above what the U1 allows: speeds and accelerations above its machine limits, and filament max volumetric speed above 22 mm³/s (40 with a high-flow hotend). | The value it would have had | The limit |
| **Set for the U1's firmware and Snapmaker Orca** | Values Snapmaker Orca or the U1's firmware reads differently, rewritten so they mean the same thing, such as Bambu Studio's painted brim. | The value as written for the source slicer | The same setting as Snapmaker Orca reads it |
| **Layout** | The print sequence (kept to match how the model is laid out) and the objects moved to the center of the U1's bed, by plate. | | |
| **Your choices** | Changes from the options you picked: high-flow hotends, hardened nozzles, filament relabeling, and a [preset](presets.md)'s settings. | Without your choice | With it |

The first line says which profile the file was converted with, and whether it was matched to the file, chosen by you, or set by your preset.

A setting changed in more than one step is listed once, under the last step that changed it. A value only written in another layout (one value per toolhead instead of one in total, say) isn't a change. Every difference between the original and converted settings, including each printer setting, is in the full comparison: "All differences" in the web app, or the `diff` field of the JSON export. See [Compare 3MF settings](compare-settings.md).

## Choosing differently for values above stock

Where a speed, acceleration or filament max volumetric speed is above Snapmaker's stock value, you can choose differently for it, one setting at a time:

- a creator's print speed that's faster than stock is kept by default; you can use Snapmaker's stock value instead;
- a creator's acceleration or travel speed that's higher than stock uses stock by default; you can keep the creator's value instead;
- a filament max volumetric speed above 22 mm³/s (40 with a high-flow hotend) is capped by default; you can keep the creator's value instead.

The U1's machine limits still cap every value, whatever you choose. Each line you can choose for has an `alternative` (`"stock"` or `"keep"`) in the record; the web app shows it as a switch on that line and converts again. On the command line, `--explain` shows the flag next to each one: `--use-stock <setting,...>` or `--keep-higher <setting,...>`. A choice is recorded in the file's [output stamp](output-stamp.md).

## On the command line

```sh
any2orca convert model.3mf --explain        # print the record after each file
any2orca convert model.3mf --explain-json   # also write model_U1.what-changed.json
```

Example (shortened):

```
model.3mf -> model_U1.3mf
    Converted with 0.12mm Standard @Snapmaker U1 (0.4 nozzle) (matched to the file).

    From the creator's file (18)
      Strength > Walls > Wall loops [wall_loops]: 2 -> 3
      Support > Enable support [enable_support]: 0 -> 1
      5 filaments: colors, materials and filament settings kept as the creator set them, except G-code, which is the U1's own

    Kept at Snapmaker's stock value (42)
      Speed > Other layers speed > Sparse infill [sparse_infill_speed]: 430 -> 180 (the creator's file doesn't mark it as changed)
      Speed > Acceleration > Outer wall [outer_wall_acceleration]: 5000 -> 2000 (higher than Snapmaker's stock value; only lower values are carried over)
      61 printer settings (G-code, retraction, speed limits, bed size and others) use the U1's own (the full list is in all differences)

    Layout (3)
      Others > Special mode > Print sequence [print_sequence]: by layer -> by object (kept to match how the model is laid out)
      Plate 1: "Assembly" moved to the center of the U1's bed (7.5 mm in X, -5 mm in Y)
```

## The JSON export

`--explain-json` and the web app's export write the same object:

```json
{
  "format": "any2orca-what-changed",
  "version": 1,
  "profile": { "id": "snapmaker-u1-0.4-0.12fin", "displayName": "0.12mm Standard @Snapmaker U1 (0.4 nozzle)", "chosenBy": "matched" },
  "catalog": { "tag": "v2.4.0", "commit": "..." },
  "groups": [
    {
      "reason": "creator",
      "title": "From the creator's file",
      "description": "...",
      "items": [{ "key": "wall_loops", "label": "Strength > Walls > Wall loops", "before": "2", "after": "3" }]
    }
  ],
  "diff": { "format": "any2orca-diff", "version": 1, "...": "every difference, as in any2orca diff --json" }
}
```

`reason` is one of `creator`, `stock`, `capped`, `firmware`, `layout`, `yours`, always in that order, and groups with nothing in them are left out. An item without a `key` is a summary line or an object moved; `before` and `after` are `null` where there's no value to show; `alternative` is set where you can choose differently (see above). Values are text, with list entries joined by ", ". `layout` says what a value's several entries are, where they're a pair rather than one value per filament: `"u1-hotends"` (the U1's standard hotend, then the Liber High Flow Hotend), `"flow-variants"` (another printer's standard nozzle, then its high-flow nozzle) or `"nozzle-variants"` (one per nozzle of a two-nozzle printer such as the H2D, standard then high flow for each), as `{ "before": ..., "after": ... }`. `--explain` prints the matching note under a group's title, and `valueLayoutNotes(group.items)` gives the same notes for your own display.

## In your own code

The record is always in `report.whatChanged`. Pass `explain: true` to `convert()` to add the full comparison as `report.whatChanged.diff`, and `formatWhatChanged(report.whatChanged)` gives the text `--explain` prints.
