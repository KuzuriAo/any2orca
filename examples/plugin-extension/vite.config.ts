// SPDX-License-Identifier: MIT
import { defineConfig } from "vite";
import { withoutZodEvalProbe } from "./withoutZodEvalProbe.ts";

export default defineConfig({
  // Relative URLs: the extension is served from chrome-extension://<id>/, not from a site root.
  base: "./",
  // The converter's worker is built separately, so the plugin goes in both lists.
  plugins: [withoutZodEvalProbe()],
  worker: { format: "es", plugins: () => [withoutZodEvalProbe()] },
  build: { rollupOptions: { input: "convert.html" } },
});
