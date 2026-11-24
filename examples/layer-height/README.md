# Layers and the nozzle

Snapmaker Orca slices a layer height outside what the U1's nozzle supports as it is, with no warning, and a project's variable layer heights, the layer heights set for ranges of an object's height and the layer heights set on objects stay as the creator set them whatever the nozzle. This example shows a project's layers against the nozzle, and converts it with one layer height for the whole project.

[`layers.mjs`](layers.mjs) is about 80 lines, with no build step.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-layer-height -- ./project.3mf --nozzle 0.6
```

`@any2orca/example-layer-height` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

Without `--layer-height` it converts nothing. It prints each plate's thinnest and thickest layer, the heights the nozzle's profiles have, and the note a conversion gives when the layers fall outside what the nozzle supports (0.04 to 0.14 mm for the 0.2 mm nozzle, 0.08 to 0.32 for 0.4, 0.12 to 0.42 for 0.6, 0.16 to 0.56 for 0.8):

```
project.3mf: layers for the 0.6 mm nozzle, which has profiles at 0.18, 0.24, 0.3 mm
  Plate 1: 0.1 to 0.2 mm
  The project has layers as thin as 0.1 mm. The U1's 0.6 mm nozzle supports layers from 0.12 to 0.42 mm. The layers stay as the creator set them, and Snapmaker Orca slices them that way without a warning. To change that, set the layers to heights in that range in Snapmaker Orca.
```

## One layer height for the whole project

```sh
npm run start -w @any2orca/example-layer-height -- ./project.3mf --nozzle 0.6 --layer-height 0.18 --out ./flat.3mf
```

It converts the project with the `layerHeight` option: the U1 profile for the nozzle that has that height, with the creator's variable layer heights, the layer heights set for ranges of an object's height and the layer heights set on objects replaced, and a note that says which were. The height has to be one the nozzle's profiles have; any other is refused, naming the ones that exist.

The library call, without the script:

```js
import { convert } from "any2orca";

const { output, report } = await convert(bytes, { profiles, nozzle: "0.6", layerHeight: 0.18 });
// report.notes: "Every layer is 0.18 mm, as you chose. The creator's variable layer heights were replaced."
```

The command line has `any2orca convert --nozzle 0.6 --layer-height 0.18`.

## Test it

```sh
npm test -w @any2orca/example-layer-height
```
