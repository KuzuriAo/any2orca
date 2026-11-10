---
"any2orca": patch
---

Fixes: **Comparing settings (`any2orca diff`, and the full comparison in What changed) shows a Bambu Studio project's filament settings one filament at a time when its filaments have different numbers of values.** Bambu Studio stores a value only for the nozzle variants each filament's preset has (Generic PLA has a standard value only), and those settings were listed as one row covering every filament.
