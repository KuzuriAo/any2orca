# any2orca

## 0.3.0

### Output-affecting

- **Files are now made for Snapmaker Orca 2.4.1 by default:** its stock U1 values, its 16 new settings (color penetration depth, support transition and prime tower interface options, first-layer travel acceleration and jerk, filament adhesiveness) and the `Snapmaker_Orca-2.4.1` version line. Every file converts differently from 0.2.0; re-convert to get 2.4.1's values. To keep converting for 2.4.0, pass `--snapmaker-orca-version 2.4.0` (or `snapmakerOrcaVersion: "2.4.0"`), or pick it in the web app.
- **A color penetration depth deeper than the shell has layers is lowered to fit,** as Snapmaker Orca 2.4.1 does when it opens the file, so it shows no warning.

### Profiles

- Uses any2orca-profiles 0.2.0, which holds Snapmaker Orca 2.4.1's U1 profiles (the default) and 2.4.0's.

### Features

- **Choose the Snapmaker Orca release a file is converted for:** `--snapmaker-orca-version <x.y.z>` on `convert`, `profiles`, `diff` and `presets`, and the `snapmakerOrcaVersion` option in the library and on the Web Worker's calls that read profiles. The default is the newest release the catalog holds. Pick the one you slice with: Snapmaker Orca's command line stops at a value an older release doesn't accept. `any2orca profiles` names the releases, and a release the catalog doesn't hold is refused with the list (a new error code, `release_not_found`).
- In the library: `ProfileCatalog.releases()` and `forRelease(version)`, an optional `release(path)` on `ProfileSource` (implemented by `fetchProfileSource`, `dirProfileSource` and `memoryProfileSource`), and `releases` in the Web Worker's `listProfiles()`, for a version picker.

### Fixes

- **A preset's values are checked against the limits every supported release accepts,** so a preset can't carry a value that one of them refuses: `support_threshold_angle` must be at least 1 (2.4.1's minimum) and `raft_first_layer_expansion` at least 0 (2.4.0's).

### Other

- The 0.1.0 changelog's note on slicing without `--allow-newer-file` is corrected: the command line of Snapmaker Orca 2.4.0 and 2.4.1 still needs `--allow-newer-file` for every project.

## 0.2.0

### Output-affecting

- **A filament's start and end G-code is now always the U1's own,** like every other kind of G-code. Source filament presets carry code for their own printer: Bambu's switches its chamber fan, and Creality Print 7.3's moves Z for the K2, with a variable Snapmaker Orca doesn't know, so those files didn't slice. Files converted from Bambu Studio and Creality Print change, and so does any other file whose filaments use those presets (an ElegooSlicer project with Bambu PLA, for example); re-convert them to get this. What changed counts the filament G-code with the printer settings that use the U1's own, and the filaments' line says their G-code is the U1's.

### Other

- **ElegooSlicer and Flash Studio (Flashforge's slicer) are named as supported sources** in the CLI's help, the README and the package description. Projects from both were already detected and converted. All five source slicers are now tested on one shared project, which converts, slices in Snapmaker Orca, and uploads to Snapmaker Space with Snapmaker filament names.

## 0.1.0

First release under the any2orca name, formerly bambu2orca and its `@kuzuri.ao/b2o` command-line tool. The whole conversion now runs on your own machine: no account, no API key, no quota, and nothing you convert is sent anywhere.

### Output-affecting

Compared with b2o 0.0.12 and the bambu2orca web app. Re-convert a file if you want these:

- **Snapmaker's real stock values.** Settings the creator never changed now get Snapmaker's stock value for the matched profile. The old profiles came from one captured project that carried personal tuning (for example an outer wall speed of 50 mm/s instead of Snapmaker's 200).
- **Snapmaker's stock machine G-code and printer settings,** including the start G-code's purifier and chamber control, even when the source file marks its own G-code or printer settings (retraction, z-hop, wipe and the rest of the printer preset) as changed, as every Snapmaker Orca save does. A filament's own retraction and G-code still come with the filament. Converted files carry no embedded print or machine presets, like Snapmaker Orca's own stock projects.
- **Settings that describe the U1 keep the U1's value** from Snapmaker's profiles (arc fitting off, and a few toolchanger and layout settings). Six values the old converter forced (raft first-layer expansion, single-extruder priming and four prime tower values) now follow Snapmaker's stock unless the creator changed them.
- **Speeds and accelerations** from the source are capped at the U1's machine limits. Accelerations and travel speed above Snapmaker's stock aren't carried over unless you choose to keep them; a creator's lower values are kept.
- **Filament max volumetric speed** is capped at 22 mm³/s, or 40 on a toolhead with the Snapmaker Liber High Flow Hotend. On the 0.4 nozzle each filament carries a standard and a high-flow value, as Snapmaker Orca 2.4 stores them. Lower values are kept.
- **Re-converting a Snapmaker Orca project keeps its filament tuning** for both the standard and the high-flow hotend: temperatures, flow ratio, pressure advance, retraction and the rest, including in projects that mix filaments with one value and with two. Before, the high-flow values were replaced by the standard ones, and in a mixed project these settings were reset to Snapmaker's stock values.
- **The 0.4 nozzle is stainless steel,** the U1's stock nozzle, so Snapmaker Orca warns about abrasive filaments correctly (Snapmaker's profiles say hardened steel until their 2.4.2). `--hardened-nozzle` records hardened nozzles.
- **The file says it was made for Snapmaker Orca 2.4.0.** Its `Application` line now reads `Snapmaker_Orca-2.4.0`, what Snapmaker Orca 2.4.0 writes in its own saves, instead of the source slicer's (for example `BambuStudio-02.08.02.61`), and the extra `OrcaSlicer` line is gone. The G-code is the same. (This note first said Snapmaker Orca's command line then slices converted files without `--allow-newer-file`. That holds only for a build with Snapmaker's pending command-line fix: the 2.4.0 and 2.4.1 releases still need `--allow-newer-file` for every project.)
- **Snapmaker and Generic filament names are real U1 presets.** `--filament-compliance snapmaker|generic` now names each filament after its product line (plain PLA, Bambu PLA Basic included, becomes Snapmaker PLA SnapSpeed; Matte stays Matte; Silk stays Silk), using the presets Snapmaker installs for the nozzle size converted to. Some of the old names didn't exist in Snapmaker Orca. The filament's id and vendor change with the name, as in Snapmaker Orca's own saves. Where Snapmaker makes no preset for a line (plain PETG, for example) the Generic one is used, and where neither exists for that nozzle size the creator's name stays; both are reported.
- **The Liber High Flow Hotend can be set per toolhead** (`--high-flow-toolheads 1,3`), and filaments on a high-flow toolhead now slice with their high-flow filament values (temperature, max volumetric speed up to 40, pressure advance and the rest). Before, every filament kept its standard values, so 22 mm³/s held back the high-flow speeds. Filament N prints on toolhead N; filaments 5 and up follow the toolheads only when all four are the same.
- **Reproducible output:** converting the same file with the same options gives byte-identical output, so checksums change only when the content does. Every entry in a converted file carries the same fixed time, so a file no longer records when it was converted.
- **Two-nozzle Bambu printers (H2D, H2C):** speeds and other print settings the creator changed are now carried over. These printers store such settings once per nozzle and per standard or high-flow hotend, and the old converter silently kept Snapmaker's stock value instead. Where the two nozzles disagree, the lower value is used, with a warning.
- **Overhang speeds** the creator changed are carried over, like their other speeds; before, they always took Snapmaker's stock value. Ones above stock can be set back with `--use-stock`.
- **Filament lists with stale entries** (more values than filaments, with no nozzle variants named, as in some Snapmaker Orca 2.3 saves) keep each filament's own first value, as Snapmaker Orca reads them, with one warning that lists the settings (not one per setting, which could run to dozens); before, values from different filaments were mixed. A list with too few values is reported instead of replaced silently.
- **An unusable layer height or a nozzle size with no U1 profile** is reported, and a layer height of 0 or below no longer picks the finest profile.
- **Flush volumes always fit the project's filaments,** written as Snapmaker Orca reads them. Converting a two-nozzle printer's project (H2D, H2C), or one whose flush volumes were resized, could give a file Snapmaker Orca's command line crashed on or partly ignored.
- **Embedded filament presets carry their own filament's id,** not the id of one of Snapmaker's stock PLA presets.
- **Objects are never pulled into each other** to fit a plate onto the U1's smaller bed; a plate that can't fit without that gets a warning to split it, instead of a file Snapmaker Orca refuses to slice.
- **A version note** in every converted file, `Metadata/any2orca.json`: the any2orca version, profile and options, so a file can be matched to a later fix and bug reports are exact. Leave it out with `--no-stamp` or `stamp: false`.

### Profiles

- Uses `any2orca-profiles` 0.1.0, the Snapmaker U1 catalog at Snapmaker Orca 2.4.0, now a package of its own.

### Breaking

- **For b2o users:** there are no API keys or quotas, and `--watch` takes its folder as its own argument (`--watch ./incoming`).

### Features

- **Presets:** save your own print settings from a project you tuned in Snapmaker Orca (`any2orca presets add`), convert anyone's model with them (`--preset`), and share them as a JSON file. A preset carries only what you changed from Snapmaker's stock profile.
- **Compare settings:** `any2orca diff a.3mf b.3mf`, `--against-stock` to see what a creator changed from Snapmaker's stock profile, or `--against-preset` to see what your preset would change. Values above stock or the U1's limits are marked; `--json` for scripts.
- **What changed:** `convert --explain` lists every change a conversion made, grouped by why, and `--explain-json` writes it next to the output. `--use-stock` and `--keep-higher` choose, per setting, between Snapmaker's stock value and a faster one from the file.
- **Paired values are explained.** In `diff` and What changed, a setting with two values (the U1's standard and Liber High Flow Hotend values, or another printer's per-nozzle ones) gets a note saying which is which, and a `layout` field in the JSON. `valueLayoutNotes()` gives the same notes for your own display.
- **Large projects.** Projects that unpack to up to 2 GB convert anywhere, the web app included; the command line and the library go further with `--max-unpacked` or `maxUnpackedBytes` (up to 16 GB). Above 1 GB a warning says converting takes a minute or two and a few GB of memory, and `inspect()` reports `unpackedBytes` so a UI can say so before converting. A project over the limit is refused with the `too_large` code.
- **A library and a Web Worker** for Node and browsers, the same engine the web app and the CLI use.
- **Windows, macOS and Linux.** The command line and the whole test suite run on all three. In Command Prompt and PowerShell, which leave wildcards to the program, `any2orca convert "models/*.3mf"` expands them itself (file names only, files only, at most 5,000 matches); saved presets and the config file live in `%APPDATA%\any2orca` on Windows.
- **Text from files is printed safely.** Conversion warnings, everything the CLI prints and its log file never carry terminal control codes or direction overrides from a file's names or values, and `plainText()` does the same for your own output. Presets files and version notes with such characters in their text are refused.

### Fixes

- **Projects with a very large mesh convert.** A single part file bigger than about 512 MB (a detailed sculpt, say) made the conversion fail with an internal error; large meshes are now read in pieces.
- **Sliced plate files (.gcode.3mf) are refused** with a message saying to convert the project they were sliced from. They hold G-code for the printer they were sliced for and usually no model, and a converted copy carried that G-code into a file labeled for the U1.
- **Stricter checks on crafted files:** a project that repeats an entry name or holds more data in an entry than it declares is refused, and models with more than 1,000 objects are refused before any work is done on them.
- **A setting the creator changed that can't be carried over** is now reported, with a warning, instead of being dropped silently. Filament settings, which are always carried over with the filament, no longer trigger this warning.
- **Safer batch and watch runs.** An output that is the input under another case or through a symlink is refused, as is `--archive-dir` on the watched folder or an input's own folder; two inputs with the same name no longer overwrite each other's output; a file that fails while it may still be copying in gets one retry. `--out-dir` is created if missing, an overwritten output says `(replaced)`, `--dry-run` names the profile, and file errors are sentences. `--json` output keeps unusual characters as JSON escapes.

## Before any2orca (as bambu2orca and b2o)

any2orca continues bambu2orca (the web app) and `@kuzuri.ao/b2o` (its CLI), whose conversion ran on a server. any2orca's first release changes some output on purpose; its "Output-affecting" list says what. Notable output-affecting changes from the earlier period, newest first, in case you have files made with the old tool:

- **2026-10-19 (b2o 0.0.12):** Per-object overrides with an empty entry, for example `inner_wall_speed` set to `50,nil` (Bambu Studio 2.8 writes these as one value per nozzle variant, even for single-nozzle printers), no longer reach the output: the first value is kept. Snapmaker Orca 2.4.0 refused to open a file containing one ("Deserializing nil into a non-nullable object"). Files made earlier that Snapmaker Orca 2.4.0 would not open can be re-converted.
- **2026-10-14:** Converted files use Snapmaker Orca 2.4.0's preset names (for example "0.20mm Standard @Snapmaker U1 (0.4 nozzle)"), so Snapmaker Orca 2.4.0 opens them on its own system preset. Files converted before then open in Snapmaker Orca 2.4.0 as "Project-inside presets"; re-convert them if you want them attached to the system preset.
- **2026-10-14:** When no profile exactly matches a file's layer height, the file keeps its own layer height instead of taking the nearest profile's.
- **2026-10-14:** Option for the Snapmaker Liber High Flow Hotend (all four toolheads).
- **2026-09:** The source file's brim setting is always kept. Before this, a source printer's default "auto" brim could become "no brim".
- **2026-09:** Bambu-only nozzle settings are removed, so they can't leak into U1 files.
- **2026-09:** Profiles synced to Snapmaker Orca 2.3.6.
- **2026-09:** Flush volumes are resized to the real filament count when a source file's own arrays don't match it.
- **2026-08:** Bambu Studio's "Painted" brim is mapped to Orca's own "painted" value instead of an unrelated Orca feature with the same internal name.
