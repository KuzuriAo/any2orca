---
"any2orca": patch
---

Fixes: **The note about a filament 17 or higher names both filaments in its `slots`.** The note says which filament can be skipped and which filament it shares a plate with, but `slots` listed only the first (`[17]`), so an app drawing a color chip per named filament missed the second. `slots` now has both (`[1, 17]`); the note's text is unchanged.
