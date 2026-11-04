---
"any2orca": minor
---

**PrusaSlicer projects convert.** A project saved by PrusaSlicer (2.2 to 2.9.6 tested) is read like one from the Bambu Studio family: its settings are translated to Snapmaker Orca's keys (390 of them have a rule; the ones with no counterpart are listed in the report), every filament is kept with the color PrusaSlicer shows, an object's parts become Snapmaker Orca's parts with their own filaments and settings, painting (multi-color, seams, supports, fuzzy skin) is carried, a color change at a height becomes a pause there (the U1 stops for the swap; Snapmaker Orca writes no G-code for a color change of its own), variable layer heights are kept, and the printer's own settings stay the U1's. Layer-range settings aren't carried yet; the report says so. `inspect()` names Prusa Research printers, and a project from a slicer built on PrusaSlicer (SuperSlicer, an older AnycubicSlicer) is still refused by name.
