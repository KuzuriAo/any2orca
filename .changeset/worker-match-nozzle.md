---
"any2orca": patch
---

Features: **The worker's `matchProfile` takes the nozzle size.** `project.matchProfile({ nozzle: "0.6" })` from `any2orca/worker` picks among the profiles for that size, or for the creator's size with `"match"`, the same way `convert` does with the same option, so a page can show the profile a conversion will use without matching on its own thread.
