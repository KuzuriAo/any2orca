---
"any2orca": minor
---

Output-affecting: **the stamp records the source.** `Metadata/any2orca.json` in a converted file now has a `source` field: the project's format (`bambu-family` or `prusaslicer`) and the slicer version it was saved by. Nothing else in the file changes. A stamp without the field is from an earlier release and means the Bambu Studio family; `decodeStamp` reads both.
