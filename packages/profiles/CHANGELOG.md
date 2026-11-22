# any2orca-profiles

## 0.5.0

### Features

- **A note when a plate uses filament 17 or higher together with the filament numbered 16 lower.** Snapmaker Orca 2.4.1 can leave a filament numbered 17 or higher out of some of its layers, with no message, when the filament 16 numbers below it prints on the same plate (17 with 1, 18 with 2), and 2.4.0's source builds its tool order the same way; a fix is proposed in Snapmaker/OrcaSlicer#1208. any2orca keeps every filament and its number, so the file doesn't change: the conversion's notes now name the plate and the two filaments, say what the release does, and give the way around it (separate plates, or a number from 1 to 16 for the higher-numbered filament), so the sliced preview gets a look before printing. A filament 17 or higher that is alone on its plate, or there without that partner, gets no note: in test slices it printed every layer. The note follows the release the file is converted for: each release's entry in the profile catalog now says the highest filament number it prints in every layer whatever else is on the plate, read from that release's own source code when the profile data is generated, so a release with the fix has no limit and gets no note. Library: `ProfileCatalog.sharedLayerFilamentLimit` (16 for 2.4.0 and 2.4.1, null for a release without the limit). Profiles: `slicer.sharedLayerFilamentLimit` in each release's `index.json`. Converted files don't change.

## 0.4.0

### Profiles

- **The settings of every filament preset Snapmaker Orca installs for the U1.** Each release's data has `filament-presets.json`, named by the index's `filamentPresets`: for each nozzle size, every filament preset Snapmaker Orca installs (129 for Snapmaker Orca 2.4.1, Snapmaker and Generic alike), resolved the way Snapmaker Orca holds it, stored as the values each printer's presets share and each preset's own. The Snapmaker and Generic filament options write them.

## 0.3.1

### Other

- **The NOTICE names the PrusaSlicer presets' source.** It said the data came from Snapmaker Orca only; it now also names Prusa Research's vendor bundle in PrusaSlicer's repository, with the built-in defaults from PrusaSlicer's source, as the changelog of 0.3.0 does. The data is unchanged.

## 0.3.0

### Output-affecting

- **Prusa Research's print presets, for PrusaSlicer conversions.** `data/sources/prusaslicer/PrusaResearch-<version>.json`, one per PrusaSlicer release from 2.2.0 to 2.9.6 (ten), each the bundle PrusaSlicer ships in its own repository at that release tag (AGPL-3.0, like this package) with the release's built-in defaults from its source: the print presets as the bundle has them, own keys and `inherits`, unresolved. Listed in the top `index.json` under `sources`. any2orca 0.7.0 uses them to carry only the print settings a PrusaSlicer project's creator changed, so converted PrusaSlicer files change; nothing else in the catalog changes.

## 0.2.0

### Output-affecting

- **Snapmaker Orca 2.4.1's U1 profiles are added and are the default.** Generated from Snapmaker's v2.4.1 profiles and checked against stock projects saved in 2.4.1, so files converted with the default carry 2.4.1's stock values, its 16 new settings and its version line. The same 18 profiles as 2.4.0; none renamed or retired. Filament settings no filament preset sets, but which Snapmaker Orca writes once per filament (2.4.1's prime tower interface settings), are in the filament template, so a project carries one value per filament.

### Profiles

- **Snapmaker Orca 2.4.0's profiles stay available** in `data/releases/2.4.0/`, unchanged.

### Features

- **One folder per Snapmaker Orca release.** The newest is at the top of `data/`, so a copy made for an older any2orca keeps working and gets it; each older release is in `data/releases/<version>/`, laid out the same way. The top `index.json` lists them all in a new `releases` field (`version`, `application`, `path`).

## 0.1.0

### Profiles

- First release of the profile catalog as its own package. Snapmaker U1 profiles generated from Snapmaker's own profiles at Snapmaker Orca 2.4.0 (18 profiles across the 0.2, 0.4, 0.6 and 0.8mm nozzles), with Snapmaker's stock machine G-code and that release's built-in defaults. The 0.4 nozzle is recorded as stainless steel, the U1's stock nozzle (Snapmaker's profiles say hardened steel until their 2.4.2). Profile ids retired by Snapmaker's 2.4.0 consolidation still convert, using the profile that replaced them. The catalog also records Snapmaker Orca 2.4.0's own Application value, which converted files carry, and the filament presets Snapmaker installs for each nozzle size (profile set 02.03.03.03) with the product lines the Snapmaker and Generic naming options map onto them.

## Before any2orca (as part of bambu2orca)

The catalog was previously part of the hosted bambu2orca service. Its last state there, which this package starts from: Snapmaker U1 profiles tracking Snapmaker Orca 2.4.0, 18 profiles across the 0.2, 0.4, 0.6 and 0.8mm nozzles, with high-flow speeds for 0.20mm Standard (0.4mm). Profile ids retired by the 2.4.0 sync still convert, using the profile that replaced them.
