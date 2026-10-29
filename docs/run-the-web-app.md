# Run the web app yourself

The any2orca web app is a static site: a folder of files. There is no server to run, no database and no account, and nothing to configure for it to work. Everything happens in the visitor's browser, so you can run it on your own computer, on a home server, or on any static host.

Reasons to run your own copy: you want conversion on your own domain, you want it available on a network with no internet, you're building on it, or you simply don't want to rely on someone else's site.

## Try it on your computer

You need Node 20.19 or newer (22.12 or newer for the accessibility tests).

```sh
git clone https://github.com/KuzuriAo/any2orca.git
cd any2orca
npm install
npm run dev -w @any2orca/web
```

Open `http://localhost:5173`. The first `npm install` also builds the converter library, so there is nothing else to do. Edits to the app reload instantly.

## Build it for hosting

```sh
npm run build -w @any2orca/web
```

`apps/web/dist/` is the whole site: the page, its scripts, fonts, and the printer profile catalog under `profiles/`. Put that folder on any static host. Cloudflare Pages, Netlify, GitHub Pages, nginx, Apache, a Raspberry Pi and an S3 bucket all work.

To check it first with nothing but Python:

```sh
cd apps/web/dist
python3 -m http.server 8080
```

Each release also attaches a ready-built `any2orca-web-<version>.tgz` of this folder (the default skin), if you'd rather not build it yourself, and a `SHA256SUMS` file. Check the download against it before unpacking it into your web root:

```sh
sha256sum -c SHA256SUMS        # on macOS: shasum -a 256 -c SHA256SUMS
```

To check that the tarball was built by this repository's release workflow, not just that it matches the checksum file next to it, verify its build provenance with the GitHub CLI:

```sh
gh attestation verify any2orca-web-<version>.tgz --repo KuzuriAo/any2orca
```

### Under a subpath

For an address like `https://example.com/tools/any2orca/` (a GitHub Pages project site is always one), tell the build where it will live:

```sh
npm run build -w @any2orca/web -- --base /tools/any2orca/
```

The catalog path follows. Serve the contents of `dist/` at that path.

### What the host needs to do

Very little. The site is one page that reads its options from the address (`?ref=`, `?manifest=`, `?handoff=1`), so no rewrite rules are needed. Make sure `.js` files are served as JavaScript (every host does) and that nothing is blocking the page from requesting its own files.

## Hide sections you don't want

A copy for your own use (or your team) often doesn't need the marketing sections. The page hides what you list in one attribute on its own HTML, `<html data-hide="beyond,faq">`, read once as it starts. It makes no extra request, it works under the strict Content Security Policy below, and there is no settings file for a visitor to download.

| Name | Hides |
|---|---|
| `beyond` | The "Beyond the Web App" section |
| `faq` | The FAQ section and the FAQ button |
| `integrate` | The Integrate button and the partner integration selector |
| `support` | The Ko-fi link in the footer |

The link to the source code is never hidden. The web app is AGPL-3.0, and a copy served to other people has to offer them its source. Names the page doesn't know are ignored.

Pick whichever way suits how you host:

**1. A private settings file, applied with one command (works on any host).** Keep a file outside the folder your web server serves, for example `/etc/any2orca.json`:

```json
{ "hide": ["beyond", "faq"] }
```

Then, after unpacking a release or building:

```sh
node scripts/configure-web.mjs /var/www/any2orca --config /etc/any2orca.json
```

It checks the file (only `hide` is allowed, only the names above), refuses a file that is inside the web root (it would be downloadable), and sets the attribute in `index.html`. Nothing else in the site changes, and the file is never served. Run it again after you unpack an update, and `node scripts/configure-web.mjs /var/www/any2orca --clear` removes it. It needs Node 20 or newer.

**2. Let your web server add the attribute.** No script, no Node. For nginx, in the `server` block that serves the site:

```nginx
sub_filter '<html lang="en"' '<html lang="en" data-hide="beyond,faq"';
sub_filter_once on;
```

For Apache, with `mod_substitute` and `mod_filter` loaded:

```apache
AddOutputFilterByType SUBSTITUTE text/html
Substitute "s|<html lang=\"en\"|<html lang=\"en\" data-hide=\"beyond,faq\"|"
```

Both were tried on a built copy (nginx 1.31 and Apache 2.4). [`examples/self-hosting`](../examples/self-hosting) has complete nginx and Apache configs with these lines, the security headers below and caching, tested against real servers. They match the page's opening tag, `<html lang="en"`, so if you've changed that tag, change the match to fit. Check the page source after reloading your server.

**3. When you build it yourself:** `VITE_HIDE_SECTIONS=beyond,faq npm run build -w @any2orca/web` writes the attribute into `index.html`. A name that isn't in the list stops the build with a message.

To check any of these, view the page source: the `<html>` tag shows the attribute, and the hidden sections are gone from the page.

## Check that your copy keeps the promise

Your copy makes requests to one place only: itself. To see that for yourself, open DevTools, go to the **Network** tab, convert a file, and read the list. The steps are in [Privacy](privacy.md#check-it-yourself-in-a-minute) and apply unchanged to your copy. The app contacts no other host (apart from files you choose to hand it with `?manifest=`), so a strict security policy works.

### A strict Content Security Policy

If you serve security headers, this policy is enough for the app to convert a file with no violations (tested against a real conversion):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

Notes:

- **No inline scripts.** The small script that sets the light or dark theme before the page paints is its own file (`theme.js`), so `script-src 'self'` covers it with no hash.
- **Loading files from other sites** (the `?manifest=` option) needs `connect-src` to include those hosts. Leave it as `'self'` if you don't offer that.
- **Embedding** the page in another page needs `frame-ancestors` changed from `'none'`.

## Make it yours

Tell the build where your copy lives, and it names your site everywhere the official one would be named: the canonical link, the link-preview tags, the structured data, `robots.txt` and the sitemap.

```sh
VITE_SITE_URL=https://example.com npm run build -w @any2orca/web
```

| Setting | What it does |
|---|---|
| `VITE_SITE_URL` | Your site's address: `https://example.com`, or `https://example.com/tools/any2orca` under a subpath. Only `http` or `https`, with no query, fragment or user name; anything else stops the build with a message saying why. Unset (or `none`), the build is a private copy: no canonical link or sitemap, a `noindex, nofollow` tag, and a `robots.txt` that asks search engines to stay away. So set it whenever you want search engines to list your copy. |
| `VITE_BRAND` | The skin: `oss` (the default, neutral) or `a2o` (the official site's look). |

Also replace `apps/web/public/og-image*.png`, the preview image people see when your link is shared.

To restyle your copy, edit the design tokens (colors, fonts, radii) in `apps/web/src/skins/oss.css`. The components use only tokens, never color literals, and `npm run lint -w @any2orca/web` fails if one slips in, so changing the tokens changes the whole app.

## Keeping the profiles current

Printer profiles ship as the `any2orca-profiles` package, and the build copies its current data into the site. To update, pull the latest version of the repository (or update the package), then rebuild and redeploy. To try profiles of your own, build the site and then replace the files under `dist/profiles/`; the format is in [`packages/profiles/README.md`](../packages/profiles/README.md). The build copies the packaged catalog each time, so changes made before a build are overwritten.

## Working without internet

Once your copy is on a machine the visitor can reach, nothing else is needed. The app doesn't load fonts, scripts or data from anywhere else, so a copy on a home server or a LAN-only machine works with no connection to the wider internet.

## License

The web app is AGPL-3.0-or-later. You can run it, change it and host it. If you change it and let other people use your version over a network, the license asks you to offer those users the source of your changed version; a link to your fork is the usual way. The converter library underneath is MIT. See [`NOTICE`](../NOTICE) for the fonts and other bundled material.

## If something goes wrong

- **A blank page under a subpath:** the build wasn't made with `--base` for that path. Rebuild with it.
- **"Couldn't load ... profiles":** the `profiles/` folder didn't get deployed with the rest of `dist/`, or a rule is blocking it. Open the file's address directly in your browser to see.
- **A console message about a Content Security Policy:** compare your header with the one above.
