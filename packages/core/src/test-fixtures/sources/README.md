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

Each slicer was given a printer of its own with a 0.4 nozzle before saving: Anycubic Kobra S1, Creality K2 Plus, Elegoo Centauri Carbon 2, Flashforge Creator 5 Pro. A `-scene` file holds the scene's settings; a `-reset` file is what the slicer saved on its own, which tests a project whose settings were lost on the way.

The files were scrubbed before they were added: an account number in `3D/3dmodel.model` was blanked, and the folder path in each object's `source_file` was cut down to the file name. Nothing else was changed.

## Adding a slicer or a new version

1. Open `bambu-studio-2.8.4.57-beta.3mf` in it, choose a printer of its own with a 0.4 nozzle, and save the project. If it drops settings, save that as `-reset`, set the scene's four process changes again, and save as `-scene`.
2. Name it `<slicer>-<version from its About box>-scene.3mf`. Keep older versions next to it: the old file is the record of how that release saved.
3. Before adding it, check the text files inside (everything but images) for a user name, a local path, an email address or an account number.
4. Add it to `SOURCES` in `src/sources.test.ts`, and a row to the table above.
