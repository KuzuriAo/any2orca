---
"any2orca": patch
---

**A damaged config or state file no longer stops the command line.** A `config.json` in the CLI's config folder whose update-check entry had the wrong shape stopped `convert`, `diff`, `presets` and `profiles` with a type error before any work was done; a `.any2orca-state.json` in an output folder holding something other than records did the same to a batch or watch run. Both files are now checked when read, and an entry of the wrong shape is ignored, as a missing one is.
