// SPDX-License-Identifier: MIT
// The `any2orca` command. The shebang is added at build time by scripts/build.mjs.
import { runCli } from "./cli/main.js";

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  isTTY: Boolean(process.stdout.isTTY),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
