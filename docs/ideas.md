# Ways to use any2orca

any2orca is a converter that runs wherever you run it: a command, a library, a Web Worker, a static page. That makes it a building block as much as a tool. This page is a set of starting points, grouped by who you are. None of it is built for you in advance, and none is a promise about what the project will add; each idea points at the code that already does the hard part.

Every idea here keeps the same promise: **the file is converted on the machine that holds it**, and nothing about the model is sent anywhere. Where an idea can't keep that on its own, it says so.

## If you make and share models

- **Ship a Snapmaker U1 file with every model.** Keep your source projects in a folder and let your build produce the U1 versions and a list of them, with checksums. Start from [`examples/publishing-pipeline`](../examples/publishing-pipeline); run it in CI so a broken model stops the publish.
- **Put a "Convert to Snapmaker U1" button on your model page.** Embed the converter in your page, or hand the visitor's file to the hosted app. The [integration guide](integration-guide.md) compares the options, from a plain link to embedding the library, and [`examples/web-stack-embed`](../examples/web-stack-embed) is a working button.
- **Attach U1 files to your releases.** A CI job that converts and uploads the files next to the originals means people get the right file without asking.
- **Check every project converts cleanly before you publish.** `report.warnings` is written for people. Fail a build on warnings you care about, or collect them in a review.

## If you tune your prints, or check other people's

- **See what a creator changed from stock.** Convert the download, then `any2orca diff model_U1.3mf --against-stock` lists only the settings the creator chose: walls, infill, supports, speeds. Useful before you print it, or to learn from a model that prints well. [Compare 3MF settings](compare-settings.md).
- **Print everyone's models your way.** Tune one project in Snapmaker Orca, save it as a [preset](presets.md), and convert downloads with your settings instead of each creator's. `any2orca diff model_U1.3mf --against-preset "Mine"` on a converted download shows what your preset would change on it.
- **Audit a catalog against stock or a house standard.** [`examples/settings-audit`](../examples/settings-audit) checks a folder of projects and fails when a setting differs that you didn't allow. Run it before publishing, so a setting you changed while testing never ships.
- **Catch settings drift over time.** Keep a reference project, and compare each new version of a model with it in CI: `any2orca diff` exits `1` when anything differs, and `--json` gives a script the details.
- **Review a collaborator's changes.** Compare their copy of a project with yours to see exactly which settings they touched, grouped and named the way Snapmaker Orca shows them.

## If you run a community, a shop or a makerspace

- **A conversion page on your own server.** The web app is a folder of static files. [Run it yourself](run-the-web-app.md) on your domain, or on a machine on your local network, including one with no internet connection.
- **A drop folder.** `any2orca convert --watch ./incoming --out-dir ./converted --archive-dir ./done` converts each project as it lands and moves the original out of the way. Put it on a shared drive for a workshop where members drop in files.
- **A right-click or "Send to" action.** A small script that calls `any2orca convert` on the selected files is enough to add "Convert to U1" to a file manager. The command's exit code tells your script whether it worked.
- **Intake for a print service.** Convert incoming projects in your own queue with the library, and show the customer the notes it produced (objects moved to fit the bed, a profile substituted) before you quote.

A word of care for anything that receives files over a network: once a file is uploaded to your service, the "never leaves your device" promise is yours to make and keep, not any2orca's. Say plainly what you do with it, and delete it when you're done.

## If you build tools

- **A browser extension.** [`examples/plugin-extension`](../examples/plugin-extension) converts a file inside the extension with no permissions and no network. From there, a button on pages that list `.3mf` links is a natural next step.
- **A desktop app.** The library runs in Node and in a browser engine, so it fits inside Electron, Tauri or any shell that can host a web view or run Node. Convert in the app's own process, keep the profile catalog in the app, and there is nothing to host.
- **Your own front end.** [`examples/minimal-ui`](../examples/minimal-ui) is the whole flow in about 140 lines, and [Build your own UI](build-your-own-ui.md) has a brief you can give an AI coding agent plus the rules a good one follows.
- **An analysis tool for your library of projects.** `inspect()` reads a project without converting it: plates, objects, filaments, nozzle, layer height, printer and source slicer. Run it over a folder to find which files use which printers, which need attention, and what you actually have.
- **A profile data source.** The Snapmaker U1 profiles are published as their own package, `any2orca-profiles`, in a documented format. Anything that wants the U1's process settings can read them without the converter.

## If you teach or write

- **Write tutorials readers can check.** Each converted file records the version, profile and options that made it (see [the output stamp](output-stamp.md)), so a tutorial can say exactly which release it was written against and a reader can check.
- **Show the privacy claim working.** [Privacy](privacy.md) has a one-minute DevTools check and a turn-off-the-network test for the command line. They make a good demonstration for a class or a post.

## What to keep in mind

- **Let the library pick the profile.** Pass `profileId` only when a person chose one.
- **Show the notes.** They explain things people would otherwise discover on the printer.
- **Downloads are the person's click.**
- **If you collect usage numbers, make them opt-in and visible.** The library has the parts: `buildStatsEvent`, `resolveStatsConsent`, and a [reference collector](../examples/stats-collector).
- **Keep the version note unless you have a reason.** It's what lets a bad file be recognized later; it can be left out (`stamp: false`, `--no-stamp`).

## Built something?

If you build something with any2orca, post it in [Show and tell](https://github.com/KuzuriAo/any2orca/discussions/new?category=show-and-tell). If you'd like more people to find it, tick the box at the end of the form and it's listed on the [showcase](showcase.md), with a link to your project. Nothing is listed without your say-so, and the [rules](showcase.md#what-a-listing-needs) are short: say plainly whether a file leaves the user's device.
