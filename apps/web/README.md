# any2orca web UI

The browser app: drop in a `.3mf`, pick a profile, download the converted file. It is a static site. Conversion runs entirely in the page using the `any2orca` library, so there is no server to run and your files never leave your device.

## Run it locally

From the repository root:

```sh
npm install
npm run dev -w @any2orca/web
```

## Build and self-host

```sh
npm run build -w @any2orca/web
```

`apps/web/dist/` is the whole site. Serve it from any static host (Cloudflare Pages, Netlify, GitHub Pages, nginx, an S3 bucket). The build includes the profile catalog under `profiles/`, which the app loads from its own origin; it makes no requests to any other host.

Building for a subpath (e.g. `https://example.com/any2orca/`): pass Vite's base, `npm run build -w @any2orca/web -- --base /any2orca/`. The catalog path follows it.

For the full guide on self-hosting, subpaths, and Content Security Policy, see [`docs/run-the-web-app.md`](../../docs/run-the-web-app.md).

## Options

Set at build time (see `.env.example`):

| Variable | Values | Effect |
|---|---|---|
| `VITE_BRAND` | `oss`, `a2o` | The skin. `oss` is the default neutral open-source skin; `a2o` is the any2orca.com skin. |
| `VITE_SITE_URL` | `http://...`, `https://...`, `none` | The site address for canonical links, preview metadata, and sitemaps. Accepts an `http:` or `https:` URL without query strings, fragments, or credentials (supports subpaths). Unset (or `none`), the build is a private copy: no canonical link or sitemap, a `noindex, nofollow` tag, and a `robots.txt` that asks search engines to stay away. |
| `VITE_HIDE_SECTIONS` | comma-separated list of `beyond`, `faq`, `integrate`, `support` | Optional list of landing sections to omit from the page at build time (e.g. `beyond,faq`). |

## How it fits together

- Conversion, profile matching and file inspection come from `packages/core` (`any2orca`). This app never re-implements them.
- The profile catalog is `packages/profiles` (`any2orca-profiles`); `scripts/copy-profiles.mjs` copies its `data/` into `public/profiles/` before `dev` and `build`.

## License

AGPL-3.0-or-later (see `LICENSE`). The bundled fonts are under the SIL Open Font License; see `public/fonts/` and the repository's `NOTICE`.
