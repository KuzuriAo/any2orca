# Snapmaker Orca releases

Each Snapmaker Orca release ships its own U1 profiles: Snapmaker adjusts their values, and adds settings, from one release to the next. any2orca keeps the profiles of every release from 2.4.0 on, and never drops one, for anyone who has to stay on an older version. It converts a file for one of them: that release's profiles and stock values, and the version line Snapmaker Orca reads (`Application` in the project, e.g. `Snapmaker_Orca-2.4.0`).

**The newest release is the default.** Pick another when you have an older one installed. `any2orca profiles` lists the releases any2orca has, and Snapmaker Orca's About window shows which one you have.

**One nozzle size per file.** Every Snapmaker Orca release so far takes one nozzle size for all four toolheads, so a conversion is for one size: the one your U1 has (`--nozzle`, 0.4 mm unless you say otherwise). A release that allows a size per toolhead will say so in its profile catalog entry, and per-toolhead sizes can follow from there.

## Which one to pick

The one you slice with.

- **In the Snapmaker Orca app**, a file made for a newer release still opens and slices in an older one. It may show a notice for a value the newer release added, such as "Invalid values found in the 3mf: raft_first_layer_expansion: -1 not in range". Slicing still works, and picking your own release avoids the notice.
- **On Snapmaker Orca's command line** (`--slice`), the same value stops the slice with an error, so a file made for a newer release doesn't slice there. For a script or a publishing pipeline, pick exactly the release it slices with.

## How to choose it

| Where | How |
|---|---|
| Web app | The Snapmaker Orca version choice in the side panel. It lists every release of the newest minor version and the newest of the one before; **Show older versions** adds the rest. |
| Command line | `--snapmaker-orca-version <x.y.z>` on `convert`, and on `profiles`, `diff` and `presets`, which use that release's profiles too. See the [CLI reference](cli.md). |
| Library | The `snapmakerOrcaVersion` option on `convert()`, or `catalog.forRelease(version)` for a catalog to pass to anything that reads profiles. `catalog.releases()` lists them. See [`packages/core/README.md`](../packages/core/README.md). |
| Web Worker | The same `snapmakerOrcaVersion` option on `convert()`, `matchProfile()`, `listProfiles()`, `diff()`, `resolvePreset()` and `extractPreset()`; `listProfiles()` returns the `releases` for a picker. |

A release any2orca doesn't have is refused, with the list of the ones it has (error code `release_not_found`), rather than converted for another.

The version note in each converted file (`profiles.tracks` in the [output stamp](output-stamp.md)) says which release the file was made for.

## Filament 17 and up

Snapmaker Orca 2.4.1 can leave a filament numbered 17 or higher out of some of its layers, with no message, when the filament numbered 16 lower prints on the same plate: a face painted with filament 17 on an object printed in filament 1 came out of a test slice with filament 17 missing from two of its five layers, where the same face painted with filament 16, or 3, had all five. Snapmaker Orca 2.4.0's source builds its tool order the same way. Filaments 1 to 16 aren't affected, and neither is a filament that is alone on its plate. In the test slices the filament went missing only with that one partner on the plate (17 with 1, 18 with 2): filament 17 next to filaments 2 and 3, and filament 18 next to 1 and 3, printed every layer. A fix is proposed in [Snapmaker/OrcaSlicer#1208](https://github.com/Snapmaker/OrcaSlicer/pull/1208).

any2orca keeps every filament and its number, so the converted project is the creator's. When a plate uses such a filament together with the one numbered 16 lower, the conversion's notes say so, naming the plate and both filaments, for the release the file is converted for. The way around it is to keep the two apart: in Snapmaker Orca, use another filament slot for one of them (a copy of the filament in a free slot, with the parts or paint moved to it), or print the two on different plates. Then check the sliced preview for the higher-numbered filament before printing.

The note follows the release, not a list kept by hand. Each release's entry in the profile catalog says the highest filament number it prints in shared layers (`catalog.sharedLayerFilamentLimit` in the library: 16 for these two releases), read from that release's own source code when its profile data is generated. A release whose source no longer has the limit has none in its entry, and files converted for it get no note.

## When Snapmaker publishes a new release

It's added to the profile catalog (`any2orca-profiles`) and becomes the default in the next any2orca release, whose changelog says so under "Output-affecting", since files converted with the default change. The earlier releases stay available.
