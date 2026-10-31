---
"any2orca": patch
---

**No policy violations under a strict content security policy.** zod, which the library uses to check its input, calls the `Function` constructor once to see whether it may compile faster parsers. A policy without `'unsafe-eval'` (a browser extension's, or a site's) refuses it, and zod falls back, but the browser reported a violation each time a page or worker loaded the library. The library now turns zod's compiled parsers off as it loads, before it creates any schema, so the call never runs. Converted files are byte-for-byte the same and conversions take the same time. zod's setting is shared by every copy of zod in the same page or worker; call `z.config({ jitless: false })` before importing any2orca to keep compiled parsers for your own schemas.

**A zip that isn't a 3MF says so.** A zip with neither a 3MF project nor a 3MF inside it (a bundle of STL files, say) was refused as a 3MF that "holds only the model". It now gets its own message.

**The Web Worker settles every call when the worker fails.** If the worker fails to load or stops (out of memory on a very large file, say), `createConverterWorker` now rejects every call in flight with a message saying so, and refuses later ones, instead of leaving them waiting forever.

**Messages don't name the library,** so an app can show them as they are: the ones about a project from another slicer, a project too large, an archive with a repeated entry, an oversized model file, a retired profile and a catalog without filament names. The command line adds its own `any2orca profiles` hint for a retired profile.
