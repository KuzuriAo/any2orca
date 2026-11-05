---
"any2orca": patch
---

Features: **The report says where each plate sits on the U1, and the inspection how many plates there are.** `report.plateOrigins` gives each plate's position on the U1's plate grid, in mm from plate 1, empty plates included, so a plate view can draw each plate's objects without working out the grid itself. `inspect()` gains `plateCount`, the project's plates with empty ones included; `plates` still lists the ones with objects. For a PrusaSlicer project, `sourcePlateOrigins` now has an entry for every bed up to the last used one.
