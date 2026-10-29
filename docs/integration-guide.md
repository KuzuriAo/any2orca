# Integration guide

How to add "Convert to Snapmaker U1" to your own site, tool or pipeline. Every option keeps the same guarantee: the 3MF is converted on the visitor's own device and is never uploaded to any2orca or anyone else.

## Pick a path

| You have | Use | Code on your side |
|---|---|---|
| A page, post, README or Discord message | [Link out](#1-link-out) | None |
| Model files at public URLs | [Manifest link](#2-manifest-link) | Build a URL |
| The file already in the visitor's browser (you `fetch()` it before saving) | [Hand-off with postMessage](#3-hand-off-with-postmessage) | About 20 lines |
| A page where conversion should happen in place, no new tab | [Embed the library](#4-embed-the-library) | A small script |
| A build, publish or batch process | [Library or CLI](#5-library-or-cli-for-pipelines) | A few lines of Node |

Paths 1 to 3 send the visitor to an any2orca site: the hosted one, or your own copy of [`apps/web`](../apps/web) (a static site you can host anywhere, which also keeps everything on your own domain). Paths 4 and 5 run the converter in your own page or process; no any2orca site is involved at all.

The examples below use the hosted site's address:

```js
const ANY2ORCA = "https://any2orca.com"; // or your own copy
```

## Let your AI coding agent choose

If you work with an AI coding agent, give it this prompt in your site's codebase. It has the agent check your downloads, file host and build steps, then pick one path and write the change:

```text
You're adding a "Convert to Snapmaker U1" option to this project using any2orca. First read https://github.com/KuzuriAo/any2orca/blob/main/docs/integration-guide.md. It describes five paths: link out, manifest link, postMessage hand-off, embedding the library, and the library or CLI for pipelines.

Then look at this codebase and decide which one fits. Check:
- How a visitor gets a .3mf here today: a plain link, or a fetch() in the browser before saving.
- Whether the file host sends CORS headers (Access-Control-Allow-Origin), and whether downloads need cookies or a login.
- Whether there's a build, publish or batch step where conversion could run instead.
- Any Content Security Policy that a Web Worker or a new tab would need to fit.

Answer in this shape:
1. The path: one of the five, by its name in the guide.
2. Why: a few short points from what you found in this codebase.
3. The change: the exact files and code to add, following the guide's rules (let any2orca pick the profile, show the conversion notes, never start a download automatically).

Pick one path. Don't give a neutral comparison.
```

## 1. Link out

```html
<a href="https://any2orca.com/?ref=your-site">Convert to Snapmaker U1</a>
```

The visitor downloads your file as usual and drops it on the any2orca page.

`ref` is optional. It tells the visitor where the file came from: the app shows "Imported via your-site". any2orca.com keeps no per-site conversion counts, so it isn't a referral statistic there; a copy you host yourself can count it if you add stats of your own. It must be 1 to 64 letters, digits, `-` or `_`; anything else is ignored. It never changes the conversion.

## 2. Manifest link

Hand the any2orca page a list of files to fetch itself:

```js
const files = [{ url: "https://cdn.example.com/models/desk-set.3mf", name: "desk-set.3mf" }];
const link = `${ANY2ORCA}/?manifest=${encodeURIComponent(JSON.stringify(files))}&ref=your-site`;
```

- **Format:** `manifest` is a URI-encoded JSON array of `{ "url": ..., "name": ... }`. More than one file opens the batch view.
- **Your file host must allow cross-origin requests.** The visitor's browser fetches each URL from the any2orca page, so the response needs an `Access-Control-Allow-Origin` header that allows that page (`*` works). Without it the browser blocks the download, and the visitor sees an error suggesting they download the file and drop it in instead.
- **Use https URLs** that don't need cookies or a login: the browser makes the request without the visitor's credentials for your site.
- The file goes straight from your host to the visitor's browser. It never passes through any2orca.

## 3. Hand-off with postMessage

For sites that already load the file into memory (a download button that calls `fetch()`), pass the bytes straight to an any2orca tab:

```js
async function convertToSnapmakerU1(fileUrl, fileName) {
  // Open the tab first, while the click is still recent: once you've awaited
  // a download, browsers may no longer treat window.open() as user-initiated
  // and block it as a popup.
  const target = window.open(`${ANY2ORCA}/?handoff=1&ref=your-site`, "_blank");
  if (!target) return; // blocked; fall back to a plain link

  const ready = new Promise((resolve) => {
    window.addEventListener("message", function onReady(event) {
      // Only trust the any2orca tab you just opened.
      if (event.source !== target || event.origin !== ANY2ORCA) return;
      if (event.data?.type !== "any2orca-ready") return;
      window.removeEventListener("message", onReady);
      resolve();
    });
  });

  const buffer = await (await fetch(fileUrl)).arrayBuffer();
  await ready;
  target.postMessage(
    { type: "any2orca-import", files: [{ name: fileName, buffer }] },
    ANY2ORCA, // always name the receiving origin, never "*"
    [buffer], // transfer instead of copying
  );
}
```

The protocol:

1. Open `/?handoff=1` (plus `ref` if you like) from a click handler.
2. The any2orca tab posts `{ type: "any2orca-ready" }` to the window that opened it.
3. You post `{ type: "any2orca-import", files: [{ name, buffer }] }`, where `buffer` is an `ArrayBuffer` of a `.3mf` (or a `.zip` of several). More than one file opens the batch view.

The bytes go tab to tab inside the visitor's browser. Nothing is uploaded.

## 4. Embed the library

Run the converter inside your own page, with no hand-off and no second site: install `any2orca` and `any2orca-profiles`, serve the profile catalog from your own site, and convert in a Web Worker. [`examples/web-stack-embed`](../examples/web-stack-embed) is a complete, runnable example of adding one button to an existing page, with notes on profile choice, errors, Content Security Policy and hosting under a subpath.

## 5. Library or CLI for pipelines

For a publish step, a batch job or a server, call the library directly. No key, no quota, no network:

```js
import { readFile, writeFile } from "node:fs/promises";
import { convert } from "any2orca";
import { bundledProfileSource } from "any2orca/node";

const { output, report } = await convert(await readFile("model.3mf"), { profiles: bundledProfileSource() });
await writeFile("model_U1.3mf", output);
```

Or from a shell: `npx any2orca convert ./models/*.3mf --out-dir ./converted`. See [`packages/core/README.md`](../packages/core/README.md) for the library and the [CLI reference](cli.md) for every command and flag.

## Limits

Both hand-off paths are built to treat the other side as untrusted, since the link or message can come from anywhere:

| | Manifest link | postMessage hand-off |
|---|---|---|
| File count | 20 | 20 |
| File name length | 255 characters | 255 characters |
| Per-file size | 512 MB | 512 MB |
| Total size | 1 GB | 1 GB |
| `manifest` parameter length | 8 KB | n/a |
| Accepted source | `https:` URLs only (plus `http://localhost` in development) | only the window that opened the tab |

A manifest link never fetches on its own: the visitor sees which files and which host(s) are being asked for first, and has to confirm. The fetch itself sends no cookies (`credentials: "omit"`), and a response is cut off the moment it passes the size limit, so a crafted response claiming a small size can't still hand over gigabytes.

## Rules that apply to every path

- **Don't re-implement profile matching.** Let `convert()` pick, or use `matchProfile()`/`pickProfile()` from the library, so every site picks the same profile for the same file.
- **Show the conversion notes.** The report's `warnings` are written for the visitor (for example, objects moved closer together to fit the U1's bed).
- **Downloads stay manual.** Offer a download button; don't trigger one automatically.
