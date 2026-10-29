# Web-stack embed

Add a "Convert to Snapmaker U1" button to a page you already have, by embedding the `any2orca` library. The conversion runs in a Web Worker inside your page: no hosted site, no popup, no server, and the visitor's file is never uploaded anywhere.

This is the path for a site that wants conversion as part of its own page. If you'd rather just link visitors to the any2orca site, see the hand-off options in [`docs/integration-guide.md`](../../docs/integration-guide.md) instead; they need no code from this package at all. Not sure which fits your site? The guide has [a prompt for your AI coding agent](../../docs/integration-guide.md#let-your-ai-coding-agent-choose) that checks your codebase and picks one.

## Run it

From the repository root:

```sh
npm install
npm run dev -w @any2orca/example-web-stack-embed
```

Open the printed address (usually `http://localhost:5173/`). It's a made-up model page with the converter added to it: click **Download 3MF** to save the page's sample file, then click **Convert a 3MF to Snapmaker U1** and pick that file. A **Download …_U1.3mf** link appears under the button, with any conversion notes. `Ctrl+C` in the terminal stops the server. A `.zip` of several `.3mf` files works too; each one converts and gets its own download link.

## What it takes on your own site

Three things, all shown in this folder:

1. **Install the two packages.**
   ```sh
   npm install any2orca any2orca-profiles
   ```
   `any2orca` is the converter (MIT). `any2orca-profiles` is the printer profile catalog (AGPL-3.0-or-later; shipping it unmodified is fine).

2. **Serve the profile catalog from your own site.** Copy `node_modules/any2orca-profiles/data/` to a folder your site serves, e.g. `/profiles/`. [`scripts/copy-profiles.mjs`](scripts/copy-profiles.mjs) does this before every `dev` and `build`. The worker fetches `index.json` plus only the profiles it actually uses.

3. **Start the worker and convert.** [`src/main.ts`](src/main.ts) is the whole integration; the core of it is:
   ```ts
   import { createConverterWorker } from "any2orca/worker";
   import ConverterWorkerScript from "any2orca/worker-entry?worker"; // Vite

   const converter = createConverterWorker(new ConverterWorkerScript(), { profilesUrl: "/profiles/" });
   const { project } = await converter.open(fileBytes, { transfer: true });
   const { output, report } = await project.convert();
   // output: the converted .3mf as a Uint8Array. report: the profile used, warnings, and more.
   await project.close();
   ```

Not using Vite? Any bundler that supports module workers works; create the worker with `new Worker(new URL("any2orca/worker-entry", import.meta.url), { type: "module" })` in place of the `?worker` import.

## Notes for production

- **Profile matching is automatic.** `convert()` picks the profile from the file's own settings (nozzle size, layer height, the name of the source's print preset). To let visitors choose, call `project.matchProfile()` to show the default and `converter.listProfiles()` for the choices, then pass `profileId` to `convert()` only when they pick something different. Don't write your own matching; use these, so every site picks the same profile for the same file.
- **Show the warnings.** `report.warnings` holds notes worth showing the visitor, e.g. when objects had to be moved closer together to fit the U1's bed. The example lists them under each download.
- **Let the visitor start the download.** The example offers a link rather than downloading automatically, so nothing lands on anyone's disk unasked.
- **Errors have codes.** A failed conversion throws an error with a stable `code` (`invalid_file`, `too_large`, `invalid_project`, `profile_not_found`, `profile_data`), so you can show your own messages.
- **Content Security Policy.** If your site sets one, the worker needs `worker-src 'self'` and the catalog needs `connect-src 'self'` (or wherever you serve it). Nothing else is required: the library contacts no other host.
- **Hosting under a subpath.** The example builds `profilesUrl` from Vite's `BASE_URL`, so it keeps working at e.g. `https://example.com/models/`.
- **Every output is stamped** with `Metadata/any2orca.json`, recording the any2orca version, catalog version and options used. It contains nothing about the visitor or the file name. See [`docs/output-stamp.md`](../../docs/output-stamp.md).

## Check it

The browser tests convert a file through this example in Chromium and check that every request is a plain `GET` for one of the site's own files:

```sh
npm run test:e2e -w @any2orca/example-browser-tests
```

## License

MIT, like the library. Copy any of it into your own project.
