---
"any2orca": minor
---

Output-affecting: **A Bambu Studio project mixing filaments with and without a high-flow value keeps the creator's filament settings.** Bambu Studio stores a value only for the nozzle variants each filament's preset has (Generic PLA has a standard value only), so four filaments can have seven values for one setting. Those lists were read as stale, and 20 filament settings, including nozzle temperatures, flow ratio, max volumetric speed, retraction and Z hop, got Snapmaker's stock values for every filament, with a warning: a max volumetric speed of 20 mm³/s for Generic PLA where the file has 12. Now each filament's values, its high-flow value included, are read from where the file says they are, as Bambu Studio reads them. Projects where every filament has the same number of values were right.
