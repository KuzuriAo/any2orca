# Build your own UI

How to build a front end for any2orca, by hand or with an AI coding agent. The engine is a library, so a UI is a thin layer: pick a file, show what's in it, let the user choose a few options, convert, offer the download. This page is the brief to give an agent, plus the conventions the reference app ([`apps/web`](../apps/web)) follows and the reasons for each, so a new UI doesn't relearn them the hard way.

If you only want a button on an existing page, you don't need a UI of your own: see [the integration guide](integration-guide.md) and [`examples/web-stack-embed`](../examples/web-stack-embed).

## A prompt to give your agent

> Build a browser UI for converting Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer, Flash Studio, QIDI Studio and PrusaSlicer `.3mf` projects to Snapmaker U1, using the `any2orca` library (`npm install any2orca any2orca-profiles`). Read `docs/build-your-own-ui.md`, `docs/integration-guide.md` and `packages/core/README.md` in the any2orca repository first, and follow the rules in "What every UI must do". Convert in a Web Worker (`any2orca/worker`); serve the profile catalog from my own site. Never upload the file anywhere. Show the conversion notes and errors to the user. Never trigger a download without a click. Test it in a real browser, including with a corrupt file, and run an accessibility check before you tell me it's done.

## The flow, in code

```js
import { createConverterWorker } from "any2orca/worker";
import ConverterWorker from "any2orca/worker-entry?worker"; // Vite; or new Worker(new URL(...), { type: "module" })

const converter = createConverterWorker(new ConverterWorker(), { profilesUrl: "/profiles/" });

// 1. Open once. inspect() is cheap and drives your whole preview.
const { project, inspection } = await converter.open(bytes, { transfer: true });
// inspection: plates, objects (with footprints), filaments (slot, color, type, preset, color name),
// nozzle and layer height, source preset and tier, printer model, source vendor, warnings

// 2. Ask which profile auto-matching would pick (never re-implement this).
const choice = await project.matchProfile();

// 3. Convert as often as the user changes options.
const { output, report } = await project.convert({
  profileId: userChoseSomethingElse ? chosenId : undefined, // see "Pass profileId only when the user changed it"
  highFlowHotends: [true, false, false, false], // or omit; see below
  filamentComplianceMode: "generic",            // or "snapmaker", or omit
  onProgress: (stage) => showProgress(stage),
});
// report: profile, profileMatch, warnings, plates, objects, filamentSlots, shifts, stamp
```

Profiles come from a source you provide; the library never fetches anything on its own. See [`packages/core/README.md`](../packages/core/README.md) for the sources, the CLI and the limits, and the [API reference](README.md#api-reference) for every type.

## What every UI must do

These are not style preferences. Each one is a way an earlier version broke, or a promise the project makes.

1. **Never send the file anywhere.** Convert locally. If your UI adds analytics, do not include file names, contents, or anything derived from the model. See [the privacy page](privacy.md) for what to verify.
2. **Never re-implement profile matching.** Use `matchProfile()` or let `convert()` choose. A second implementation drifts, and then two UIs disagree about the same file.
3. **Pass `profileId` only when the user picked something different from the match.** An explicit `profileId` skips auto-matching and skips keeping the source file's own layer height. A UI that stores the matched profile as the user's "choice" silently changes layer heights (a 0.22 mm file came out at 0.20).
4. **Show `report.warnings` and every error.** The warnings are written for the user, for example objects moved closer together to fit the U1's bed. Map `Any2orcaError` codes (`invalid_file`, `unsupported_slicer`, `too_large`, `invalid_project`, `profile_not_found`, `profile_data`) to plain messages, and say what the user can do next. `unsupported_slicer` is a readable project from a slicer the library doesn't convert, named in `error.slicer`; a damaged file is `invalid_file`. A corrupt file is a normal event. For `too_large` (a project over the 2 GB unpacked limit), say the command line can convert it with `--max-unpacked`, and offer a link to report it. Before converting, `inspection.unpackedBytes` over 1 GB is worth a heads-up: converting takes a minute or two and a few GB of memory.
5. **Downloads are manual.** Offer a button. Never start a download because a conversion finished.
6. **Never cap filament slots.** A project can have more filaments than the U1 has toolheads; the output keeps them all. Don't truncate, merge or recolor them.
7. **Don't assume an object has a bounding box.** `inspection.objects[i].bbox` can be null; draw from `fallbackXy` so assemblies and unusual models stay visible.
8. **Treat anything you did not create as hostile.** A manifest link, a `postMessage`, a dropped file and stored settings can all be malformed or oversized. Validate shape and size at the boundary; the limits in [the integration guide](integration-guide.md#limits) are a good starting set. Ask the user before fetching a URL you were handed, and fetch without cookies.

## Options and what to say about them

- **High-flow hotends.** The Snapmaker Liber High Flow Hotend can be on one to four of the U1's four toolheads, so `highFlowHotends` takes `true` (all four) or a list of exactly four booleans, T1 first. It only applies to the 0.4 mm nozzle. The file records which toolheads have it; Snapmaker Orca asks at slice time which colors print on which nozzle, so a UI can't and shouldn't decide that. Don't promise any speed or flow figure: real gains depend on the filament's flow limit and on the model, and are smaller on fine detail and curves. Default to nothing selected, and keep the selection for the visit only, not forever: a stale "installed" choice after someone changes a hotend makes the file record hardware that isn't there.
- **Filament names.** `filamentComplianceMode: "generic" | "snapmaker"` sets each filament to a preset Snapmaker Orca ships for the nozzle size converted to, by product line, with that preset's own settings, for marketplace uploads such as Snapmaker Space; colors and order stay. Offer Original, which keeps the creator's filaments, names and settings, as the default. Say it the way the reference app does: "Original keeps the creator's filaments exactly: their names and their settings. Generic and Snapmaker switch each filament to a preset Snapmaker Orca ships, with that preset's own settings, for uploads to Snapmaker Space; colors and order stay. Snapmaker Orca would use the preset's settings anyway once a filament carries its name." After converting, show `filamentNotes(report)`: one sentence per note, the same wording the web app and the CLI use (which filaments use a preset's settings and what that replaced, which use Generic, which stayed). The details are in `report.filamentPresets`, `filamentComplianceFallback` and `filamentComplianceUnchanged`. To preview a slot's new name before converting, call `resolveFilamentName(catalog.index.filamentNames, printerId, type, name, mode)`. One filament changes under every option: a filament the creator's printer took at another diameter (Bambu's H3C has a 2.85 mm TPU tool) is set to Snapmaker's preset for its material (Generic under the Generic option) with that preset's settings, because its values were tuned for that filament and the U1 takes 1.75 mm. `report.warnings[0]` says so; show it where the user can't miss it, since they have to load other filament.
- **Nozzle size.** `nozzle` is the size the user's U1 has, `"0.2"` to `"0.8"` (`NOZZLE_CHOICES` lists the values), or `"match"` for the size the creator used; the default is `"0.4"`, the stock nozzle most U1s run. The profile, its layer heights and the filament values are the U1's for that size, and the file records it. Offer it as one choice for all four toolheads (Snapmaker Orca allows one size per project; `catalog.mixedNozzleSizes` says when a release allows more) and remember it between visits: unlike a hotend, a nozzle size rarely changes. Pass the same value to `matchProfile(profiles, { nozzle })`, so the picker and the conversion agree. `report.nozzle` says what was used, and `report.profileNotes` carries the sentence when the creator's size differs or the project mixes sizes.
- **Profile picker.** Show the matched profile first, labeled as automatic, with its name and layer height. Only list profiles for the chosen nozzle size (the file's own size under `"match"`).
- **Version note.** `convert()` adds a small `Metadata/any2orca.json` (version, catalog, profile, options; see [the output stamp](output-stamp.md)) unless you pass `stamp: false`. If your UI converts files for people, say it plainly, in one line near the convert button, and offer a way to leave it out: a checkbox, on by default, passed through as `stamp: false`. The reference app does exactly this.
- **Batches.** More than one file, or a `.zip` of several (`unwrapBundle`), is a batch. Convert one at a time, show each file's result and error separately, and let the user remove files. Removing the last one returns to the start.

## Conventions the reference app follows

- **Follow the system light or dark setting** until the user picks one, and remember only that explicit choice. Set it before the first paint so the page doesn't flash.
- **Never rely on color alone.** A selected chip needs a check mark or label too. Text needs 4.5:1 contrast, 3:1 for large text, in both themes.
- **Options explain themselves in one place.** In the reference app, each option in the side panel is a label and its control, with the explanation in a small help popover opened by a (?) button after the label. It floats over the page instead of pushing the controls below it, opens on click, and closes on Escape or a click outside. That keeps the panel short while every option still says what it does. New options follow the same pattern.
- **Everything works from the keyboard,** with a visible focus state, real buttons and labeled controls. Icon-only buttons need an accessible name that contains any visible text.
- **Phones need to work, desktops come first.** Almost all use is on a desktop, but the page must load, read correctly and convert at 390 px wide without horizontal scrolling.
- **Be exact about privacy.** Say "your files never leave your device". Don't claim that nothing contacts any other server unless you've checked every request, including your host's.
- **Keep stats opt-in and off by default.** If you collect any, use `buildStatsEvent` (it validates the shape and refuses anything else) and `resolveStatsConsent`, and let the user see exactly what would be sent.

## Check your work

Do these before you call it done. The reference app's [`apps/web/e2e`](../apps/web/e2e) tests are a working example of each.

1. Convert a real file end to end, download it, and open it in Snapmaker Orca.
2. Convert a corrupt file and a file that isn't a zip: you should see a clear error, not a blank page.
3. Convert two files (a batch), then clear it.
4. Run the browser's Network tab during a conversion: no request carries your file, and none goes to another site.
5. Run an accessibility check (axe) in light and dark, with the page empty and after a conversion.
6. Try it at 390 px wide, and with the keyboard only.
