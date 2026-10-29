#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Clean build of dist/: sync the version, compile, add the CLI's shebang and mark it executable.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL("sync-version.mjs", import.meta.url))], { stdio: "inherit" });
rmSync(new URL("dist", root), { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "-p", fileURLToPath(new URL("tsconfig.build.json", root))], { stdio: "inherit" });
const cli = new URL("dist/cli.js", root);
if (existsSync(cli)) {
  const text = readFileSync(cli, "utf-8");
  if (!text.startsWith("#!")) writeFileSync(cli, `#!/usr/bin/env node\n${text}`);
  chmodSync(cli, 0o755);
}
