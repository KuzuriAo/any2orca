// SPDX-License-Identifier: MIT
import { defineConfig } from "vite";

export default defineConfig({
  // Relative URLs: the extension is served from chrome-extension://<id>/, not from a site root.
  base: "./",
  worker: { format: "es" },
  build: { rollupOptions: { input: "convert.html" } },
});
