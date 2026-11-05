---
"any2orca": patch
---

**The inspection says where a PrusaSlicer project's beds sit.** `inspect()` gains an optional `sourcePlateOrigins`, each plate's offset from the first in the source project, keyed by plate number. PrusaSlicer 2.9 lays its beds out in rings with a gap of at most 100 mm and later rows above the first, not on Bambu Studio's grid, so a plate view that assumed that grid drew the objects of a PrusaSlicer project's third and fourth beds off the bed. Absent for the Bambu Studio family. Converted files are unchanged.
