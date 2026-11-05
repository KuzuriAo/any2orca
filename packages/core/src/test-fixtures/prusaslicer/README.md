# PrusaSlicer fixtures

Real projects saved by PrusaSlicer, which keeps its print settings in `Metadata/Slic3r_PE.config` (whose first line names the slicer) and its per-object settings in `Metadata/Slic3r_PE_model.config`. The PrusaSlicer reader's tests (`src/sources/prusa/`) read and convert them; the tests also make a copy of the first one that names a slicer built on PrusaSlicer, to check that such a file is refused with a message naming its slicer, and that nothing is converted.

| File | Saved by | What it is |
|---|---|---|
| `prusaslicer-2.9.6.3mf` | PrusaSlicer 2.9.6 | One box on the Prusa CORE One's default profiles, Generic ABS. The fixture every key-map guard runs on. |
| `prusaslicer-2.9.6-scene.3mf` | PrusaSlicer 2.9.6 | The scene: an Original Prusa XL with four Prusament PLA filaments whose colors come from the extruders (black, blue, green, red). "Merged", one object of three parts on extruders 2, 1 and 3; a cylinder painted in several extruders (1,450 painted triangles); a sphere on extruder 4 with a variable layer height profile; a plain box. A pause at 24.6 mm with a message, and a color change at 44.6 mm. |
| `prusaslicer-2.9.6-beds.3mf` | PrusaSlicer 2.9.6 | The scene's four objects moved to four beds (PrusaSlicer 2.9's several beds, laid out on a grid around the printer's bed): one object per bed, the pause and the color change on the first. |
| `prusaslicer-2.9.7-beds.3mf` | PrusaSlicer 2.9.7 | The four-bed project re-saved by PrusaSlicer 2.9.7, which adds one printer setting (`used_filament_compensation`); otherwise the same as `prusaslicer-2.9.6-beds.3mf`. |
| `prusaslicer-2.9.7-beds-pauses.3mf` | Built from `prusaslicer-2.9.7-beds.3mf` | The pause control project: the four-bed save with only its color-change file replaced by what PrusaSlicer 2.9.7's writer produces (one block per bed that has codes, bed 0 always), so each bed has its own known pauses. Bed 1 (Merged, 36 mm): a pause at 10.2 mm and a color change of extruder 2 to #FB0207 at 20.2 mm. Bed 2 (cylinder, 36 mm): a pause at 15.2 mm. Bed 3 (sphere): none. Bed 4 (box, 36 mm): a color change of extruder 1 to #0000FF at 6.2 mm. Each becomes the plate of the same number, with exactly those pauses; `pauses.test.ts` holds it. |
| `prusaslicer-2.9.6-fuzzy-skin.3mf` | PrusaSlicer 2.9.6 | One box on the Prusa CORE One, Prusament PLA, with fuzzy skin painted on two of its faces (PrusaSlicer 2.9's paint-on fuzzy skin, its own triangle attribute). |

To add one: save a small model in PrusaSlicer, check it holds no paths, account ids or printer host details, and name it `prusaslicer-<About-box version>-<what it shows>.3mf`.
