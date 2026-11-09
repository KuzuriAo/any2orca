# PrusaSlicer projects

any2orca converts a `.3mf` project saved by PrusaSlicer (2.2 to 2.9 tested) for the Snapmaker U1, the same way it converts one from the Bambu Studio family: drop it on [any2orca.com](https://any2orca.com), run `npx any2orca convert`, or call `convert()`. This page says what a PrusaSlicer project goes through, because its format is its own, not Bambu Studio's, and a few things come out differently.

## What's carried

| In PrusaSlicer | In the converted file |
|---|---|
| Print settings (`Metadata/Slic3r_PE.config`) | Translated to Snapmaker Orca's settings, key by key, with values converted where the two slicers keep them differently (a percentage resolved to a number, a flag folded into a mode, a shrinkage percentage to Snapmaker Orca's scale). The [settings that have no counterpart](#whats-not-carried) are listed in the report. |
| Which settings the creator changed | Compared with the print preset the project names, as Prusa Research published it for the PrusaSlicer release that saved the project (any2orca carries those presets for ten PrusaSlicer releases from 2.2 to 2.9, and uses the newest at or below the project's version), with PrusaSlicer's own built-in defaults for the settings a preset leaves alone; only the settings that differ are carried, and Snapmaker's stock profile stands for the rest. That is the rule for every source: a Bambu Studio project carries its own list of changed settings. The report names the preset and the count. A project on a preset any2orca doesn't know (a user's own) has every mapped print setting carried, and the report says so. |
| The Brim box | Unchecked (a brim width of 0) is Snapmaker Orca's "no brim", for the project and for an object with its own brim width; checked keeps PrusaSlicer's brim type. |
| The Supports menu | Carried as the project has it, even when it's the preset's own choice: none, everywhere, build plate only, or for support enforcers only (painted enforcers keep their supports). When supports are on, the kind comes with them (tree for organic, normal for snug and grid), and the filaments supports and their interface print from, with their contact distances when a support filament is set. |
| Filaments | Every filament, in the project's order, with the color PrusaSlicer shows (the printer's extruder color when one is set, else the filament's) and the preset name it had. Filament settings are carried as they are. A project with fewer than four filaments gets copies of its last one for the U1's other toolheads, as Snapmaker Orca adds them; no object uses them. |
| An object's parts and modifiers | Each becomes a part of the object in Snapmaker Orca, with its filament and its own settings. PrusaSlicer keeps them as triangle ranges of one mesh; the converter writes one mesh per part, with the vertices renumbered and nothing else changed. |
| Painting | Multi-color, seam, support and fuzzy-skin painting, under the attribute names Snapmaker Orca reads. The encoding is the same. |
| Color changes at a height | Pauses at the same heights. Snapmaker Orca writes no G-code for a color-change entry of its own; at a pause it writes the U1's pause G-code, `M600`, which is the filament swap a PrusaSlicer color change means. The color stays on the entry and in the pause's note; the preview doesn't show the new color. |
| Pauses and custom G-code at a height | The same entries, at the same heights. |
| Variable layer heights | Carried per object. |
| Per-object settings | Translated like the print settings. |
| Instances | Each instance, including the way older PrusaSlicer versions wrote them. |
| Several beds (PrusaSlicer 2.9) | Each bed becomes a plate, with its objects and its own pauses and color changes; the plates are laid out on the U1's bed the way a multi-plate Bambu Studio project's are. |
| The printer's settings (bed, retraction, purge moves, G-code, limits) | The U1's own, as for every source. The source bed's size is read so the plate view can show it. |
| The project's own metadata (title, designer, license) | Kept as written. |

The converted file's `Metadata/any2orca.json` records the source as `prusaslicer` with the PrusaSlicer version that saved the project.

## What's not carried

- **Settings with no Snapmaker Orca counterpart.** PrusaSlicer's own features (its dynamic overhang fan speeds, its cooling logic choice, its custom G-code parameters, its post-processing scripts, among others). The report lists them for each conversion, under "no Snapmaker Orca counterpart".
- **A setting below Snapmaker Orca's minimum.** PrusaSlicer uses 0 for "automatic" on some speeds; Snapmaker Orca requires at least 1 there and refuses the file otherwise, so the stock value stands and the report says which.
- **Layer-range settings** (settings for a range of heights of an object). Not yet; the report warns when a project has them.
- **A multi-part object whose mesh can't be split cleanly** (a rare file) is converted as one part, with a warning.

## The mesh file

For every other source, the mesh file is carried byte for byte. A PrusaSlicer project's isn't: the painting attributes are renamed to the ones Snapmaker Orca reads, a version entry Snapmaker Orca looks for is added, and a multi-part object is written as one mesh per part. The geometry itself is unchanged.

## Checking a conversion

Open the converted file in Snapmaker Orca and look at: the object list (parts under their objects, each with its filament), the filament list (every filament, in order, with its color), the layer slider (pauses at the heights the color changes had), and the variable layer height on any object that had one. The "What changed" panel on any2orca.com, or `any2orca what-changed`, shows the settings carried from the project against the Snapmaker stock profile.

If a project converts incorrectly, [open an issue](https://github.com/KuzuriAo/any2orca/issues) saying what didn't come out right, and attach the project zipped if you can share it (GitHub accepts a `.zip`, not a `.3mf`); a project saved from PrusaSlicer with the problem is the fastest way to a fix.
