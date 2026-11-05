---
"any2orca": minor
"any2orca-profiles": minor
---

Output-affecting: **a PrusaSlicer conversion carries only the print settings the creator changed.** `any2orca-profiles` now ships Prusa Research's print presets (from the bundle PrusaSlicer 2.9.6 ships in its own repository, AGPL-3.0 like this package), and the converter compares a PrusaSlicer project's print settings with its named preset, resolved through the preset's inheritance the way PrusaSlicer resolves it. Only the settings that differ are carried; Snapmaker's stock stands for the rest, as it does for a Bambu Studio family project, whose own list of changed settings the converter has always used. The report says which preset was compared and how many settings differed. A project on a preset the bundle doesn't have (a user's own, or a name an older PrusaSlicer wrote) is converted as before, every mapped print setting carried, and the report says so. Filament settings are carried whole for every source, as before. Profile sources that don't implement the new optional `readSource` keep the previous behavior.
