# Projects in other formats

Real projects from slicers whose project format isn't the Bambu Studio family's. The PrusaSlicer one is converted (the PrusaSlicer reader's tests use it); the tests also make a copy that names a slicer built on PrusaSlicer, to check that such a file is refused with a message naming its slicer, and that nothing is converted.

| File | Saved by | What it is |
|---|---|---|
| `prusaslicer-2.9.6.3mf` | PrusaSlicer 2.9.6 | One box on the default printer profile. PrusaSlicer keeps its print settings in `Metadata/Slic3r_PE.config`, whose first line names the slicer. |

To add one: save a small model in that slicer, check it holds no paths, account ids or printer host details, and name it `<slicer>-<About-box version>.3mf`.
