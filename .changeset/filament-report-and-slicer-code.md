---
"any2orca": minor
---

**The report lists every filament, with the name it had and the name it has.** `report.filaments` has one entry per slot, in the file's order: slot, color, type, the source preset name and the output name (the same, or what the naming option renamed it to). Every filament stays, however many: the U1 loads four at a time, but a project can use many more, swapped in at the pauses planned in Snapmaker Orca; a test now guards that nothing is dropped, merged or reordered. `report.profileNotes` carries the matcher's sentences on why a profile was chosen when the match wasn't plain. A readable project from a slicer the library doesn't convert now fails with its own code, `unsupported_slicer`, with the slicer's name in `error.slicer`, instead of `invalid_file`; the message is unchanged. The model's own metadata (designer, license, copyright, title, description) is kept, as before, and a test now says so. `any2orca convert --verbose` prints the filament list.
