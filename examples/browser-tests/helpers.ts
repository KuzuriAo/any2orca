// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

export const MINIMAL_UI = "http://localhost:4311/";
export const WEB_STACK_EMBED = "http://localhost:4312/";

const SAMPLE = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));
export const sampleModel = readFileSync(SAMPLE);

/** Records every request the page makes, so a test can assert the privacy promise. */
export function watchRequests(page: Page): Array<{ method: string; url: string }> {
  const seen: Array<{ method: string; url: string }> = [];
  page.on("request", (request) => seen.push({ method: request.method(), url: request.url() }));
  return seen;
}

/** Nothing but plain GETs for files from the page's own origin, and nothing carries a body. */
export function expectOnlyOwnFiles(requests: Array<{ method: string; url: string }>, origin: string): void {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    if (request.url.startsWith("blob:") || request.url.startsWith("data:")) continue;
    expect(request.method, request.url).toBe("GET");
    expect(new URL(request.url).origin, request.url).toBe(new URL(origin).origin);
  }
}

/** The entries of a downloaded 3MF, to check what came out. */
export function entriesOf(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}
