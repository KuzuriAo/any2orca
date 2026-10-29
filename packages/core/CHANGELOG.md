# any2orca

## Before any2orca (as bambu2orca and b2o)

any2orca continues bambu2orca (the web app) and `@kuzuri.ao/b2o` (its CLI), whose conversion ran on a server. any2orca's first release changes some output on purpose; its "Output-affecting" list says what. Notable output-affecting changes from the earlier period, newest first, in case you have files made with the old tool:

- **2026-10-19 (b2o 0.0.12):** Per-object overrides with an empty entry, for example `inner_wall_speed` set to `50,nil` (Bambu Studio 2.8 writes these as one value per nozzle variant, even for single-nozzle printers), no longer reach the output: the first value is kept. Snapmaker Orca 2.4.0 refused to open a file containing one ("Deserializing nil into a non-nullable object"). Files made earlier that Snapmaker Orca 2.4.0 would not open can be re-converted.
- **2026-10-14:** Converted files use Snapmaker Orca 2.4.0's preset names (for example "0.20mm Standard @Snapmaker U1 (0.4 nozzle)"), so Snapmaker Orca 2.4.0 opens them on its own system preset. Files converted before then open in Snapmaker Orca 2.4.0 as "Project-inside presets"; re-convert them if you want them attached to the system preset.
- **2026-10-14:** When no profile exactly matches a file's layer height, the file keeps its own layer height instead of taking the nearest profile's.
- **2026-10-14:** Option for the Snapmaker Liber High Flow Hotend (all four toolheads).
- **2026-09:** The source file's brim setting is always kept. Before this, a source printer's default "auto" brim could become "no brim".
- **2026-09:** Bambu-only nozzle settings are removed, so they can't leak into U1 files.
- **2026-09:** Profiles synced to Snapmaker Orca 2.3.6.
- **2026-09:** Flush volumes are resized to the real filament count when a source file's own arrays don't match it.
- **2026-08:** Bambu Studio's "Painted" brim is mapped to Orca's own "painted" value instead of an unrelated Orca feature with the same internal name.
