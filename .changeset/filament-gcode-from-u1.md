---
"any2orca": minor
---

Output-affecting: a filament's start and end G-code is now always the U1's own, like every other kind of G-code, instead of the source preset's. Source presets carry code for their own printer (Bambu's switches its chamber fan, Creality Print 7.3's moves Z for the K2 and stopped Snapmaker Orca from slicing), so files converted from Bambu Studio and Creality Print change.
