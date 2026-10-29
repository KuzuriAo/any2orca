// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "@playwright/test";

// Both skins are built ahead of time (npm run build:e2e) and served with
// `vite preview`. The default `oss` project runs every test; the `a2o`
// project runs only tests tagged `@appearance` (accessibility, layout,
// computed styles, and brand assets).
const SKINS = { oss: 4301, a2o: 4302 } as const;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", ignoreHTTPSErrors: true },
  projects: Object.entries(SKINS).map(([skin, port]) => ({
    name: skin,
    ...(skin === "a2o" ? { grep: /@appearance/ } : {}),
    use: { baseURL: `http://localhost:${port}/`, ...(process.env.BROWSER ? { browserName: process.env.BROWSER } : {}) },
  })),
  webServer: Object.entries(SKINS).map(([skin, port]) => ({
    command: `npx vite preview --outDir dist-e2e/${skin} --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    // Never reuse: a server left running from another checkout or an older build would be tested instead of this one, silently.
    // A leftover server makes the run fail on the busy port instead.
    reuseExistingServer: false,
  })),
});
