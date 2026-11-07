// SPDX-License-Identifier: MIT
// The public API's shape, one report per entry point (etc/*.api.md), from the built .d.ts files.
// `npm run api` fails when the shape differs from the committed reports; `npm run api -- --local` updates them.
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const local = process.argv.includes("--local");
let ok = true;
for (const entry of ["index", "node", "worker"]) {
  const config = ExtractorConfig.loadFileAndPrepare(join(root, "api-extractor", `${entry}.json`));
  const result = Extractor.invoke(config, { localBuild: local, showVerboseMessages: false });
  if (!result.succeeded) ok = false;
  if (result.apiReportChanged && !local) ok = false;
}
if (!ok) {
  console.error(local ? "API report: errors above." : "The public API differs from etc/*.api.md. Review the change; if it's intended, run `npm run api -- --local` and commit the reports.");
  process.exit(1);
}
