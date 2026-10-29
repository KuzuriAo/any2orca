# Privacy: what leaves your device, and how to check

The promise: **your 3MF file is never uploaded to any2orca or to anyone else.** It is converted in your browser, in your terminal (the CLI) or inside your own code (the library). This page says exactly what each part does on the network, and gives you ways to check it yourself, because a privacy promise is only worth something if you don't have to take it on trust.

## What each part does on the network

| | What it requests | Your file |
|---|---|---|
| **Library** (`any2orca`) | Nothing, ever. Profile data comes from a source you give it. | Stays in your process. |
| **CLI** (`any2orca`) | A once-a-day check of the npm registry for a newer version (sends the package name; interactive terminals only, never in CI). Anonymous usage stats only if you turn them on, and only to a collector address you set. See [the CLI reference](cli.md). | Never sent. |
| **Web app** | Its own static files: the page, scripts, fonts and the profile catalog (`index.json`, plus the one profile file your conversion uses), all from the same site. On any2orca.com only, also Cloudflare Web Analytics (below). | Never leaves the page. |
| **Hand-offs** (a `?manifest=` link or a `postMessage` from another site) | A manifest link fetches the files it names, from that host, only after you confirm, and without cookies. A `postMessage` hand-off moves bytes between two tabs in your browser. | Goes from the site that has it to your browser, never through any2orca. |

## The hosted site's page counts

any2orca.com uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to count page views and see where visitors come from. It sets no cookies and never sees your file. Cloudflare adds it to the hosted site; it isn't part of this repository, so a copy you build or host yourself includes no analytics. If you want page counts on your own copy, adding them is up to you.

Like any web host, the hosted site also sees ordinary request metadata for the pages and files it serves (IP address, browser, which file was requested), and I count requests for the profile files to estimate how often the converter is used. None of that includes your file, because your file never makes a request.

## Check it yourself in a minute

In Chrome, Edge or Firefox:

1. Open the site, then open DevTools (`F12`) and go to the **Network** tab. Clear it.
2. Drop a `.3mf` file on the page and convert it.
3. Look at what was requested. You should see plain `GET` requests for the app's own files and for a profile file, all on the same site, and nothing whose **Request payload** holds your file.
4. Click any request and open **Payload** or **Request**. For a GET there is nothing to send.

On any2orca.com you'll also see Cloudflare's analytics script load from `static.cloudflareinsights.com` and send a small page-view report (a `POST` to `/cdn-cgi/rum`, a few hundred bytes). Open its payload: it holds page timings, the page address and the page you came from, never your file, which is megabytes. A copy you build yourself shows neither.

## Check the command line with networking off

Want to verify nothing leaves? Turn off networking and convert some files. For the command line, that is the whole test: switch off Wi-Fi or unplug the cable, then run `any2orca convert` on your projects. They convert normally, because everything the converter needs is already on your machine. A program that has to upload a file can't do it with no network.

If you'd rather not touch your connection, have the operating system deny the network to just that one command:

- **macOS:** `sandbox-exec -p '(version 1) (allow default) (deny network*)' any2orca convert project.3mf`
- **Linux:** `unshare -rn any2orca convert project.3mf`

To confirm the block works, run `curl https://example.com` the same way first. It should fail.

The web app needs the network to fetch its own files and the profile for your printer, so for that, use the DevTools check above.

## A check that runs on every change

The repository's browser tests include [`apps/web/e2e/privacy.spec.ts`](../apps/web/e2e/privacy.spec.ts). It opens the app, converts a file, and fails if any request, for the whole session, goes to another origin, or if any request has a body while opening or converting. It runs in CI for both skins, so a change that starts sending data fails before it can ship. It tests the code in this repository, so it doesn't see the analytics Cloudflare adds to the hosted site. Run it yourself:

```sh
npm ci
npm run test:e2e -w @any2orca/web
```

## Read the code

Network access is rare enough to list. Search for `fetch`:

```sh
grep -rn "fetch" apps/web/src packages/core/src --include='*.ts' --include='*.svelte' | grep -v test
```

It prints a few dozen lines, because the same few requests are named in many places (`fetchProfiles`, `fetchProfileCatalog`, comments). Every real request is one of these:

- **The profile source** (`fetchProfileSource` and `doFetch` in `packages/core/src/profiles.ts`), the only place the library itself can make a request, and only when you choose that source and give it a URL.
- **The manifest fetch** in `apps/web/src/lib/handoff.ts`, which runs only after the visitor confirms, and uses `credentials: "omit"`.
- **The CLI's two requests**, the update check (`cli/updateCheck.ts`) and the opt-in stats (`cli/stats.ts`), covered in [the CLI reference](cli.md).
- **The web app's own profile catalog requests** (`apps/web/src/lib/api.ts` and the components that load the catalog): same-site requests for `profiles/index.json` and one profile file, the data a conversion runs on.
- **The Integrate panel's demo file** in `apps/web`, a request for a bundled sample on the same site.

## Self-hosting

The web app is a static site. Build it (`npm run build -w @any2orca/web`) and serve `apps/web/dist` from your own domain, with your own profile copy, and nothing in the path involves anyone else's server.

## What a converted file contains

Besides your project, every converted file gets one small entry, `Metadata/any2orca.json`: the any2orca version, the profile catalog version, the profile used, and the options chosen. It is there so a file can be recognized later (which version made it, so you know whether a later fix affects it) and so bug reports are exact. It holds no file names, paths, times or identifiers, and it never leaves the file. You can leave it out: untick the option in the web app, use `--no-stamp` on the command line, or pass `stamp: false` in the library. The full explanation is in [the output stamp page](output-stamp.md).

## What this does not cover

- A copy of the site that someone else modified can behave differently. Use the official site, or build from source and compare.
- Your own browser extensions can see what you do on any page.
- Files you hand to another site's "Convert to Snapmaker U1" button are that site's responsibility until the hand-off happens. See [the integration guide](integration-guide.md).
