# any2orca

## 0.11.0

### Output-affecting

- **Snapmaker Orca no longer warns about modified G-code when it opens a converted file, and a filament named like another printer's preset stays usable with the U1.** Since 0.10.0 each filament's list of changed settings named every filament setting, its start and end G-code included, and Snapmaker Orca warns about every G-code setting such a list names. Now the list names only the settings that differ from the preset Snapmaker Orca resets the filament to, so the app keeps every value that differs and fills in the rest with the same values. Under Original, a filament whose name isn't one of Snapmaker Orca's U1 presets (a Bambu preset, say) gets the preset the Snapmaker option would choose as its parent (Snapmaker PLA Matte for a matte PLA, Generic where Snapmaker has none): its name and the creator's values stay, and Snapmaker Orca no longer resets it to another printer's preset of the same name, which listed only that maker's printers. A filament whose base is a U1 preset takes that preset's own filament G-code. A filament no U1 preset fits names what the creator changed, what the conversion changed and the printers it can be used with. In the test projects, the Snapmaker and Generic options change only the lists; Original also gains the parents, and its filament G-code changes only where the parent's differs from Snapmaker's stock comment (a comment too).
- **Snapmaker Orca keeps the nozzle type a converted file records.** The file records the U1's stock stainless steel 0.4 nozzle and the hardened steel 0.6, or hardened steel when you choose hardened nozzles, so Snapmaker Orca can warn when a filament is too abrasive for the nozzle. Snapmaker's own printer presets have the 0.4 and 0.6 swapped, and Snapmaker Orca's app reset the file's nozzle type to the installed preset's when it opened the file, so the warning followed the swapped value there; only the command line used the file's. Now the printer's entry in the list of changed settings names the nozzle type, so the app keeps it. Where the file and the installed preset agree, nothing changes; where they differ, the app shows the printer preset as modified.

### Other

- **any2orca needs Node 22 or newer.** Node 20 reached its end of life in April 2026 and no longer gets security fixes, so CI tests Node 22 and 24. Nothing in the library's API or the CLI changes.
- **The docs say that warning and error messages can be reworded in any release.** Branch on an error's `code`, or on whether `report.warnings` or `inspection.warnings` has any entries, never on the text. The library README, the two fields' doc comments and the publishing ideas say so.

## 0.10.0

### Output-affecting

- **The Snapmaker and Generic filament options set each filament to its preset's own settings, and every option keeps what the file says when Snapmaker Orca opens it.** Snapmaker Orca's app resets a filament whose name matches one of its presets to that preset's settings when it opens a project, while its command line uses the file's own values, so a relabeled file printed differently depending on how it was sliced (the creator's 225 °C in the file, Snapmaker's 220 °C in the app). Now a slot set to a Snapmaker or Generic preset takes that preset's own settings, standard and high-flow values and its start and end G-code included, from the profile catalog, so the file, the app and the command line agree; colors and order stay. `report.filamentPresets` lists each such slot and the creator's values it replaced, and the new `filamentNotes(report)` says it in words, the same sentences the web app and the CLI show. Original keeps the creator's filaments exactly, and every filament's list of changed settings now names every filament setting, so Snapmaker Orca keeps the creator's values even for a filament named like one of its presets. In the quick corpus, Original changes only that list (no setting's value); the Snapmaker option changes the filament settings of every project with a filament it renames. With a profile catalog that has no preset settings, the options change names only and say so.

### Other

- Pins any2orca-profiles 0.4.0.

## 0.9.2

### Fixes

- **A preset's values are checked against the Snapmaker Orca release it converts for.** The check used the strictest limits of every supported release together, so a value the chosen release accepts could be left out: a raft initial layer expansion of -1 (2.4.1's own stock value) or a bridge density above 100% when converting for 2.4.1. Each release's own limits now apply; a PrusaSlicer project, read before a release is chosen, is still checked against what every supported release accepts. Converted files don't change.

## 0.9.1

### Other

- **`VERSION` is typed as `string`.** It was typed as its own value ("0.9.0"), so its type changed with every release; its value is unchanged.

## 0.9.0

### Breaking

- **The public API is now the documented one, and from here on it only grows.** This release removes what was never meant to be public and opens the lists of values the library returns, so that adding a slicer, an error code or a conversion step never breaks code built on any2orca again. A check in CI compares the API's shape with a committed report. Everything that changed, and what to use instead:
  
  - **Lists of values the library returns can gain values.** `SourceVendor`, `Any2orcaErrorCode`, `ChangeReason`, `ConvertStage`, `MatchSource`, `DiffStatus`, `DiffAttention`, `ValueLayout`, `SourceFormat` and `SupportedNozzleDiameter` are now the known values or any other string. Code that maps every value, such as a `Record<SourceVendor, string>` or an exhaustive `switch`, needs a fallback for a value it doesn't recognize. The known values are exported next to each type: `SOURCE_VENDORS`, `ANY2ORCA_ERROR_CODES`, `CHANGE_REASONS`, `CONVERT_STAGES`, `MATCH_SOURCES`, `DIFF_STATUSES`, `DIFF_ATTENTIONS`, `VALUE_LAYOUTS`, `SOURCE_FORMATS` and `SUPPORTED_NOZZLE_DIAMETERS`, with a `Known...` type for each.
  - **The validation schemas are no longer exported,** so the library's types mention no validation library: `StatsEventSchema` is replaced by `parseStatsEvent()` (what a sender may send, exactly) and `receiveStatsEvent()` (what a collector stores: the same event, with a maker or match source the collector doesn't know yet stored as `"other"` instead of refused, so a collector a few releases behind still counts every conversion); `PresetSchema` and `PresetFileSchema` by `parsePresetFile()`, which already existed; `OutputStampSchema` by `decodeStamp()`, likewise. The types those schemas produced (`OutputStamp`, `ConvertObject`, `HighFlowHotends`, `Shifts`, `ProfileMatch`, `ProfileIndex`, `StatsEvent`) are plain interfaces now, with the same fields.
  - **Internal helpers are no longer exported:** `cleanWarnings`, `detectNozzleDiameter`, `isReleasePath`, `labelOf`, `lookupFilamentColorName`, `parseFilamentType`, `matchFilamentLine`, `normalizeTierName`, `parseTierName`, `pickProfile`, `presetFingerprint`, `recordStatsChoice`, `valueLayout`, and the constants `ABOVE_STOCK_DEFAULTS`, `BOOKKEEPING_KEYS`, `MAX_DIFF_KEYS`, `MAX_INDEX_BYTES`, `MAX_PROFILE_BYTES`, `NEVER_SENT`, `NO_STATS_CHOICE`, `PRESET_KEYS`, `PRESET_EXCLUDED_KEYS`, `REF_PATTERN`, `SETTINGS_CATALOG`, `SETTINGS_CATALOG_SOURCE` and `VALUE_LAYOUT_TEXT`, with the types `PickProfileResult`, `TierAwareProfileCandidate` and `LoadedProfile`. Use `matchProfile()` to pick a profile, as the docs always said. A catalog's `load()` and `prusaBundle()` methods, which the engine used, are no longer reachable either; for Snapmaker's stock settings as a diff side, use the new `stockDiffSide(profileId, catalog)`, the counterpart of `presetDiffSide()`; `listProfiles()`, `get()`, `list()`, `releases()`, `forRelease()`, `retiredSuccessor()` and `prusaBundles()` stay. If you used one of these, open an issue: adding one back is not a breaking change.
  - **A stamp from a newer any2orca still reads.** `decodeStamp()` accepts a source format it doesn't know, instead of reading the file as unstamped. Converted files don't change.

### Fixes

- **A partner link whose download stalls stops after 60 seconds, and you can cancel it.** When a site's `?manifest=` link points to a server that stops sending, the web app used to wait forever; it now stops after 60 seconds with nothing received and says so, and a Cancel button stops the download at any time and returns to the start screen. While it downloads, the heading says "Downloading files..." instead of "Inspecting 3MF archive...", and while it waits for a partner site's hand-off, "Waiting for the partner site...". Converted files don't change.

### Other

- **The NOTICE says what the settings catalog holds.** It now says plainly that the settings catalog includes Snapmaker Orca's setting labels and the names of its settings pages and sections, alongside facts about each setting. No code or converted file changes.

## 0.8.0

### Breaking

- **`SourceVendor` has a new value, `"qidi"`.** Code that maps every value, such as a `Record<SourceVendor, string>` or an exhaustive `switch`, needs an entry for it.

### Features

- **QIDI Studio projects are a supported source.** QIDI Studio saves in Bambu Studio's format, so its projects already converted; now they're tested (a QIDI Studio 2.7.2.73 save of the shared scene is a fixture) and named in the help, the README and the package description. The inspection's `sourceVendor` is `"qidi"` for them, read from the printer a filament preset names, since QIDI Studio writes its printer as "Q1 Pro". Converted files don't change.

## 0.7.3

### Output-affecting

- **A project with an empty plate converts with every plate's objects on their own plate.** The converter laid out only the plates that had objects, but the file keeps every plate, and Snapmaker Orca puts an object on the plate whose area it's in: in a project with plates 1, 3 and 4 used and plate 2 empty, the objects opened on plates 1, 2 and 3, so per-plate settings, names and pauses went with the wrong objects. Each plate now goes to the place of its own number on the U1's grid, over every plate the file has, and an empty plate stays empty; empty plates after the last used one also count toward the grid's width, as Snapmaker Orca counts them. The conversion notes each empty plate ("plate 2 has no objects in the project; it stays empty, so the other plates keep their numbers"), and the report's plate count includes them. A PrusaSlicer project with an empty bed between used ones is placed the same way, with each bed's pauses on its own plate. In a corpus of 1,568 projects, 3 move (each has an empty plate before a used one, or an empty last plate that widens the grid) and 12 change only their plate count; no other converted file changes.
- **Converting a converted file again gives no notes about "the creator", and a filament with no id of its own is written with an empty one.** A file already set up for the U1 lists every setting as changed, so the converter read its own high-flow layout back as a creator's change and said it didn't fit ("the creator changed filament_flow_support, but its values ... don't fit"); that layout is written for the U1's nozzles afterwards and is no longer read as a change. A project whose source has no filament ids (every PrusaSlicer project, and a few Bambu Studio family ones) was given one Snapmaker preset's id for its first filament and none for the rest; each filament now gets an empty id, as Snapmaker Orca writes for a filament not from its library, and relabeled filament names get their presets' own ids. In a corpus of 1,568 projects, the ids are the only change to converted files, in the 84 projects that had none; the notes changed only on re-conversion.

### Features

- **The report says where each plate sits on the U1, and the inspection how many plates there are.** `report.plateOrigins` gives each plate's position on the U1's plate grid, in mm from plate 1, empty plates included, so a plate view can draw each plate's objects without working out the grid itself. `inspect()` gains `plateCount`, the project's plates with empty ones included; `plates` still lists the ones with objects. For a PrusaSlicer project, `sourcePlateOrigins` now has an entry for every bed up to the last used one.

### Other

- **Converted files are written in about half the time.** The output is compressed at deflate level 3 instead of 6: on a sample of 192 real projects that wrote in 51% of the time, for files 1.7% larger. On a 1.4 GB project, compression was about 50 s of a 75 s conversion. Every file inside the converted project is unchanged; only the zip's compressed bytes differ, and Snapmaker Orca opens it the same way.
- **The web app shows empty plates.** The plate view has a tab for every plate in the project, an empty one marked as such ("Plate 2, empty"), and draws each plate's objects where the converted file puts them, using the report's plate positions; before converting, a project with an empty plate at the end is drawn on its own grid too.

## 0.7.2

### Other

- **The command line's help, the package description and the API reference name PrusaSlicer.** `any2orca --help` and the npm page listed five source slicers and left PrusaSlicer out, though PrusaSlicer projects have converted since 0.5.0. Converted files are unchanged.
- **The web app names PrusaSlicer everywhere it lists the supported slicers.** The FAQ answer about which files you can drop, the filament names setting and the example preset names now include Prusa, and a PrusaSlicer project is tested end to end in the page, including batch mode and the What changed panel. The README has a Supported slicers table.

## 0.7.1

### Output-affecting

- **A PrusaSlicer project with its Brim box unchecked converts with no brim.** PrusaSlicer's Brim checkbox is the brim width: unchecked is a width of 0, with the brim type left as it was ("outer only", say), and PrusaSlicer prints no brim. Snapmaker Orca draws a brim by its type alone, so the converted file had one: "outer only" with the U1's stock 5 mm width, or the stock automatic brim for a project from a PrusaSlicer old enough to have no brim type. A width of 0 now becomes Snapmaker Orca's "no brim". An object with its own brim width keeps its own brim, on or off. Converted PrusaSlicer files change where the box was unchecked; Bambu Studio family files don't.
- **A PrusaSlicer project's supports convert as PrusaSlicer shows them.** The Supports menu on PrusaSlicer's sidebar (none, everywhere, build plate only, or for support enforcers only) and the filaments supports print from are now carried as the project has them, even when they're the preset's own values. Before, only what differed from the preset came through, so a project that turned supports on got Snapmaker's stock tree supports instead of the snug or grid supports PrusaSlicer showed; an XL or MK4 Input Shaper preset's default, "for support enforcers only", became Snapmaker's stock "off", leaving painted enforcers unused; and a soluble-support preset's support filament and zero contact distance became any filament with a gap. When supports are on, the kind of support (tree for organic, normal for snug and grid) comes with them, for the project and for an object that turns supports on itself. A support or wipe tower filament number the project doesn't have is left to the stock value. Converted PrusaSlicer files with supports on, or on an enforcers-only preset, change; Bambu Studio family files don't.
- **An object placement that isn't a number is left as written.** A source project whose item transform has the right number of values but one that isn't a number (or is beyond what a number can hold) had that value written into the converted file as `NaN` or `Infinity`, with no warning. The placement is now left exactly as the source had it, and the conversion says so. Projects whose transforms are numbers, which is every project a slicer saves, convert byte for byte as before.

### Features

- **The inspection says where a PrusaSlicer project's beds sit.** `inspect()` gains an optional `sourcePlateOrigins`, each plate's offset from the first in the source project, keyed by plate number. PrusaSlicer 2.9 lays its beds out in rings with a gap of at most 100 mm and later rows above the first, not on Bambu Studio's grid, so a plate view that assumed that grid drew the objects of a PrusaSlicer project's third and fourth beds off the bed. Absent for the Bambu Studio family. The web app's plate view uses it, so each bed of such a project is drawn on its own plate. Converted files are unchanged.

### Fixes

- **A crafted project can't stall the converter.** Four more parsers scanned the rest of a file again for every tag that never ended: the lookup of an object's mesh block and of its placement (every source), the object names and plate entries (every source), the step that writes the recentered placements into the converted file (every source), and the PrusaSlicer print-preset lookup, which rescanned a long preset name for every "(" in it. A file built to have tens of thousands of such tags took minutes to hours; each reads the text in one pass now, and a regression test holds the time. Converted files are unchanged.
- **Projects with many filaments or many PrusaSlicer parts open and convert faster.** Four steps did work that grew with the square of the project's size: writing one filament preset per filament name, looking up each filament's color name, reading the parts of a PrusaSlicer object, and splitting PrusaSlicer's multi-part objects. Each now takes one pass. A 38 MB PrusaSlicer model with 200 multi-part objects splits in 27 ms instead of 3.5 seconds, with a third of the memory, and a project with thousands of filament slots opens without a pause. The split also reads a crafted mesh with tags that never end in one pass, where it took seconds. Every filament is still kept, in the file's order, and converted files are unchanged.
- **A damaged config or state file no longer stops the command line.** A `config.json` in the CLI's config folder whose update-check entry had the wrong shape stopped `convert`, `diff`, `presets` and `profiles` with a type error before any work was done; a `.any2orca-state.json` in an output folder holding something other than records did the same to a batch or watch run. Both files are now checked when read, and an entry of the wrong shape is ignored, as a missing one is.
- **PrusaSlicer 2.9.7 projects convert without an unknown-setting note, and a crafted bed number is skipped.** PrusaSlicer 2.9.7 adds one printer setting, used filament compensation (it scales the filament statistics, never the extrusion); it's now known, and like every printer setting the U1 keeps its own. A color-change block whose bed number isn't one of PrusaSlicer's beds (a negative one, in a crafted file) is skipped, as PrusaSlicer 2.9.7 now does, instead of being put on plate 1 or on a plate that doesn't exist.
- **The worker client settles every call, and a bundle can be handed over without a copy.** A reply from the worker that said a call failed but carried no readable error left that call waiting forever (a page showed "Converting..." for good); such a reply now rejects the call with `invalid_file`. `unwrapBundle` takes the same `transfer` option as `open`, so a caller can move a large bundle into the worker instead of copying it, and the worker no longer copies each entry a second time before handing it back.

### Other

- Pins any2orca-profiles 0.3.1, which holds the corrected NOTICE for the PrusaSlicer presets.
- The web app loads its Advanced tools when they're opened instead of with the first screen, so the first load is smaller.

## 0.7.0

### Output-affecting

- **A PrusaSlicer conversion carries only the print settings the creator changed.** `any2orca-profiles` now ships Prusa Research's print presets as ten PrusaSlicer releases shipped them, 2.2.0 to 2.9.6 (from the bundle in PrusaSlicer's own repository at each release tag, AGPL-3.0 like that package), with each release's built-in defaults, and the converter compares a PrusaSlicer project's print settings with its named preset from the release that saved the project (the newest at or below it), resolved through the preset's inheritance the way PrusaSlicer resolves it, with the built-in default standing in for a setting the preset leaves alone. Only the settings that differ are carried; Snapmaker's stock stands for the rest, as it does for a Bambu Studio family project, whose own list of changed settings the converter has always used. The report says which preset was compared and how many settings differed. A project on a preset the bundle doesn't have (a user's own, or a name an older PrusaSlicer wrote) is converted as before, every mapped print setting carried, and the report says so. Filament settings are carried whole for every source, as before. Profile sources that don't implement the new optional `readSource` keep the previous behavior, as does a site whose copy of the profile data has no bundles.

### Features

- **A PrusaSlicer project's beds become plates.** PrusaSlicer 2.9 can place objects on several beds, laid out on a grid around the printer's bed; each becomes a plate in the converted file, with its objects and its own pauses and color changes, and the report counts them. An object off every bed stays on plate 1, with a warning. A project saved before 2.9 has one bed and one plate, as before.
- **A PrusaSlicer project's bed size shows in the inspection.** The printer's bed shape and height are now read into the project (never transferred to the U1 file, which keeps its own), so `inspect()` and the web app's plate view show the source bed, an XL's 360 x 360 mm say, instead of a default. Converted files are unchanged by this.

### Fixes

- **A crafted PrusaSlicer project can't stall the converter.** Two of the PrusaSlicer reader's parsers (the per-object settings file, the color-change file) scanned the rest of the file again for every block that had no closing tag, so a file built to have hundreds of thousands of them took minutes; both now read the file in one pass, like the model parsers. A regression test holds the time.

### Other

- Pins any2orca-profiles 0.3.0, which holds the PrusaSlicer presets.

## 0.6.0

### Output-affecting

- **Six more PrusaSlicer settings are carried.** A trace of every dropped PrusaSlicer key through Bambu Studio's, OrcaSlicer's and Snapmaker Orca's rename tables found no missed rename, and six settings with the same meaning under another name, confirmed on both slicers' descriptions: "keep fan always on", automatic infill combination and its maximum layer height, a solid layer every N layers ("insert solid layers"), clockwise wall direction, support layers synchronized with the object (Snapmaker Orca's independent support layer height, inverted), and a filament's ramping lift (its Z-hop type). Only PrusaSlicer conversions change; the report's list of settings with no counterpart is shorter by those six.
- **A PrusaSlicer project's printer settings are the U1's.** The converter listed every mapped setting as changed by the creator, printer settings included, so a PrusaSlicer printer's retraction and single-extruder purge moves reached the file (Snapmaker Orca replaced them with its printer preset's on load, as the re-save of five converted files showed). Only print settings are listed now, as for a Bambu Studio family project, whose own list never names printer settings; the printer's values in a converted file are the U1 profile's.

## 0.5.0

### Output-affecting

- **The stamp records the source.** `Metadata/any2orca.json` in a converted file now has a `source` field: the project's format (`bambu-family` or `prusaslicer`) and the slicer version it was saved by. Nothing else in the file changes. A stamp without the field is from an earlier release and means the Bambu Studio family; `decodeStamp` reads both.

### Features

- **PrusaSlicer projects convert.** A project saved by PrusaSlicer (2.2 to 2.9.6 tested) is read like one from the Bambu Studio family: its settings are translated to Snapmaker Orca's keys (390 of them have a rule; the ones with no counterpart are listed in the report), every filament is kept with the color PrusaSlicer shows, an object's parts become Snapmaker Orca's parts with their own filaments and settings, painting (multi-color, seams, supports, fuzzy skin) is carried, a color change at a height becomes a pause there (the U1 stops for the swap; Snapmaker Orca writes no G-code for a color change of its own), variable layer heights are kept, and the printer's own settings stay the U1's. Layer-range settings aren't carried yet; the report says so. `inspect()` names Prusa Research printers, and a project from a slicer built on PrusaSlicer (SuperSlicer, an older AnycubicSlicer) is still refused by name.

## 0.4.1

### Features

- **Converting is faster, most of all on slower machines.** Writing the converted file took more than half of a large conversion's time: every mesh file was recompressed at the slowest setting, for a file a few percent smaller. The converter now uses a faster setting. A 102.6 MB real project converts in 30 seconds instead of 58 on the same laptop, with the file 0.2% larger; the saving is the same share of the time on any machine, so an older computer, or a phone running the web app, gains the most seconds. Every entry in the converted file is the same as before, byte for byte. Only the zip wrapper's bytes differ, so a hash of the whole file changes; the output is still the same for the same input and options.

## 0.4.0

### Features

- **The report lists every filament, with the name it had and the name it has.** `report.filaments` has one entry per slot, in the file's order: slot, color, type, the source preset name and the output name (the same, or what the naming option renamed it to). `any2orca convert --verbose` prints the list. Every filament stays, however many: the U1 loads four at a time, but a project can use many more, swapped in at the pauses planned in Snapmaker Orca, and that planning depends on the file's own order; a test now guards that nothing is dropped, merged or reordered.
- **The report says why a profile was matched.** `report.profileNotes` carries the matcher's sentences when an auto-match wasn't plain (the source nozzle has no U1 profile, say); empty for an exact match, a given profile id or a preset.
- **A project from a slicer the library doesn't convert has its own error code.** A readable project saved by PrusaSlicer, or a slicer built on it, now fails with `unsupported_slicer`, with the slicer's name in `error.slicer`, instead of `invalid_file`; the message is unchanged. A damaged file stays `invalid_file`, so an app can tell the two apart.

### Other

- **The model's own metadata is kept,** as before: designer, license, copyright, title, origin and description in `3D/3dmodel.model` stay as they were, and only `Application` changes. A test now says so, and the README too.
- **The worker docs say how to go on after a failed worker:** listen for its `error` event, make a new one, and open the other files again.

## 0.3.2

### Fixes

- **No policy violations under a strict content security policy.** zod, which the library uses to check its input, calls the `Function` constructor once to see whether it may compile faster parsers. A policy without `'unsafe-eval'` (a browser extension's, or a site's) refuses it, and zod falls back, but the browser reported a violation each time a page or worker loaded the library. The library now turns zod's compiled parsers off as it loads, before it creates any schema, so the call never runs. Converted files are byte-for-byte the same and conversions take the same time. zod's setting is shared by every copy of zod in the same page or worker; call `z.config({ jitless: false })` before importing any2orca to keep compiled parsers for your own schemas.
- **A zip that isn't a 3MF says so.** A zip with neither a 3MF project nor a 3MF inside it (a bundle of STL files, say) was refused as a 3MF that "holds only the model". It now gets its own message.
- **The Web Worker settles every call when the worker fails.** If the worker fails to load or stops (out of memory on a very large file, say), `createConverterWorker` now rejects every call in flight with a message saying so, and refuses later ones, instead of leaving them waiting forever.

### Other

- **Messages don't name the library,** so an app can show them as they are: the ones about a project from another slicer, a project too large, an archive with a repeated entry, an oversized model file, a retired profile and a catalog without filament names. The command line adds its own `any2orca profiles` hint for a retired profile.

## 0.3.1

### Fixes

- **A PrusaSlicer project now says so.** A project saved by PrusaSlicer, or a slicer built on it (an older AnycubicSlicer, for one), was refused as a 3MF that "holds only the model, with no print settings". It does have print settings, in another format, so the message now names the slicer the file says it came from and the five any2orca converts. Nothing else changes: those projects still aren't converted.

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
