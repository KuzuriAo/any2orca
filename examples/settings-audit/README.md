# Settings audit

Check a folder of 3MF projects against Snapmaker's stock profile, or against your own house preset, and fail when a print setting differs that you haven't allowed. Put it in CI before you publish a catalog, so a setting you changed while testing never ships by accident.

[`audit.mjs`](audit.mjs) is about 90 lines, with no build step. It uses the same comparison as [`any2orca diff`](../../docs/compare-settings.md).

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-settings-audit -- ./my-projects
```

`@any2orca/example-settings-audit` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

**Audit U1 projects:** files already converted for the U1, or projects saved in Snapmaker Orca. An original Bambu Studio download lists dozens of extra differences, that slicer's own defaults, which converting replaces; a real MakerWorld project showed 50 before converting and the creator's 6 real choices after. To try it, convert a project with the [batch script](../batch-script) and audit its output folder:

```sh
npm run start -w @any2orca/example-settings-audit -- ./my-models/converted
```

Each project is compared with the Snapmaker stock profile it matches. A project that sets a print setting differently fails the check:

```
ok      desk-set.3mf  (against stock 0.20mm Standard @Snapmaker U1 (0.4 nozzle))
DIFFERS lamp-shade.3mf  (against stock 0.20mm Standard @Snapmaker U1 (0.4 nozzle))
        Strength > Walls > Wall loops [wall_loops]: 2 -> 4
        Speed > Other layers speed > Sparse infill [sparse_infill_speed]: 270, 600 -> 480, 480  [above-stock]
        Two values: standard hotend, then Liber High Flow Hotend.

1 of 2 match.
```

Each line reads "stock value -> the project's value". A setting with two values lists the U1's standard hotend first, then the Liber High Flow Hotend, and a note under the list says so. `[above-stock]` and `[above-limit]` mark speeds and accelerations above Snapmaker's stock values or the U1's machine limits.

**Allow the settings you change on purpose:**

```sh
npm run start -w @any2orca/example-settings-audit -- ./my-projects --allow wall_loops,sparse_infill_density
```

**Check against your house preset instead of stock**, a presets file with one preset (`any2orca presets export "House" --out house.json`):

```sh
npm run start -w @any2orca/example-settings-audit -- ./my-projects --preset house.json
```

Every project is then compared with what converting onto that preset gives: its base profile, with your changes on top.

Exit codes: `0` every project matches apart from allowed settings, `1` a project differs or can't be read, `2` a usage error.

## What it compares

Print settings only, since those are what you tune: walls, infill, supports, speeds and so on. A setting counts when the project sets it differently from the reference, or sets one the reference doesn't have. Filament settings are left out (they come from each project's own filaments), and so are machine settings (the U1's own). To compare those too, change `groups: ["print"]` to include `"filament"` or `"machine"`.

## What to change

- **Use it in your own project.** `npm install any2orca any2orca-profiles`, then copy the script. Everything it imports is public API.
- **Keep the allow list in a file.** Read a JSON list into `allowed` instead of the `--allow` flag, and review changes to it like code.
- **Fail only on what matters to you.** Filter `rows` by `row.attention` to fail only on speeds above stock or the U1's limits, for example.

## Check it

```sh
npm test -w @any2orca/example-settings-audit
```

The tests convert the demo model, then check a clean copy (passes), a copy with a changed setting (fails, and passes once allowed), a house preset made from the tuned copy (the tuned copy passes, the stock copy doesn't), and an unreadable file.

## License

MIT, like the library. Copy any of it into your own project.
