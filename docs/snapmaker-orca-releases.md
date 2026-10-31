# Snapmaker Orca releases

Each Snapmaker Orca release ships its own U1 profiles: Snapmaker adjusts their values, and adds settings, from one release to the next. any2orca keeps the profiles of each release it supports, and converts a file for one of them: that release's profiles and stock values, and the version line Snapmaker Orca reads (`Application` in the project, e.g. `Snapmaker_Orca-2.4.0`).

**The newest release is the default.** Pick another when you have an older one installed. `any2orca profiles` lists the releases any2orca has, and Snapmaker Orca's About window shows which one you have.

## Which one to pick

The one you slice with.

- **In the Snapmaker Orca app**, a file made for a newer release still opens and slices in an older one. It may show a notice for a value the newer release added, such as "Invalid values found in the 3mf: raft_first_layer_expansion: -1 not in range". Slicing still works, and picking your own release avoids the notice.
- **On Snapmaker Orca's command line** (`--slice`), the same value stops the slice with an error, so a file made for a newer release doesn't slice there. For a script or a publishing pipeline, pick exactly the release it slices with.

## How to choose it

| Where | How |
|---|---|
| Web app | The Snapmaker Orca version choice in the side panel. |
| Command line | `--snapmaker-orca-version <x.y.z>` on `convert`, and on `profiles`, `diff` and `presets`, which use that release's profiles too. See the [CLI reference](cli.md). |
| Library | The `snapmakerOrcaVersion` option on `convert()`, or `catalog.forRelease(version)` for a catalog to pass to anything that reads profiles. `catalog.releases()` lists them. See [`packages/core/README.md`](../packages/core/README.md). |
| Web Worker | The same `snapmakerOrcaVersion` option on `convert()`, `matchProfile()`, `listProfiles()`, `diff()`, `resolvePreset()` and `extractPreset()`; `listProfiles()` returns the `releases` for a picker. |

A release any2orca doesn't have is refused, with the list of the ones it has (error code `release_not_found`), rather than converted for another.

The version note in each converted file (`profiles.tracks` in the [output stamp](output-stamp.md)) says which release the file was made for.

## When Snapmaker publishes a new release

It's added to the profile catalog (`any2orca-profiles`) and becomes the default in the next any2orca release, whose changelog says so under "Output-affecting", since files converted with the default change. The earlier releases stay available.
