// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { convertAndWait, demoModel, openProject, removeSavePicker } from "./helpers";

const SELF_HOSTING_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

function readHostedCsp(): string {
  const headersPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "hosting", "any2orca.com", "_headers");
  const raw = readFileSync(headersPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*Content-Security-Policy:\s*(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      return match[1];
    }
  }
  throw new Error(`Missing Content-Security-Policy line in ${headersPath}`);
}

const HOSTED_CSP = readHostedCsp();

// The site's central promise: the file never leaves the device. This checks
// the network side of it from outside the app.
test("converting a file sends nothing to any other origin and nothing file-sized to ours", async ({ page, baseURL }) => {
  await removeSavePicker(page);
  const origin = new URL(baseURL!).origin;
  const requests: { url: string; method: string; bodyBytes: number }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), bodyBytes: r.postDataBuffer()?.length ?? 0 }));

  await page.goto("/");
  const before = requests.length;
  await openProject(page);
  await convertAndWait(page);
  const during = requests.slice(before);

  const isLocal = (url: string) => url.startsWith("data:") || url.startsWith("blob:") || new URL(url).origin === origin;
  expect(requests.filter((r) => !isLocal(r.url)), "every request, for the whole session, stays on this origin").toEqual([]);
  expect(during.filter((r) => r.method !== "GET"), "no non-GET requests while opening and converting").toEqual([]);
  expect(during.filter((r) => r.bodyBytes > 0), "no request body at all while converting").toEqual([]);
  expect(demoModel.length).toBeGreaterThan(1_000); // the file is real, so an empty body would prove nothing else
});

for (const [policyName, cspHeader] of [
  ["the self-hosting policy", SELF_HOSTING_CSP],
  ["any2orca.com's policy", HOSTED_CSP],
] as const) {
  test(
    `conversion runs with no violations under a strict Content Security Policy without inline script hashes under ${policyName}`,
    { tag: "@appearance" },
    async ({ page }) => {
      const cspViolations: string[] = [];
      const errors: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        if (/content security policy/i.test(text) || /violates/i.test(text) || /blocked/i.test(text)) {
          cspViolations.push(text);
        }
      });
      page.on("pageerror", (err) => errors.push(String(err)));

      await page.route("**/*", async (route) => {
        const response = await route.fetch();
        const contentType = response.headers()["content-type"] || "";
        const resourceType = route.request().resourceType();
        const isHtmlOrScriptOrWorker =
          contentType.includes("text/html") ||
          contentType.includes("javascript") ||
          resourceType === "script" ||
          resourceType === "worker";

        if (isHtmlOrScriptOrWorker) {
          const headers = {
            ...response.headers(),
            "Content-Security-Policy": cspHeader,
          };
          await route.fulfill({ response, headers });
        } else {
          await route.fulfill({ response });
        }
      });

      await page.addInitScript(() => {
        (window as any).__cspViolations = [];
        const handler = (e: SecurityPolicyViolationEvent) => {
          const entry = {
            violatedDirective: e.violatedDirective,
            blockedURI: e.blockedURI,
            sourceFile: e.sourceFile,
          };
          const list = (window as any).__cspViolations;
          if (
            !list.some(
              (x: typeof entry) =>
                x.violatedDirective === entry.violatedDirective &&
                x.blockedURI === entry.blockedURI &&
                x.sourceFile === entry.sourceFile,
            )
          ) {
            list.push(entry);
          }
        };
        window.addEventListener("securitypolicyviolation", handler);
        document.addEventListener("securitypolicyviolation", handler);
      });

      await removeSavePicker(page);
      await page.goto("/");
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeTruthy();
      const loadViolations = await page.evaluate(() => (window as any).__cspViolations);
      expect(loadViolations, "zero securitypolicyviolation events on load").toEqual([]);

      await openProject(page);
      await convertAndWait(page);

      const convertViolations = await page.evaluate(() => (window as any).__cspViolations);
      expect(convertViolations, "zero securitypolicyviolation events after conversion").toEqual([]);

      expect(cspViolations, "zero Content Security Policy violations").toEqual([]);
      expect(errors, "zero runtime errors under strict CSP").toEqual([]);
    },
  );
}
