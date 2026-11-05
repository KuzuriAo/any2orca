// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

export const MINIMAL_UI = "http://localhost:4311/";
export const WEB_STACK_EMBED = "http://localhost:4312/";

const SAMPLE = fileURLToPath(new URL("../../apps/web/public/demo-model.3mf", import.meta.url));
export const sampleModel = readFileSync(SAMPLE);

/** A project saved by PrusaSlicer 2.9.6 (the library's fixture): an Original Prusa XL scene with four filaments. */
export const prusaModel = readFileSync(fileURLToPath(new URL("../../packages/core/src/test-fixtures/prusaslicer/prusaslicer-2.9.6-scene.3mf", import.meta.url)));

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

/** What a converted file says about its source and its filaments, to check a PrusaSlicer project came through. */
export function convertedFacts(path: string): { source: unknown; colors: unknown } {
  const entries = entriesOf(path);
  const text = (name: string) => new TextDecoder().decode(entries[name]);
  return { source: JSON.parse(text("Metadata/any2orca.json")).source, colors: JSON.parse(text("Metadata/project_settings.config")).filament_colour };
}

/** The entries of a downloaded 3MF, to check what came out. */
export function entriesOf(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}
