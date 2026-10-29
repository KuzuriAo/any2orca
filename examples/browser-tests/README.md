# Browser tests for the examples

The real-browser tests for the three examples that run in a browser: [`minimal-ui`](../minimal-ui), [`web-stack-embed`](../web-stack-embed) and [`plugin-extension`](../plugin-extension). This folder isn't an example itself. It holds the tests in one place, so each example stays a small project you can copy without bringing test tooling along.

The Node examples test themselves with `node --test` and run with the rest of the repository's tests (`npm test`). These three need a real browser, so they live here and use [Playwright](https://playwright.dev/) with Chromium.

## Run them

From the repository root:

```sh
npm install
npx playwright install chromium     # once, to download the browser
npm run test:e2e -w @any2orca/example-browser-tests
```

`test:e2e` builds the three examples first, then starts `minimal-ui` on `http://localhost:4311/` and `web-stack-embed` on `http://localhost:4312/`, runs the tests, and stops the servers. The extension needs no server: the test loads its built folder straight into Chromium.

## What each test checks

| Test file | Example | What it does |
|---|---|---|
| [`minimal-ui.spec.ts`](minimal-ui.spec.ts) | `minimal-ui` | Opens the page, picks the sample project, checks the project's facts and the profile list appear, converts, and downloads the result. A second test picks a file that isn't a 3MF and expects a clear message. |
| [`web-stack-embed.spec.ts`](web-stack-embed.spec.ts) | `web-stack-embed` | Gives the sample project to the example's "Convert a 3MF to Snapmaker U1" file input, then downloads the converted file from the link it adds. |
| [`plugin-extension.spec.ts`](plugin-extension.spec.ts) | `plugin-extension` | Checks the extension's manifest asks for no permissions of any kind (including optional and host permissions) and has no content scripts. Then loads the built extension into Chromium, opens its converter page, converts the sample and downloads the result. |

Every conversion test also checks what came out (the downloaded file opens as a 3MF and carries its version note, `Metadata/any2orca.json`) and **what went over the network**: it records every request the page made and fails if any request went to another site, or if any was anything other than a plain `GET`. For the extension, every request must be for one of the extension's own files. That is the "your file never leaves your device" promise, tested in a real browser on every change.

The sample project is the web app's demo model, [`apps/web/public/demo-model.3mf`](../../apps/web/public/demo-model.3mf).

## How it fits together

- [`playwright.config.ts`](playwright.config.ts) starts each example's own preview server (`npm run preview -w <example>`) on a fixed port. Locally it reuses a server that's already running on that port; in CI it always starts fresh.
- [`helpers.ts`](helpers.ts) has the shared pieces: the sample file, `watchRequests()` to record a page's requests, `expectOnlyOwnFiles()` for the network check, and `entriesOf()` to read a downloaded 3MF.
- The extension test launches Chromium with a persistent profile and `--load-extension`, since extensions don't load in an ordinary test browser. It finds the extension's address from its background service worker.

## In CI

The repository's CI runs these tests on every push and pull request that changes one of these examples, the library or the profiles, and also every night and on every release. If anything fails, the Playwright report (with a trace of the failing test) is attached to the run for a week.

## Adding a test for a new browser example

1. Add the example's build to the `build-examples` script in [`package.json`](package.json).
2. If it's a web page, give it a preview server in [`playwright.config.ts`](playwright.config.ts) on a new port, and its address in [`helpers.ts`](helpers.ts).
3. Add `<example>.spec.ts`: convert the sample, check the download, and end with `expectOnlyOwnFiles()`, so the network promise is tested for it too.
4. Mention the test in the example's README under "Check it", as the other three do.

## If something goes wrong

- **"Executable doesn't exist" or a browser download prompt:** run `npx playwright install chromium` once.
- **A port is already in use:** something else is on `4311` or `4312`. Locally the tests reuse what's there, so stop any other server you started on those ports, or another test run, and try again.
- **A test can't find a built file:** the examples weren't built. `npm run test:e2e` builds them first; running `npx playwright test` on its own doesn't.

## License

MIT, like the examples.
