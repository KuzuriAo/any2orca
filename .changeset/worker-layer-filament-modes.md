---
"any2orca": minor
---

Features: **The worker's convert options take `layerHeight`, and its `listProfiles()` says where each filament naming option has presets.** `WorkerConvertOptions` now has `layerHeight`, which the worker already passed through to `convert()`, so a `WorkerProject` caller no longer gets a type error for a working option. `ProfileListing` gains `filamentModes`, the nozzle sizes each filament naming option has presets of its own for in that release (for example `polymaker: ["0.4"]`), the same as `filamentModeNozzleSizes` gives on a page that holds the catalog, so a page that only runs the worker can gray the Polymaker option out where it doesn't apply. The doc comment on the conversion's filament option now says what it does since 0.10.0: it sets each filament to a preset with that preset's own settings.
