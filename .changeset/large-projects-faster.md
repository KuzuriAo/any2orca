---
"any2orca": patch
---

**Projects with many filaments or many PrusaSlicer parts open and convert faster.** Four steps did work that grew with the square of the project's size: writing one filament preset per filament name, looking up each filament's color name, reading the parts of a PrusaSlicer object, and splitting PrusaSlicer's multi-part objects. Each now takes one pass. A 38 MB PrusaSlicer model with 200 multi-part objects splits in 27 ms instead of 3.5 seconds, with a third of the memory, and a project with thousands of filament slots opens without a pause. The split also reads a crafted mesh with tags that never end in one pass, where it took seconds. Every filament is still kept, in the file's order, and converted files are unchanged.
