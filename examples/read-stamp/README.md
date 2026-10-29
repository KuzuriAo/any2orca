# Read the version note

Every converted file carries a small version note, `Metadata/any2orca.json`: the any2orca release, the profile set, the profile and the options that made it. This example reads it from every file in a folder, so you can see what made each file and find the ones made before a fix. [The output stamp](../../docs/output-stamp.md) explains the note and its format.

[`versions.mjs`](versions.mjs) is about 70 lines, with no build step.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-read-stamp -- ./converted
```

`@any2orca/example-read-stamp` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

It reads files that any2orca already converted. **To have some to try it on**, convert the demo model with the [batch script](../batch-script) first (`mkdir my-models`, `cp apps/web/public/demo-model.3mf my-models/`, then its command), and point this one at the folder that makes: `npm run start -w @any2orca/example-read-stamp -- ./my-models/converted`. Files converted on [any2orca.com](https://any2orca.com) or with the command line work too.

What it prints, one line per file (the version is the any2orca release that made each file):

```
desk-set_U1.3mf: any2orca 0.1.0, Snapmaker Orca 2.4.0, snapmaker-u1-0.4-standard
lamp_U1.3mf: any2orca 0.1.0, Snapmaker Orca 2.4.0, snapmaker-u1-0.4-standard, high flow on toolheads 1, 3, hardened nozzles
old-print.3mf: no version note (converted without one, or not by any2orca)
```

**Find files made before a fix.** When a release note says "re-convert files made with earlier versions", list them:

```sh
npm run start -w @any2orca/example-read-stamp -- ./converted --older-than 0.2.0
```

Files made by an earlier release are marked, and the exit code is `1` when there are any, so a script can re-convert just those. A file without a note can't be dated; it was converted with the note turned off, or not by any2orca.

## How it reads the note

A `.3mf` is a zip file. The script decompresses only the one small entry it needs, and only if it is small enough to be a note (64 KB), so a large or hostile file costs almost nothing to check. `decodeStamp()` then validates the entry and returns `null` for anything that isn't a readable note, which is why a newer note with fields this release doesn't know still reads: later releases only add fields.

```js
import { unzipSync } from "fflate";
import { decodeStamp, STAMP_PATH } from "any2orca";

const entries = unzipSync(bytes, { filter: (file) => file.name === STAMP_PATH && file.originalSize <= 64 * 1024 });
const note = decodeStamp(entries[STAMP_PATH]); // null if there's none
```

## What to change

- **Use it in your own project.** `npm install any2orca fflate`, then copy the script. The profile catalog isn't needed to read notes.
- **Check uploads on a site.** The same few lines can tell a model page which release made a file a creator uploads, without converting anything.
- **Report bugs precisely.** The note is what a bug report needs; it holds nothing about the model or the person.

## Check it

```sh
npm test -w @any2orca/example-read-stamp
```

The tests convert the demo model three ways (default, with high-flow and hardened-nozzle options, and without the note), add an unreadable file, and check the listing and `--older-than`.

## License

MIT, like the library. Copy any of it into your own project.
