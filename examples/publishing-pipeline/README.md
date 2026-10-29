# Publishing pipeline

A publish step for creators: keep your source 3MF projects in a folder, and have your build produce the Snapmaker U1 versions next to them, with a manifest your site or release page can read. No server, no key, no quota; the conversion runs inside your own build.

[`build-u1-files.mjs`](build-u1-files.mjs) is the whole thing, with no build step of its own.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-publishing-pipeline -- ./models ./dist/u1
```

`@any2orca/example-publishing-pipeline` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

**No projects handy?** Try it with the repository's demo model first:

```sh
mkdir models
cp apps/web/public/demo-model.3mf models/
```

Any Bambu Studio, Creality Print or Anycubic Slicer Next project works the same way; a model downloaded from MakerWorld is a good real test. (`mkdir` and `cp` work as shown in PowerShell too.)

For each `.3mf` in `./models` it writes `<name>_U1.3mf` into `./dist/u1`, plus `u1-files.json`:

```json
{
  "any2orca": "0.1.0",
  "files": [
    {
      "source": "desk-set.3mf",
      "file": "desk-set_U1.3mf",
      "sourceSha256": "579f2643...",
      "sha256": "a0ab1f57...",
      "bytes": 25565,
      "profile": "snapmaker-u1-0.4-standard",
      "warnings": [],
      "any2orca": "0.1.0"
    }
  ]
}
```

It prints one line per file, `ok      demo-model.3mf  ->  demo-model_U1.3mf`. Run it again and an unchanged file prints `skip    demo-model.3mf (unchanged)` instead: only new or edited projects are converted.

Use the manifest to render download buttons, a file list on a release page, or checksums for people who want to verify a download.

## What it does for a build

- **Unchanged files are skipped.** A file is converted again only when its source bytes or the any2orca version changed, so a publish step with hundreds of models stays fast and its outputs stay stable.
- **A broken model stops the publish.** Any failure exits `1` (a usage error exits `2`). The manifest is still written for the files that converted, so nothing is lost, but your CI step fails and you see which file and why, with the error's stable `code`.
- **Notes are kept.** Each file's `warnings` (for example, objects moved to fit the U1's bed) are recorded, so you can show or review them.
- **Checksums for both sides.** `sourceSha256` identifies the exact source that was converted; `sha256` identifies the output.

## In CI

A GitHub Actions job that converts on every push and attaches the files to a release or deploys them with your site:

```yaml
jobs:
  u1-files:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm install --no-save any2orca any2orca-profiles
      - run: node build-u1-files.mjs models dist/u1
      - uses: actions/upload-artifact@v7
        with:
          name: u1-files
          path: dist/u1
```

Copy `build-u1-files.mjs` into your repository next to `models/`. Cache `dist/u1` between runs if you want the "unchanged" skip to carry over.

## Changing it

- **Choose the profile** for every file with `profileId`, or let each file match its own profile (the default). Don't write your own matching.
- **Name the outputs your way** by changing the `output` line.
- **Skip the version note** with `stamp: false` if you prefer; see [the output stamp](../../docs/output-stamp.md). Leaving it in lets you tell later which release produced a file.
- **Hand the files to a different step**, such as uploading to object storage, by reading `u1-files.json`.

## Check it

```sh
npm test -w @any2orca/example-publishing-pipeline
```

The test builds a sample twice (the second run must skip), and builds a folder with a corrupt file (the build must fail and keep the good file's manifest entry).

## License

MIT, like the library. Copy any of it into your own project.
