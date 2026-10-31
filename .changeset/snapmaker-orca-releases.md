---
"any2orca": minor
"any2orca-profiles": minor
---

**Choose the Snapmaker Orca release a file is converted for.** `--snapmaker-orca-version <x.y.z>` on `convert` (and on `profiles`, `diff` and `presets`), and the `snapmakerOrcaVersion` option in the library and the Web Worker, convert with that release's profiles, stock values and version line. The default is the newest release any2orca has. Pick the one you slice with: Snapmaker Orca's command line stops at a value an older release doesn't accept. `any2orca profiles` lists the releases, and a release any2orca doesn't have is refused with the list (error code `release_not_found`). The profile catalog keeps each release in a folder of its own (`data/releases/<version>/`), with the newest at the top of `data/` and every release listed in `index.json`'s new `releases` field, so a copy made for an older version keeps working.
