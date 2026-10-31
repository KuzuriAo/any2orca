# Projects in other formats

Real projects from slicers whose project format any2orca doesn't convert. Each checks that such a file is refused with a message that names its slicer, and that nothing is converted.

| File | Saved by | What it is |
|---|---|---|
| `prusaslicer-2.9.6.3mf` | PrusaSlicer 2.9.6 | One box on the default printer profile. PrusaSlicer keeps its print settings in `Metadata/Slic3r_PE.config`, whose first line names the slicer. |

To add one: save a small model in that slicer, check it holds no paths, account ids or printer host details, and name it `<slicer>-<About-box version>.3mf`.
