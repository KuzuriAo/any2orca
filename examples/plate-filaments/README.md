# What to load for each plate

A project can have more filaments than the Snapmaker U1 has toolheads. The U1 prints with four at a time, so what matters is which filaments each plate uses, and whether a plate needs more than four at the same height. This example reads that from a project and prints it as a loading plan. It converts nothing and writes nothing.

[`loading-plan.mjs`](loading-plan.mjs) is about 110 lines, with no build step.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-plate-filaments -- ./my-project.3mf
```

`@any2orca/example-plate-filaments` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command. It reads source projects (from Bambu Studio and the other slicers any2orca converts) and converted ones alike.

What it prints, for a project with six filaments on seven plates:

```
my-project.3mf: 7 plates with objects, 6 filaments
  Plate 1: load 3 filaments
     1  #000000  PLA  PolyTerra PLA @BBL X1C  (its objects; 0 to 25.6 mm)
     2  #FFFFFF  PLA  PolyLite PLA @BBL X1C  (its objects; 0 to 25.6 mm)
     3  #0056B8  PETG  PolyLite PETG @BBL X1C  (its objects; 0 to 0.9 mm)
  Plate 2: load 1 filament
     4  #C12E1F  PLA  Basic Red  (its objects; 0 to 25.6 mm)
  Plate 3: load 3 filaments
     1  #000000  PLA  PolyTerra PLA @BBL X1C  (its objects; 0 to 25.6 mm)
     2  #FFFFFF  PLA  PolyLite PLA @BBL X1C  (its objects; 0 to 25.6 mm)
     3  #0056B8  PETG  PolyLite PETG @BBL X1C  (paint; 0 to 25.6 mm)
  ...
  Plate 6: needs 5 filaments at the same height; the U1 prints with 4
```

Each line is one filament the plate uses: its slot, color, material and name, then how the plate uses it and between which heights. A plate with more than four filaments that never needs more than four at once is marked "prints with filament changes at pauses": a filament that is finished gives its toolhead to the next one at a pause. The lines under it say how: the filaments to load at the start, which share a toolhead one after the other, the layers the pause for each change can go on (numbered as Snapmaker Orca's layer slider numbers them), and whether the project already has a pause there:

```
  Plate 2: 5 filaments, 2 at the same height: prints with filament changes at pauses
    Load 1, 2, 3, 4 to start
    Filaments 4, then 5 share a toolhead; 4 to 5: a pause on a layer from 26 to 100 (already at layer 60)
```

At the pause, unload the filament that is done and load the next one; the U1 purges the old color and primes the new one on the prime tower. When you send the print, put the filament that comes in at the pause on the same toolhead as the one it replaces: it isn't loaded yet, so the send screen can't match it by its color. The layer numbers are worked out from the file, not from a slice, and a new layer height moves them, so check the sliced preview before you print: the filament that is done should end below the pause and the next one start above it.

Each plate also gives its `layerHeights`: the thinnest and thickest layer it prints, in mm, the first layer aside, worked out from the file's layers where they can be (variable layer heights included) and from the layer heights it sets otherwise. Compare them with what your nozzle takes (0.04 to 0.14 mm for the 0.2 mm nozzle, 0.08 to 0.32 for 0.4, 0.12 to 0.42 for 0.6, 0.16 to 0.56 for 0.8): Snapmaker Orca slices layers outside that range as they are, with no warning, and `convert()` has a note for them.

**Filament 17 and up.** Snapmaker Orca 2.4.0 and 2.4.1 can leave a filament numbered 17 or higher out of some layers when the filament 16 numbers below it prints on the same plate (17 with 1, 18 with 2). A plate that uses such a pair gets a line saying so, for the release you slice with: the newest any2orca has, or `--snapmaker-orca-version 2.4.0`. The limit comes from the profile catalog (`catalog.sharedLayerFilamentLimit`), so a release without it prints no such line. [Snapmaker Orca releases](../../docs/snapmaker-orca-releases.md) has the background.

**In a publishing script.** The exit code is `1` when a plate needs more filaments at the same height than the U1 prints with, so a build can stop on a project that can't print as it is, and `2` when a file can't be read. `--json` prints the same as data, each plate with a `verdict`: `fits`, `needs-changes` or `too-many-at-once`.

**Without a script.** `any2orca inspect my-project.3mf` prints the same reading from the command line, and `--json` gives it as data ([CLI reference](../../docs/cli.md)).

## How it reads a plate

Everything comes from `inspect()`:

```js
import { inspect, planFilamentSwaps } from "any2orca";

const inspection = inspect(bytes);
const { plateFilaments, filaments } = inspection;
for (const plate of plateFilaments) {
  // plate.plate, plate.mostAtOnce, plate.pauses, and one entry per filament the plate uses:
  for (const { slot, uses, from, to, firstLayer, lastLayer } of plate.filaments) {
    // uses: "object", "part", "paint", "height-range", "support", "layer-change"; from and to in mm above the plate;
    // firstLayer and lastLayer from 1, when the plate's layers can be worked out from the file
  }
  // Which filaments share a toolhead and where the pauses go; null when the plate needs no plan or can't have one.
  const plan = planFilamentSwaps(plate, 4, inspection.layerHeight ?? 0.2);
}
```

It counts what the slicer counts: each part's filament, or its object's when the part sets none; the filaments painted on a part (a part painted all over prints none of its own); a filament set for a range of an object's height; the support and raft filaments where an object has supports; and tool changes at a layer on a plate that otherwise prints with one filament.

`mostAtOnce` is an estimate. The heights are read from the model, not from a slice, and a filament counts for the whole span between the lowest and the highest point it is used at, so a filament used near the bottom and again near the top counts in between too. After converting, `report.plateFilaments` holds the same reading for the converted file, and `report.notes` says in words which plates need attention.
