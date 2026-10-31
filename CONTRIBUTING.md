# Contributing to any2orca

Issues and pull requests here go straight into the project.

## Layout

- `packages/core`: the conversion library, Web Worker, and CLI (`any2orca` on npm, MIT).
- `packages/profiles`: the printer profile catalog (`any2orca-profiles` on npm, AGPL-3.0-or-later, since it's derived from each printer vendor's own AGPL preset data).
- `apps/web`: the web UI (AGPL-3.0-or-later), a static site built on `packages/core`.
- `examples/`: small, tested examples, one for each way of using any2orca.
- `docs/`: reference docs and integration guides.

## Running the tests

Node 20.19 or newer (22.12 or newer for the web app's accessibility tests).

No dependency here runs install scripts except `esbuild` and `fsevents`; new dependencies with install scripts are reviewed by hand before they're added.

```sh
npm install
npm run typecheck
npm run lint      # skins stay tokens only: no color literals in components
npm test          # every workspace
npm run build
```

The web app also has real-browser tests (Playwright, with an accessibility check and a network-privacy check), which CI runs on every change to the web app or to the library and profiles it uses, every night, and on every release (a change to the CLI or the docs runs the Node tests only):

```sh
npx playwright install chromium            # once
npm run test:e2e -w @any2orca/web          # builds both skins, then runs the tests
```

The examples that run in a browser (`minimal-ui`, `web-stack-embed`, `plugin-extension`) have their own: `npm run test:e2e -w @any2orca/example-browser-tests`.

Which browser tests a change needs, the same way CI decides:

- **Neither:** a change to the CLI (`packages/core/src/cli/`, `src/cli.ts`), the docs, a README, a changeset, or only the web app's unit tests (`*.test.ts`).
- **The web app's:** a change to `apps/web/`, `NOTICE` or `docs/integration-guide.md`. When only spec files in `apps/web/e2e/` changed, CI runs just those specs; a change to `helpers.ts` or the Playwright config runs them all.
- **The examples':** a change to `examples/browser-tests/` or one of the three examples it tests.
- **Both:** a change to the library outside the CLI, `packages/profiles/`, the web app's demo model, `package-lock.json`, any `package.json` or the workflows.

`npm run docs -w any2orca` builds the generated API reference into `api-docs/`.

`npm test -w any2orca` runs the core's tests; `npm test -w any2orca-profiles` checks that the generated catalog is up to date.

## Profile data

The profiles in `packages/profiles` are Snapmaker's own stock presets, one set per Snapmaker Orca release listed in `data/index.json` (`releases`); the maintainers add a release when Snapmaker publishes one, and the newest is the default. If a value looks wrong compared with Snapmaker's own preset, or a new release hasn't been picked up yet, an issue naming the profile and the setting is the most useful report. To try a change locally, edit that release's `packages/profiles/releases/<version>/templates/` and `catalog.json`, then run `npm run generate -w any2orca-profiles`. See `packages/profiles/README.md`.

## Before opening a PR for anything bigger

Open an issue first so the approach can be agreed on before you put real time into it.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Three rules that keep the project trustworthy:
- **Output must not change by accident.** Anything that changes what a converted file contains needs a test showing the new output, and its changeset says so under "Output-affecting" (below).
- **The library makes no network requests.** Not for updates, not for stats, not for profiles. Network access belongs to the caller (a UI or the CLI) and is listed in the "What leaves your machine" table in `packages/core/README.md`.
- **Every feature ships with an example.** A feature people can use from the library or the CLI comes with working code in [`examples/`](examples), with tests like the others, in the same pull request. Extend an existing example when it's the natural home; otherwise add a small new one and list it in `examples/README.md`. Its README's commands run from the repository root (`npm run start -w @any2orca/example-<name> -- ...`), and npm runs the script in the example's own folder, so read paths the user types from `process.env.INIT_CWD` (see any existing example's `fromHere`).

## Changesets

Every change a user would notice gets a changeset in the same commit: `npx changeset`, pick the package and bump, and write one or two plain sentences for users.

Bumps, until 1.0:
- Profile data only: patch.
- Changes what converted files contain: minor. Start the summary with "Output-affecting:".
- Breaks the API, a CLI flag, or the output stamp format: minor, with "Breaking:" and what to change.

## Releases

1. Check `.changeset/` covers every user-visible change.
2. `npx changeset version`: bumps versions and writes each package's `CHANGELOG.md`.
3. `npm run generate -w any2orca-profiles` (the catalog carries its own version) and `npm run sync-version -w any2orca`.
4. Edit the new changelog sections into the fixed headings, in this order: **Output-affecting**, Profiles, Breaking, Features, Fixes, Other. If there's an Output-affecting entry, set `"outputAffecting": "<one-line reason>"` in `packages/core/package.json`, so the CLI's update notice can say why to update; if there isn't, remove the field, so the notice doesn't repeat an older release's reason.
5. `npm run typecheck && npm test && npm run build`, then commit.
6. `node scripts/release-plan.mjs` shows what the push will release: every package whose version isn't on npm yet.
7. Push to `main`. `.github/workflows/publish.yml` runs the same plan, the tests and the build, then publishes each new version with npm trusted publishing, profiles first, and creates its tag (`<name>@<version>`) and GitHub Release, with that version's changelog section as the notes and, for `any2orca`, the prebuilt web app attached as `any2orca-web-<version>.tgz` with a `SHA256SUMS` file and a build provenance attestation for both. It refuses a version with no changelog section, and the core while the profiles version it pins is neither on npm nor in the same release. A push that bumps no version releases nothing.
8. Confirm it actually published (`npm view any2orca version`, `npm view any2orca-profiles version`) and check the Releases page. If a release failed partway, fix the cause and run the workflow again from the Actions tab with "Dry run" off: it only publishes what npm doesn't have yet. With "Dry run" on (the default) it checks and builds everything on any branch, runs `npm publish --dry-run`, and publishes nothing.
