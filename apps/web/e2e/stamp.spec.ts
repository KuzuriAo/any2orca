// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { convertAndWait, demoModel, entryNames, file, openProject, removeSavePicker, SCHEMES, VIEWPORTS } from "./helpers";

const STAMP = "Metadata/any2orca.json";
const toggle = (page: Page) => page.getByTestId("stamp-toggle");

async function downloadedEntries(page: Page): Promise<string[]> {
  await convertAndWait(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  return entryNames(new Uint8Array(readFileSync(await download.path()))).sort();
}

test.beforeEach(async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
  await openProject(page);
});

test("the version note is on by default, with a plain explanation and a link to the details", async ({ page }) => {
  await expect(toggle(page)).toBeChecked();
  await expect(page.getByText("Add a version note to the file")).toBeVisible();
  await page.getByTestId("helptip-btn-stamp").click();
  await expect(page.getByText(/holds nothing about you or your model/i)).toBeVisible();
  const link = page.getByRole("link", { name: /what's in it/i });
  await expect(link).toHaveAttribute("href", /output-stamp\.md$/);
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a converted file carries the note by default", async ({ page }) => {
  expect(await downloadedEntries(page)).toContain(STAMP);
});

test("unticking the box leaves the note out and changes nothing else in the file", async ({ page, context }) => {
  const withNote = await downloadedEntries(page);
  const other = await context.newPage();
  await removeSavePicker(other);
  await other.goto("/");
  await openProject(other);
  await toggle(other).uncheck();
  const withoutNote = await downloadedEntries(other);
  expect(withoutNote).not.toContain(STAMP);
  expect(withoutNote).toEqual(withNote.filter((name) => name !== STAMP));
});

test("the choice is remembered across a reload, and ticking it again restores the note", async ({ page }) => {
  await toggle(page).uncheck();
  await page.reload();
  await openProject(page);
  await expect(toggle(page)).not.toBeChecked();
  await toggle(page).check();
  expect(await downloadedEntries(page)).toContain(STAMP);
});

test("a stored value that isn't one we wrote is ignored, and the box stays ticked", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("any2orca_stamp", "<script>no</script>"));
  await page.reload();
  await openProject(page);
  await expect(toggle(page)).toBeChecked();
});

test("the box works from the keyboard", async ({ page }) => {
  await toggle(page).focus();
  await page.keyboard.press("Space");
  await expect(toggle(page)).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(toggle(page)).toBeChecked();
});

test("the batch view offers the same choice", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
  await expect(page.getByTestId("batch-view")).toBeVisible();
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toBeChecked();
});

for (const scheme of SCHEMES) {
  test.describe(`${scheme}, with the version note control showing`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("has no accessibility violations on the page, and none in the control in the batch view", async ({ page }) => {
      await page.goto("/");
      await openProject(page);
      await page.waitForTimeout(500);
      let { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);

      // The batch view as a whole has accessibility findings of its own (tracked separately);
      // this checks that the control added to it introduces none.
      await page.goto("/");
      await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
      await expect(page.getByTestId("batch-view")).toBeVisible();
      await page.waitForTimeout(500);
      ({ violations } = await new AxeBuilder({ page }).include(".stamp-wrapper").analyze());
      expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  });
}

test.describe("phone width", { tag: "@appearance" }, () => {
  test.use({ viewport: VIEWPORTS.phone });

  test("the control fits without horizontal scrolling and stays reachable", async ({ page }) => {
    await page.goto("/");
    await openProject(page);
    await toggle(page).scrollIntoViewIfNeeded();
    await expect(toggle(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
