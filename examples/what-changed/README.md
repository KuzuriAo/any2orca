# What changed, in a pipeline

Convert a folder and keep each file's "What changed?" record next to it, so a person can review what the conversion did before anything is published. Optionally fail the run when a file has changes you want a human to look at, such as speeds capped for the U1.

[`review.mjs`](review.mjs) is about 70 lines, with no build step. The record is the same one the web app shows under "What changed?" and `any2orca convert --explain-json` writes: [What changed](../../docs/what-changed.md) explains the groups.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-what-changed -- ./my-models ./converted --fail-on capped
```

`@any2orca/example-what-changed` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

**No projects handy?** Try it with the repository's demo model first:

```sh
mkdir my-models
cp apps/web/public/demo-model.3mf my-models/
```

Any Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer or Flash Studio project works the same way; a model downloaded from MakerWorld is a good real test. (`mkdir` and `cp` work as shown in PowerShell too.)

For each project it writes `<name>_U1.3mf` and `<name>_U1.what-changed.json` into the second folder, `./converted` here (made where you run the command; leave it out to write into `./my-models/converted`), and prints a summary:

```
fast.3mf  ->  0.20mm Standard @Snapmaker U1 (0.4 nozzle)  (From the creator's file: 3; Kept at Snapmaker's stock value: 1; Capped for the U1: 1; Layout: 1)
    choice: Speed > Acceleration > Normal printing: 30000 -> 10000 (could keep the creator's value)
    choice: Speed > Other layers speed > Inner wall: 900 -> 500 (could use stock)
    flagged: has capped changes
plain.3mf  ->  0.20mm Standard @Snapmaker U1 (0.4 nozzle)  (From the creator's file: 1; Kept at Snapmaker's stock value: 1; Layout: 3)

2 converted, 0 failed, 1 flagged. Records: ./converted
```

A `choice` line is a value above Snapmaker's stock that could go the other way: the creator's faster value kept, or put back to stock. Convert that file again with the `aboveStock` option to apply a different choice; the U1's machine limits cap everything either way.

`--fail-on` takes any of `creator`, `stock`, `capped`, `firmware`, `layout` and `yours`. The exit code is `1` when a file is flagged or fails, `0` otherwise, and `2` for a usage error.

## What to change

- **Use it in your own project.** `npm install any2orca any2orca-profiles`, then copy the script. Everything it imports is public API.
- **Show it to a person.** `formatWhatChanged(record)` turns a record into the same readable text `any2orca convert --explain` prints, for a review page, a pull request comment or an email.
- **Keep the records with your releases.** They're small JSON files with no file names, paths or anything about you. Next to the converted files they answer "why is this setting what it is?" later.
- **Leave out the full difference.** `explain: true` adds every setting difference to the record (`record.diff`). Drop it for smaller files; the grouped record is always there.

## Check it

```sh
npm test -w @any2orca/example-what-changed
```

The tests convert the demo model and a copy whose inner wall speed is above the U1's limit: both records are written in the shared format, the capped value shows as 900 to 500, and `--fail-on capped` flags only that file.

## License

MIT, like the library. Copy any of it into your own project.
