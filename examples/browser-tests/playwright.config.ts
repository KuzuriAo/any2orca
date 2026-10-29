// SPDX-License-Identifier: MIT
import { defineConfig } from "@playwright/test";

const MINIMAL_UI = 4311;
const WEB_STACK_EMBED = 4312;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  webServer: [
    {
      command: `npm run preview -w @any2orca/example-minimal-ui -- --port ${MINIMAL_UI} --strictPort`,
      url: `http://localhost:${MINIMAL_UI}/`,
      cwd: "../..",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run preview -w @any2orca/example-web-stack-embed -- --port ${WEB_STACK_EMBED} --strictPort`,
      url: `http://localhost:${WEB_STACK_EMBED}/`,
      cwd: "../..",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
