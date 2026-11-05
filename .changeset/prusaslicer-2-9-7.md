---
"any2orca": patch
---

**PrusaSlicer 2.9.7 projects convert without an unknown-setting note, and a crafted bed number is skipped.** PrusaSlicer 2.9.7 adds one printer setting, used filament compensation (it scales the filament statistics, never the extrusion); it's now known, and like every printer setting the U1 keeps its own. A color-change block whose bed number isn't one of PrusaSlicer's beds (a negative one, in a crafted file) is skipped, as PrusaSlicer 2.9.7 now does, instead of being put on plate 1 or on a plate that doesn't exist.
