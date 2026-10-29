// SPDX-License-Identifier: AGPL-3.0-or-later

export const AGENT_PROMPT_TEXT = `You're adding a "Convert to Snapmaker U1" option to this project using any2orca. First read https://github.com/KuzuriAo/any2orca/blob/main/docs/integration-guide.md. It describes five paths: link out, manifest link, postMessage hand-off, embedding the library, and the library or CLI for pipelines.

Then look at this codebase and decide which one fits. Check:
- How a visitor gets a .3mf here today: a plain link, or a fetch() in the browser before saving.
- Whether the file host sends CORS headers (Access-Control-Allow-Origin), and whether downloads need cookies or a login.
- Whether there's a build, publish or batch step where conversion could run instead.
- Any Content Security Policy that a Web Worker or a new tab would need to fit.

Answer in this shape:
1. The path: one of the five, by its name in the guide.
2. Why: a few short points from what you found in this codebase.
3. The change: the exact files and code to add, following the guide's rules (let any2orca pick the profile, show the conversion notes, never start a download automatically).

Pick one path. Don't give a neutral comparison.`;
