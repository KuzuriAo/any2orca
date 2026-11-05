---
"any2orca": patch
---

**A crafted project can't stall the converter.** Four more parsers scanned the rest of a file again for every tag that never ended: the lookup of an object's mesh block and of its placement (every source), the object names and plate entries (every source), the step that writes the recentered placements into the converted file (every source), and the PrusaSlicer print-preset lookup, which rescanned a long preset name for every "(" in it. A file built to have tens of thousands of such tags took minutes to hours; each reads the text in one pass now, and a regression test holds the time. Converted files are unchanged.
