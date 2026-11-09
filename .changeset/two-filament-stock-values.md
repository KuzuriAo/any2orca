---
"any2orca": minor
---

Output-affecting: **In a project with exactly two filaments, the second one now gets Snapmaker's standard values for the filament settings the source file doesn't have.** It got Snapmaker's high-flow values instead, because a stock standard and high-flow pair was read as one value for each of the two filaments: a ramming flow of 40 at tool changes instead of 30 in every such file, and, in files without them, a max volumetric speed of 40 (capped to 22, with a note) instead of 20 and a pressure advance of 0.024 instead of 0.02. Projects with one, three or more filaments were right.
