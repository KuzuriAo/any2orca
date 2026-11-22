---
"any2orca": minor
---

Features: **`any2orca inspect <file.3mf>` shows what a project holds without converting it.** The command line could convert and compare, but not show what the web app shows when a file is dropped on it. `inspect` prints the printer and slicer version the project was saved for, its process preset, nozzle size and layer height, every filament with its color, material and preset name, and each plate's objects and the filaments it uses, with how each is used and between which heights. `--json` prints the whole reading as data (`"format": "any2orca-inspect"`, `"version": 1`; `inspection` is what the library's `inspect()` returns), and `--max-unpacked` raises the size limit as on `convert`. It reads source projects and converted ones alike, and exits 2 for a file it can't read.
