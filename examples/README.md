# Examples

Working code for the ways people use any2orca. Each folder is self-contained, MIT licensed, and covered by tests, so you can copy one into your own project and know it behaved when it was last run. You need [Node.js](https://nodejs.org/) 20.19 or newer and Git. Set up once:

```sh
git clone https://github.com/KuzuriAo/any2orca.git
cd any2orca
npm install
```

Every example's commands run from that `any2orca` folder, the repository root.

The commands are tested on macOS and on Linux (the repository's CI). They should work in Windows PowerShell too, but haven't been tried there yet; the stats collector's are for a macOS or Linux shell only. If one fails on Windows, please [open an issue](https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml) with the command and the error.

Each folder is a package in the repository's npm workspaces, named `@any2orca/example-<folder>`, so `npm run start -w @any2orca/example-batch-script -- ./my-models` runs the `batch-script` example from the repository root. These names exist only inside this repository; they aren't published to npm. Folders and files you pass are read from where you run the command.

| Example | What it is | Runs in |
|---|---|---|
| [`batch-script`](batch-script) | Convert a folder of projects, keep going past bad files, exit non-zero if any failed. About 75 lines. | Node |
| [`publishing-pipeline`](publishing-pipeline) | A publish step: convert your source projects, skip unchanged ones, write a manifest with checksums, fail the build on a broken model. | Node, CI |
| [`minimal-ui`](minimal-ui) | The smallest real front end: drop a file, inspect, pick a profile, convert, download. | Browser |
| [`web-stack-embed`](web-stack-embed) | Add a "Convert to Snapmaker U1" button to a page you already have. Handles `.zip` bundles. | Browser |
| [`plugin-extension`](plugin-extension) | A browser extension with no permissions and no network. | Browser extension |
| [`presets`](presets) | Make a preset from a project you tuned, then convert a folder of downloads with your settings. | Node |
| [`what-changed`](what-changed) | Convert a folder, keep each file's "What changed?" record next to it, and flag files a person should review. | Node, CI |
| [`read-stamp`](read-stamp) | List which release, profile set and options made each converted file, and find files made before a fix. | Node |
| [`self-hosting`](self-hosting) | nginx and Apache configs for the web app: security headers, caching, a real 404 and hidden sections, tested against real servers. | nginx, Apache |
| [`settings-audit`](settings-audit) | Check a folder of projects against Snapmaker's stock profile or your house preset, and fail CI on settings you didn't allow. | Node, CI |
| [`stats-collector`](stats-collector) | A small, hardened receiver for the opt-in usage stats, with a token-protected summary endpoint and a summary script. | Node |

Not sure where to start? [Ways to use any2orca](../docs/ideas.md) has more ideas, and the [integration guide](../docs/integration-guide.md) compares the options. If you want the complete web app on your own server, see [Run the web app yourself](../docs/run-the-web-app.md).

## Running the tests

Every example has tests. The Node ones run with the rest of the repository's tests (`npm test`). The ones that need a real browser (`minimal-ui`, `web-stack-embed`, `plugin-extension`) live in [`browser-tests`](browser-tests), which is not an example itself; [its README](browser-tests/README.md) says what each test checks and how to add one:

```sh
npx playwright install chromium   # once
npm run test:e2e -w @any2orca/example-browser-tests
```

## What every example follows

These are the same rules as the reference app, and they hold for anything you build:

- **Never upload the file.** The conversion runs on the user's own device or in your own build.
- **Let the library pick the profile.** Pass `profileId` only when the user chose one.
- **Show the conversion notes.** `report.warnings` is written for the person using the result.
- **Downloads are the user's click.** Offer a link; don't start one.
- **Treat input as untrusted.** Names, notes and file contents are shown as text, never as HTML; printed to a terminal, they go through `plainText()` first, so a crafted value can't send control codes. Anything that takes network input (the collector) validates strictly and bounds its work.

Built something from one of these? Post it in [Show and tell](https://github.com/KuzuriAo/any2orca/discussions/new?category=show-and-tell), and ask for it to be listed on the [showcase](../docs/showcase.md) if you'd like.
