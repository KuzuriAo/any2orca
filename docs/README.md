# Docs

## Converting files

- [Snapmaker Orca releases](snapmaker-orca-releases.md): which Snapmaker Orca release a file is converted for, and why to pick the one you slice with.
- [Presets](presets.md): make a preset from a project you tuned in Snapmaker Orca, and convert other people's models with your own print settings.
- [What changed](what-changed.md): the record of what a conversion did to a file's settings, grouped by why (`convert --explain`).
- [Compare 3MF settings](compare-settings.md): compare two projects, or a project with Snapmaker's stock profile, the way Snapmaker Orca names its settings.
- [Accessibility](accessibility.md): using the web app without a mouse or with a screen reader, what's tested, and what isn't yet.
- [Privacy](privacy.md): what each part does on the network, and how to check the "your files never leave your device" promise yourself.
- [Output stamp](output-stamp.md): the `Metadata/any2orca.json` entry in every converted file, and its compatibility rules.
- [CLI reference](cli.md): every `any2orca` command and flag, exit codes, the state file format, and the full `telemetry`/update-check behavior.

## Building on any2orca

- [Integration guide](integration-guide.md): every way to add "Convert to Snapmaker U1" to a site, tool or pipeline, from a plain link to embedding the library.
- [Run the web app yourself](run-the-web-app.md): build and host your own copy of the web app, on a domain, a home server or a LAN, with a security policy that works and what to change to make it yours.
- [Ways to use any2orca](ideas.md): starting points for creators, communities and tool builders, each pointing at working code.
- [Built with any2orca](showcase.md): projects that use any2orca, listed at their makers' request, and how to get yours listed.
- [Examples](../examples/README.md): tested, runnable projects: a batch script, a publish step, a minimal UI, a site embed, a browser extension, presets, a settings audit, "what changed" reports, reading the output stamp, a stats collector and self-hosting configs.
- [Build your own UI](build-your-own-ui.md): a brief to give an AI coding agent, the rules every front end must follow, and the conventions the reference app uses.
- The library and Web Worker API are documented in [`packages/core/README.md`](../packages/core/README.md), including exactly what the CLI can contact over the network.
- The profile catalog's format and how to update it: [`packages/profiles/README.md`](../packages/profiles/README.md).

## API reference

A generated reference for every exported function and type (`any2orca`, `any2orca/node`, `any2orca/worker`) comes from the source's doc comments:

```sh
npm ci
npm run docs -w any2orca   # writes api-docs/ at the repository root
```

Open `api-docs/index.html`.
