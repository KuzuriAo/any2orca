# Presets

Your own print settings on anyone's model, from a script. Tune one project in Snapmaker Orca, make a preset from it, then convert a folder of downloads with your settings instead of each creator's. It is what `any2orca presets add` and `any2orca convert --preset` do, written out with the library so you can build it into your own tools. [Presets](../../docs/presets.md) explains what a preset holds and why.

Two small scripts, no build step:

- [`make-preset.mjs`](make-preset.mjs) makes a preset from a tuned project and saves it as a presets file.
- [`convert-with-preset.mjs`](convert-with-preset.mjs) converts every `.3mf` in a folder with it.

## Run it

From the repository root:

```sh
npm install
node examples/presets/make-preset.mjs tuned.3mf "Strong" strong.json
node examples/presets/convert-with-preset.mjs strong.json ./downloads
```

`tuned.3mf` is a U1 project with your own settings: convert any project (with this repository's examples, the command line or [any2orca.com](https://any2orca.com)), open it in Snapmaker Orca, change what you like (walls, infill, speeds), and save it. `./downloads` is a folder of the projects you want to print with those settings.

**For a quick first try** without Snapmaker Orca, make the preset from a converted download: it then holds that creator's settings. With the [batch script](../batch-script)'s output and the demo model as the file to convert:

```sh
node examples/presets/make-preset.mjs my-models/converted/demo-model_U1.3mf "Try" try.json
mkdir downloads
cp apps/web/public/demo-model.3mf downloads/
node examples/presets/convert-with-preset.mjs try.json ./downloads
```

The demo model carries no tuning, so that preset holds 0 settings; a real MakerWorld download carries a few. A project that isn't set up for the U1 (an original Bambu Studio download) can't make a preset; the script says to convert it first.

Making the preset lists what you changed from Snapmaker's stock profile:

```
Strong: on snapmaker-u1-0.4-standard
  Speed > Other layers speed > Sparse infill [sparse_infill_speed]: 270 -> 480  (above stock, left at stock)
  Strength > Walls > Wall loops [wall_loops]: 2 -> 4
Saved 1 setting(s) to strong.json
```

**Speeds and accelerations above stock are your choice.** They're left out unless you name them, so a preset never makes someone's print faster without a decision:

```sh
node examples/presets/make-preset.mjs tuned.3mf "Strong fast" fast.json --keep sparse_infill_speed
```

The U1's machine limits still cap anything above them when the file converts.

Converting writes `<name>_U1.3mf` files into `./downloads/converted` (or the folder you give as a third argument) and exits `1` if any file failed.

## What a preset is

Only the print settings that differ from the base profile's stock values: walls, infill, supports, seams, speeds and so on. Never machine settings, filaments, or anything about the model's layout. The file is plain JSON (`any2orca-presets`, version 1), so you can share it, keep it in git, or edit it, and `parsePresetFile()` checks every value against the setting's type and limits when it's read back. A presets file from someone else is input like any other: `convert-with-preset.mjs` refuses one that doesn't check out.

## What to change

- **Use it in your own project.** `npm install any2orca any2orca-profiles`, then copy the scripts. Everything they import is public API.
- **Ask instead of using a flag.** `extracted.changes` marks each value above stock (`aboveStock`) and any value the U1 would cap (`cappedAt`), so a UI can show them and let the person choose, as the web app does.
- **See what a preset would change before converting.** `presetDiffSide()` with `diffSettings()` compares a project with the preset as it converts, the same as `any2orca diff --against-preset`. [`examples/settings-audit`](../settings-audit) uses it to check a folder against a house preset.

## Check it

```sh
npm test -w @any2orca/example-presets
```

The tests make presets from a tuned copy of the demo model (with and without keeping a speed above stock), convert with one and check the output has the preset's value, and refuse a presets file carrying a `__proto__` key.

## License

MIT, like the library. Copy any of it into your own project.
