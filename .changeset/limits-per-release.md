---
"any2orca": patch
---

Fixes: **A preset's values are checked against the Snapmaker Orca release it converts for.** The check used the strictest limits of every supported release together, so a value the chosen release accepts could be left out: a raft initial layer expansion of -1 (2.4.1's own stock value) or a bridge density above 100% when converting for 2.4.1. Each release's own limits now apply; a PrusaSlicer project, read before a release is chosen, is still checked against what every supported release accepts. Converted files don't change.
