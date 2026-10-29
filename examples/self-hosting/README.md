# Self-hosting configs

Ready-to-copy server configs for hosting the any2orca web app yourself, with the security headers, caching and optional hidden sections from [Run the web app yourself](../../docs/run-the-web-app.md). Both are tested by starting a real nginx and a real Apache against a stand-in site.

| File | What it is |
|---|---|
| [`nginx/any2orca.conf`](nginx/any2orca.conf) | A `server` block for nginx. |
| [`apache/any2orca.conf`](apache/any2orca.conf) | A virtual host for Apache 2.4 (needs `mod_headers`). |
| [`any2orca.json`](any2orca.json) | A sample settings file for `scripts/configure-web.mjs`, the other way to hide sections. |

## Use it

1. Put the site in place, in `/var/www/any2orca`: either unpack a release's `any2orca-web-<version>.tgz` there (check it against `SHA256SUMS` first), or build it yourself from the repository root and copy the result:
   ```sh
   VITE_SITE_URL=https://convert.example.com npm run build -w @any2orca/web
   sudo mkdir -p /var/www/any2orca && sudo cp -R apps/web/dist/. /var/www/any2orca/
   ```
   `VITE_SITE_URL` is your site's address; leave it out for a private copy that search engines skip ([Run the web app yourself](../../docs/run-the-web-app.md#make-it-yours) has the other settings).
2. Copy the config for your server, change `server_name`/`ServerName` and the root if yours differ, and add TLS the way you already do for your other sites. Uncomment the `Strict-Transport-Security` line once it's served over HTTPS.
   - **nginx:** usually `/etc/nginx/conf.d/any2orca.conf`, or `/etc/nginx/sites-available/` plus a link in `sites-enabled/` on Debian and Ubuntu.
   - **Apache:** usually `/etc/apache2/sites-available/any2orca.conf` and `sudo a2ensite any2orca` on Debian and Ubuntu (`/etc/httpd/conf.d/` elsewhere). It needs `mod_headers` (`sudo a2enmod headers`), and `mod_substitute` and `mod_filter` only if you turn on hidden sections.
3. Check and reload: `nginx -t && nginx -s reload`, or `apachectl configtest && apachectl graceful`.

## What the configs do

- **Security headers.** The Content-Security-Policy the app is tested against (it converts a file with no violations), plus `X-Content-Type-Options`, `Referrer-Policy` and a `Permissions-Policy` that turns off the camera, microphone, location and payments. If you offer `?manifest=` hand-offs from other sites, add those hosts to `connect-src`; to embed the page elsewhere, change `frame-ancestors`.
- **Caching.** Built scripts and styles have a content hash in their names, so they're cached for a year. The page, the profile catalog and the fonts are checked with the server on every visit (`no-cache`), so an update shows up at once.
- **A real 404.** The app reads its options from the address and needs no rewrite rules, so unknown paths get a plain 404 instead of the page.
- **Hidden sections, optional.** Uncomment the `sub_filter` (nginx) or `Substitute` (Apache) lines to add `data-hide="beyond,faq"` to the page as it's served. Names: `beyond`, `faq`, `integrate`, `support`. The link to the source code is never hidden: the web app is AGPL-3.0, and a copy served to other people has to offer its source.

**Or hide sections in the files instead**, with no server changes: keep `any2orca.json` outside the web root (for example `/etc/any2orca.json`) and run

```sh
node scripts/configure-web.mjs /var/www/any2orca --config /etc/any2orca.json
```

after each update.

**nginx note:** an `add_header` inside a `location` block drops every `add_header` from the server level for that location. The config sets caching with `expires` instead, so the security headers apply everywhere. Keep it that way if you add locations.

## Check it

```sh
npm test -w @any2orca/example-self-hosting
```

The tests start nginx and Apache with these configs (each is skipped if that server isn't installed), and check the policy, the caching of the page, a hashed script and the profile catalog, the 404, and hidden sections with the optional lines turned on. They also check that both configs carry exactly the policy shown in the docs, and that `configure-web` applies the sample settings file.

## License

MIT. Copy any of it into your own setup.
