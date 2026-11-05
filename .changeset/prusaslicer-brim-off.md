---
"any2orca": patch
---

Output-affecting: **A PrusaSlicer project with its Brim box unchecked converts with no brim.** PrusaSlicer's Brim checkbox is the brim width: unchecked is a width of 0, with the brim type left as it was ("outer only", say), and PrusaSlicer prints no brim. Snapmaker Orca draws a brim by its type alone, so the converted file had one: "outer only" with the U1's stock 5 mm width, or the stock automatic brim for a project from a PrusaSlicer old enough to have no brim type. A width of 0 now becomes Snapmaker Orca's "no brim". An object with its own brim width keeps its own brim, on or off. Converted PrusaSlicer files change where the box was unchecked; Bambu Studio family files don't.
