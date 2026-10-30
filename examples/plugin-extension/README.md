# Browser extension

A Manifest V3 extension that converts a 3MF to Snapmaker U1 in a browser tab. Click the toolbar button, choose a project, download the result. It asks for **no permissions** and makes **no network requests**: the converter and the profile catalog are inside the extension.

This is the starting point for taking the converter into a browser extension, not a finished product for a store listing.

## Try it

You need [Node.js](https://nodejs.org/) 20.19 or newer, Git, and a Chromium-based browser (Chrome, Edge or Brave).

**1. Get the code and build the extension:**

```sh
git clone https://github.com/KuzuriAo/any2orca.git
cd any2orca
npm install
npm run build -w @any2orca/example-plugin-extension
```

The built extension is the folder `examples/plugin-extension/dist`.

**2. Load it into your browser:**

1. Open the extensions page: `chrome://extensions` in Chrome, `edge://extensions` in Edge, `brave://extensions` in Brave.
2. Switch on **Developer mode** (top right in Chrome and Brave; on the left in Edge).
3. Click **Load unpacked** and choose the `dist` folder from step 1 (`any2orca/examples/plugin-extension/dist`), not the `plugin-extension` folder above it.

"any2orca for Snapmaker U1 (example)" appears in the list. Its **Details** page shows it has no site access and no permissions.

**3. Convert a file:**

1. Click the puzzle-piece icon in the toolbar, then **any2orca for Snapmaker U1 (example)**. To keep it one click away, use the pin beside it. (It has no icon of its own, so the toolbar shows a plain letter.)
2. A tab opens: **Convert a 3MF to Snapmaker U1**. Click **Choose a project** and pick a Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer or Flash Studio `.3mf`. The web app's demo model, `apps/web/public/demo-model.3mf` in the repository, works for a first try.
3. When the conversion finishes, a **Download …_U1.3mf** link appears. Click it to save the file where your browser saves downloads.

To watch the privacy promise, open the tab's DevTools (right-click, **Inspect**), go to **Network**, and convert again: every request is for the extension's own files (`chrome-extension://…`).

**Changing it:** after editing the code, run the build again, then press the reload arrow on the extension's card on the extensions page. **Removing it:** **Remove** on the same card.

**If it doesn't load:**

- **"Manifest file is missing or unreadable":** you chose the `plugin-extension` folder. Choose `plugin-extension/dist` instead.
- **No `dist` folder:** the build in step 1 didn't run, or failed; run it again and read its last lines.
- **The browser warns about developer-mode extensions:** some versions do this for any extension loaded with **Load unpacked**. It's expected; keep it, or remove the extension when you're done.

## What it shows

- **No permissions.** [`public/manifest.json`](public/manifest.json) has no `permissions`, no `host_permissions` and no content scripts. Opening a tab of the extension's own page needs none. A test fails if one is ever added.
- **No network.** The catalog is bundled at `profiles/`, and [`src/convert.ts`](src/convert.ts) points the worker at it. The default extension security policy (scripts from the extension only) is enough; there is nothing to relax.
- **A page, not the background script.** A Manifest V3 background service worker can't start a Web Worker, so the conversion runs on an extension page, which can. [`public/background.js`](public/background.js) only opens that page.
- **Relative URLs.** [`vite.config.ts`](vite.config.ts) sets `base: "./"` because the extension is served from `chrome-extension://<id>/` and not a site root.

## Going further

Not built here, but this is how it would go, and what each step costs:

- **A button on pages that list `.3mf` links.** A content script can add it. Fetching the file across sites needs the extension to be granted access to that site (ask for it at the moment of use, per site, rather than for every site). Keep the conversion on the extension page and pass the bytes to it.
- **A right-click "Convert to Snapmaker U1" on a link.** The same, started from a context menu.
- **Another browser.** Firefox declares the background script differently in its manifest. This example has only been loaded in Chromium.
- **A store listing.** Each store has its own review rules and privacy disclosures. State plainly that files are converted on the user's device and never sent anywhere; that is true of this design, and a test checks it.

## Licensing

The extension code is MIT. It bundles the `any2orca-profiles` catalog, which is AGPL-3.0-or-later (shipping it unmodified is fine); keep its license notice with the files if you publish an extension.

## Check it

The browser tests load the built extension in Chromium, convert a file, and check that every request went to the extension's own files:

```sh
npm run test:e2e -w @any2orca/example-browser-tests
```

## License

MIT, like the library. Copy any of it into your own project.
