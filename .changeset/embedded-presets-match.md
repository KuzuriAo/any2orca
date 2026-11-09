---
"any2orca": minor
---

Output-affecting: **Snapmaker Orca no longer opens a converted file with its first filament marked as modified.** Each filament's embedded preset (`Metadata/filament_settings_N.config`) held the source file's values as they were before the conversion laid them out for the U1: one value where the U1 keeps a standard and a high-flow value, no parent preset, and the filament's color as its default color. It didn't match the filament it was written for, and Snapmaker Orca marked the first filament modified whenever its name appeared only once in the file. Now each embedded preset holds what the file holds for its filament, with its parent in `inherits`. Only the embedded presets change; the project settings are the same. A file with one filament still opens with a "Customized Preset" notice and its filament marked: Snapmaker Orca sets the project up for the U1's four toolheads and then compares it with the file's own, shorter lists, which its own saves do too.
