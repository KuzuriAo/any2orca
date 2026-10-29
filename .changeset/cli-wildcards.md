---
"any2orca": patch
---

`any2orca convert` expands `*` and `?` in file names itself, so `any2orca convert "models/*.3mf"` works in Command Prompt and PowerShell, which leave wildcards for the program. Before, those shells reported that the file doesn't exist. Wildcards work in the file name only, match files only (at most 5,000), and a pattern that matches nothing is an error.
