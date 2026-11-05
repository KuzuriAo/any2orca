---
"any2orca": patch
---

**Output-affecting: an object placement that isn't a number is left as written.** A source project whose item transform has the right number of values but one that isn't a number (or is beyond what a number can hold) had that value written into the converted file as `NaN` or `Infinity`, with no warning. The placement is now left exactly as the source had it, and the conversion says so. Projects whose transforms are numbers, which is every project a slicer saves, convert byte for byte as before.
