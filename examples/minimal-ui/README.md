# Minimal UI

The smallest real front end on the any2orca library, for anyone building their own. Drop a file, see what is in it, pick a profile, convert, download. Under 140 lines of plain TypeScript, no framework.

It is a teaching example, not the full app. For the complete, polished interface see [`apps/web`](../../apps/web); for the rules and reasons behind every choice see [Build your own UI](../../docs/build-your-own-ui.md).

## Run it

From the repository root:

```sh
npm install
npm run dev -w @any2orca/example-minimal-ui
```

Open the printed address (usually `http://localhost:5173/`) and drop a Bambu Studio, Creality Print or Anycubic Slicer Next `.3mf` on the dashed box, or click it to choose one. No project handy? Use the repository's demo model, `apps/web/public/demo-model.3mf`. The page lists what's in the file and the matched profile; click **Convert**, then the **Download** link that appears. `Ctrl+C` in the terminal stops the server.

## The flow, in [`src/main.ts`](src/main.ts)

1. **Open once.** `converter.open(bytes)` hands the file to a Web Worker and returns an `inspection` (plates, objects, filaments, nozzle, layer height, printer, source vendor, warnings). It is cheap, and it drives everything you show.
2. **Show what is in it.** The page lists the facts from `inspection`. File-derived text goes in with `textContent`, never as HTML.
3. **Ask the library for the matched profile.** `project.matchProfile()` says which profile auto-matching would pick, and `converter.listProfiles()` gives the choices. Don't write your own matching.
4. **Convert.** `project.convert()` runs in the worker, so a large file never freezes the page. `profileId` is passed only when the user changed the selection from the matched one, so the library's own matching still applies otherwise.
5. **Offer the download.** The page adds a link the user clicks. Nothing downloads on its own.

Errors have stable codes (`invalid_file`, `too_large`, `invalid_project`, `profile_not_found`, `profile_data`) on `Any2orcaError`, so the page can say something useful without parsing messages.

## What it leaves out on purpose

Batches and `.zip` bundles (see [`web-stack-embed`](../web-stack-embed)), the Liber High Flow Hotend and filament naming options, a plate preview, usage stats, and polish such as progress bars and drag feedback beyond a border. Each is a few lines on top of the same calls; the reference app has them if you want working code.

## Hosting it

`npm run build -w @any2orca/example-minimal-ui` produces a static site in `dist/`, including the profile catalog under `profiles/`. Any static host works. Your own copy keeps everything on your own domain.

## Check it

The browser tests run a real conversion in Chromium and check that every request is a plain `GET` for one of the site's own files:

```sh
npm run test:e2e -w @any2orca/example-browser-tests
```

## License

MIT, like the library. Copy any of it into your own project.
