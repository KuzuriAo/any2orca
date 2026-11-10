---
"any2orca": minor
---

Features: `report.notes`, every note of a conversion in one list sorted by topic (`NOTE_TOPICS`: filament diameter, nozzle size, profile, filament presets, reading the file, settings, plates), each topic's headline first, each note once with the filament slots it names, in one style (a capital at the start, a period at the end, "0.4 mm"). It holds the sentences of `report.warnings`, `report.profileNotes` and `filamentNotes()`, which stay as they are, with their overlap now documented. The command line prints the notes with their topics (`note [nozzle]: ...`). Under `--nozzle match`, a filament tuned for another nozzle size now says it was converted with the U1's closest profile rather than "your nozzles". `filamentPresetNotes()` gives the filament naming option's sentences with their slots.
