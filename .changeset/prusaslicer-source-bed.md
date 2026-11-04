---
"any2orca": patch
---

**A PrusaSlicer project's bed size shows in the inspection.** The printer's bed shape and height are now read into the project (never transferred to the U1 file, which keeps its own), so `inspect()` and the web app's plate view show the source bed, an XL's 360 x 360 mm say, instead of a default. Converted files are unchanged.
