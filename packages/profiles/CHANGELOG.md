# any2orca-profiles

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
