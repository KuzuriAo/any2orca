---
"any2orca": minor
---

Output-affecting: **Snapmaker Orca keeps the nozzle type a converted file records.** The file records the U1's stock stainless steel 0.4 nozzle and the hardened steel 0.6, or hardened steel when you choose hardened nozzles, so Snapmaker Orca can warn when a filament is too abrasive for the nozzle. Snapmaker's own printer presets have the 0.4 and 0.6 swapped, and Snapmaker Orca's app reset the file's nozzle type to the installed preset's when it opened the file, so the warning followed the swapped value there; only the command line used the file's. Now the printer's entry in the list of changed settings names the nozzle type, so the app keeps it. Where the file and the installed preset agree, nothing changes; where they differ, the app shows the printer preset as modified.
