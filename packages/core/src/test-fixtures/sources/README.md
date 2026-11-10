# Source-slicer fixtures

One small project, built in Bambu Studio and re-saved by each slicer any2orca reads, so every supported source is tested on the same scene. `src/sources.test.ts` checks each file against the values below.

## The scene

- **Plate 1,** print by object: Cube on filament 1, Cylinder on filament 2, Disc on filament 3.
- **Plate 2,** print by layer: Cone and Hexagonal Prism, both on filament 4.
- **Filaments:** 1 black and 2 white (Bambu PLA Matte), 3 blue and 4 red (Bambu PLA Basic). Colors `#000000`, `#FFFFFF`, `#0056B8`, `#C12E1F`.
- **Process,** `0.20mm Standard @BBL X1C` with four changes: 3 wall loops, concentric top surface, 10% sparse infill, gyroid.
- **Filament change:** nozzle temperature 225 °C, first layer and other layers, set on filament 4. Filaments 3 and 4 share the Bambu PLA Basic preset, so Bambu Studio applies the edit to both. Its files store two values per filament (standard nozzle, then high flow), and only the standard ones changed.

## The files

| File | Made by | What the slicer did on load |
|---|---|---|
| `bambu-studio-2.8.4.57-beta.3mf` | Bambu Studio 02.08.04.57 beta | The original |
| `bambu-studio-2.8.4.57-beta-object-override.3mf` | Bambu Studio 02.08.04.57 beta | The original, plus a per-object override: 4 wall loops on the Cube |
| `anycubic-slicer-next-2.0.0.3-scene.3mf` | Anycubic Slicer Next 2.0.0.3 | Dropped every process and filament setting and switched to Anycubic PLA (colors kept). The four process changes were set again by hand |
| `anycubic-slicer-next-2.0.0.3-reset.3mf` | Anycubic Slicer Next 2.0.0.3 | As loaded, before setting anything again |
| `creality-print-7.3.0.6157-scene.3mf` | Creality Print 7.3.0.6157 | Switched to Hyper PLA (colors kept) and 0.12mm Standard. Moved back to 0.20mm Standard by hand |
| `creality-print-7.3.0.6157-reset.3mf` | Creality Print 7.3.0.6157 | As loaded: 0.12mm Standard, the four process changes kept |
| `elegoo-slicer-1.5.3.5-scene.3mf` | ElegooSlicer 1.5.3.5 | Switched filaments 3 and 4 to Elegoo PLA (colors kept); kept the process settings |
| `flash-studio-1.7.20-scene.3mf` | Flash Studio 1.7.20 | Dropped every setting, switched to Generic HS PLA (colors kept) and 0.08mm. The four process changes were set again by hand on 0.20mm Standard |
| `flash-studio-1.7.20-reset.3mf` | Flash Studio 1.7.20 | As loaded, before setting anything again |
| `qidi-studio-2.7.2.73-scene.3mf` | QIDI Studio 2.7.2.73 | Switched every filament to QIDI PLA Basic (colors kept); kept the process settings. 225 °C set again on filament 3, which sets all four, since they now share one preset |
| `qidi-studio-2.7.2.73-reset.3mf` | QIDI Studio 2.7.2.73 | Switched every filament to QIDI PLA Basic (colors kept, 210 °C, so the 225 °C edit is gone); kept the process settings |
| `bambu-studio-2.9.1.70.3mf` | Bambu Studio 02.09.01.70 | The original re-saved, X1 Carbon kept. 2.9 names the edited filament preset after the file: `Bambu PLA Basic @BBL X1C(bambu-studio-2.8.4.57-beta.3mf)` |
| `bambu-studio-2.9.1.70-h2c.3mf` | Bambu Studio 02.09.01.70 | Switched to the Bambu Lab H2C (two extruders, 1 + 6 nozzles); filaments 1 to 3 on the right nozzle on plate 1, filament 4 on the left on plate 2. The switch dropped the 225 °C, set again on filament 4 |
| `bambu-studio-2.9.1.70-x2d.3mf` | Bambu Studio 02.09.01.70 | Switched to the Bambu Lab X2D (direct-drive and Bowden nozzles); filament 3 on the Bowden on plate 1, filament 4 on it on plate 2. 225 °C set again on filament 4 |
| `bambu-studio-2.9.1.70-h3c.3mf` | Bambu Studio 02.09.01.70 | Switched to the Bambu Lab H3C (one extruder, nine nozzles); filament 4 on a High Flow nozzle on plate 2. 225 °C set again on filament 4 |
| `creality-print-7.3.1.6378-k3.3mf` | Creality Print 7.3.1.6378 | Switched to the Creality K3 (four toolheads, each with a table of nozzle variants); every filament became Hyper PLA @Creality K3 (colors kept), so the 225 °C set again on filament 4 is on all four; kept the process settings. Creality Print's by-object collision check needed the object order changed before it would slice; positions and settings didn't change |
| `bambu-studio-2.9.1.70-h3c-mixed.3mf` | Bambu Studio 02.09.01.70 | The H3C in multi-diameter mode: filament 1 (PLA Matte) on a 0.2 mm PrintTool, filament 3 changed to Bambu TPU 75A on the 2.85 mm PrintTool (240 °C, one value column), filament 4 on a High Flow nozzle. Walls and shell layers are "Auto" in that mode and can't be set, so wall loops are the preset's 2. 225 °C set again on filament 4 |

Each slicer was given a printer of its own with a 0.4 nozzle before saving: Anycubic Kobra S1, Creality K2 Plus, Elegoo Centauri Carbon 2, Flashforge Creator 5 Pro, QIDI Q1 Pro. A `-scene` file holds the scene's settings; a `-reset` file is what the slicer saved on its own, which tests a project whose settings were lost on the way.

The Bambu Studio 2.9 files were made by switching the scene's printer in Bambu Studio itself (no printer needed), so each holds the layout Bambu Studio writes for that printer: the H3C's `extruder_nozzle_diameter` and `extruder_nozzle_volume_type` lists, per-plate `filament_maps` and `filament_volume_maps`, the X2D's Bowden variant columns. Switching printers drops a filament edit, so the 225 °C was set again in each.

The files were scrubbed before they were added: an account number in `3D/3dmodel.model` was blanked, and the folder path in each object's `source_file` was cut down to the file name. Nothing else was changed.

## Adding a slicer or a new version

1. Open `bambu-studio-2.8.4.57-beta.3mf` in it, choose a printer of its own with a 0.4 nozzle, and save the project. If it drops settings, save that as `-reset`, set the scene's four process changes again, and save as `-scene`.
2. Name it `<slicer>-<version from its About box>-scene.3mf`. Keep older versions next to it: the old file is the record of how that release saved.
3. Before adding it, check the text files inside (everything but images) for a user name, a local path, an email address or an account number.
4. Add it to `SOURCES` in `src/sources.test.ts`, and a row to the table above.
