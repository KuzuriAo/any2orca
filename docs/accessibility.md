# Accessibility

The any2orca web app can be used without a mouse, with a screen reader, in light or dark, and on a phone. This page says how, what is tested on every change, and what isn't yet.

## Using it without a mouse

There are no special shortcuts to learn. The app uses the browser's standard keys, and every control answers to them:

| Key | What it does |
|---|---|
| `Tab` / `Shift+Tab` | Move to the next or previous control. The control you're on has a visible outline. |
| `Enter` or `Space` | Press the button you're on, or tick the box. |
| `Escape` | Close the open window (Privacy, Advanced, Compare and the others) or help popover. Focus goes back to the control that opened it. |

To convert a file without dragging it, `Tab` to **Choose 3MF File...**, press `Enter`, and pick the file in your system's file dialog.

The first `Tab` on the page shows a **Skip to the converter** link. Press `Enter` on it to jump past the header to the converter; the next `Tab` lands on **Choose 3MF File...**.

A few things that make this work:

- **Windows keep focus inside them.** While a window is open, `Tab` cycles through its own controls instead of wandering behind it, and `Escape` closes it from anywhere inside.
- **Help popovers** (the small (?) buttons beside each option) open with `Enter` and close with `Escape`, returning focus to their button. Only one is open at a time.
- **Lists work from the keyboard too:** the toolhead chips for the high-flow hotend, a batch's file cards (expand, collapse, remove), and the filter and sort controls on the Compare screen.

## Screen readers, color and motion

- Every control has a name a screen reader can announce, and status messages and errors are announced as they appear.
- Text meets contrast guidelines in both light and dark. The app follows your system's light or dark setting until you choose one, and remembers that choice.
- If your system asks for reduced motion, the app's animations are turned off.
- A selected toolhead chip shows a check mark, not just a color, and screen readers hear which options and toolheads are on.

## Phones

The page works at 390 pixels wide without scrolling sideways; the tests check the header, the batch view and the help popovers at that width. Desktop comes first, since most conversions happen next to a slicer, but nothing is desktop-only.

## What is tested

The web app's browser tests run on every change, and include:

- An automated accessibility check ([axe](https://github.com/dequelabs/axe-core)) with no violations allowed, for both skins, in light and dark, on the empty page, after a conversion, in the batch view at desktop and phone width, and on the Compare, Presets and What changed screens.
- For every window: opening it from the keyboard, focus landing inside, `Tab` pressed ten times staying inside, and `Escape` closing it and returning focus.
- The keyboard behavior of the skip link, the help popovers, the toolhead chips, the version note box, the batch cards and the Compare screen's filters.

The tests live in [`apps/web/e2e`](../apps/web/e2e): see `a11y.spec.ts` and `modal-focus.spec.ts` in particular.

## What isn't covered yet

- **No real screen reader has been tried.** The automated check catches missing names, roles and contrast, but not everything a person using VoiceOver or NVDA would run into.

If something gets in your way, please [open an issue](https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml) and say which browser, system and assistive technology you use. Accessibility problems are treated as bugs.

## Building your own front end

[Build your own UI](build-your-own-ui.md) has the conventions the web app follows, so a new front end starts from the same place.
