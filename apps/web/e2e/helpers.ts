// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";

const DEMO_PATH = fileURLToPath(new URL("../public/demo-model.3mf", import.meta.url));

export const demoModel = readFileSync(DEMO_PATH);

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
} as const;

export const SCHEMES = ["dark", "light"] as const;

export const file = (name: string, buffer: Buffer) => ({ name, mimeType: "application/octet-stream", buffer });

/** The app never offers the native save dialog in tests, so downloads go through the browser's normal path. */
export async function removeSavePicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
}

export async function openProject(page: Page, name = "demo-model.3mf", buffer = demoModel): Promise<void> {
  await page.getByTestId("file-input").setInputFiles(file(name, buffer));
  await page.getByTestId("convert-button").waitFor({ timeout: 20_000 });
}

export async function convertAndWait(page: Page): Promise<void> {
  await page.getByTestId("convert-button").click();
  await page.getByTestId("download-button").waitFor({ timeout: 30_000 });
}

/** Layer height from a converted (or source) 3MF's project settings. */
export function layerHeightOf(bytes: Uint8Array): string | undefined {
  const settings = unzipSync(bytes)["Metadata/project_settings.config"];
  return settings ? (JSON.parse(strFromU8(settings)) as { layer_height?: string }).layer_height : undefined;
}

export function entryNames(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes));
}

/** The project settings of a converted (or source) 3MF, parsed. */
export function settingsOf(bytes: Uint8Array): Record<string, unknown> {
  const settings = unzipSync(bytes)["Metadata/project_settings.config"];
  return settings ? (JSON.parse(strFromU8(settings)) as Record<string, unknown>) : {};
}

/** The output stamp of a converted 3MF, parsed. */
export function stampOf(bytes: Uint8Array): { options: { highFlowHotends: unknown } } | null {
  const stamp = unzipSync(bytes)["Metadata/any2orca.json"];
  return stamp ? JSON.parse(strFromU8(stamp)) : null;
}

/**
 * Waits until everything on the page has finished animating. Playwright counts an element as visible as soon as
 * it starts to fade in, so an accessibility check run right after opening a panel or popover measures
 * half-transparent colors and reports a contrast failure that isn't real. Call this before running axe.
 */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))).then(() => undefined));
}

