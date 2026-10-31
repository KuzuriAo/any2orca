// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { strFromU8, unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import { convertAndWait, demoModel, file, openProject, removeSavePicker, SCHEMES, waitForAnimations } from "./helpers";

const picker = (page: Page) => page.getByTestId("snapmaker-orca-version");
const NEW = "2.4.1";
const OLD = "2.4.0";

/** Serves the site's own catalog as if it held only its newest release. */
async function serveOneRelease(page: Page): Promise<void> {
  await page.route("**/profiles/index.json", async (route) => {
    const response = await route.fetch();
    const { releases: _ignored, ...index } = await response.json();
    await route.fulfill({ response, json: index });
  });
}

/** The downloaded file's version line and stamp. Converts first unless the file is already converted. */
async function downloadedFacts(page: Page, convert = true) {
  if (convert) await convertAndWait(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-button").click()]);
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  return {
    application: /<metadata name="Application">([^<]*)</.exec(strFromU8(files["3D/3dmodel.model"]!))?.[1],
    tracks: JSON.parse(strFromU8(files["Metadata/any2orca.json"]!)).profiles.tracks,
  };
}

test("isn't shown while the catalog holds one release", async ({ page }) => {
  await serveOneRelease(page);
  await page.goto("/");
  await openProject(page);
  await expect(page.getByTestId("profile-picker")).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});

test.describe("with the catalog's two releases", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");
    await openProject(page);
  });

  test("defaults to the newest, labeled, with its help in the (?) beside it", async ({ page }) => {
    await expect(picker(page)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Snapmaker Orca version" })).toHaveValue(NEW);
    await expect(picker(page).locator("option")).toHaveText([`${NEW} (newest)`, OLD]);
    await page.getByTestId("helptip-btn-snapmaker-orca-version").click();
    await expect(page.getByText(/Pick the version you slice with/)).toBeVisible();
    await expect(page.getByText(/command line stops at that setting/)).toBeVisible();
  });

  test("converts for the newest by default, and for the version picked", async ({ page }) => {
    await picker(page).selectOption(OLD);
    expect(await downloadedFacts(page)).toEqual({ application: `Snapmaker_Orca-${OLD}`, tracks: `Snapmaker Orca ${OLD}` });
  });

  test("converts again when another version is picked after converting, so the download matches the choice", async ({ page }) => {
    expect(await downloadedFacts(page)).toEqual({ application: `Snapmaker_Orca-${NEW}`, tracks: `Snapmaker Orca ${NEW}` });
    await picker(page).selectOption(OLD);
    await expect(page.getByTestId("download-button")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await downloadedFacts(page, false)).application, { timeout: 30_000 }).toBe(`Snapmaker_Orca-${OLD}`);
  });

  test("keeps the choice for the session, and drops a saved one the catalog doesn't hold", async ({ page }) => {
    await picker(page).selectOption(OLD);
    await page.reload();
    await openProject(page);
    await expect(picker(page)).toHaveValue(OLD);
    await page.evaluate(() => sessionStorage.setItem("any2orca_snapmaker_orca_version", "1.2.3"));
    await page.reload();
    await openProject(page);
    await expect(picker(page)).toHaveValue(NEW);
    expect(await page.evaluate(() => sessionStorage.getItem("any2orca_snapmaker_orca_version"))).toBeNull();
  });

  test("is reached with Tab, right after its help button", async ({ page }) => {
    await page.getByTestId("helptip-btn-snapmaker-orca-version").focus();
    await page.keyboard.press("Tab");
    await expect(picker(page)).toBeFocused();
  });

  test("the batch view offers the same choice", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles([file("a.3mf", demoModel), file("b.3mf", demoModel)]);
    await expect(page.getByTestId("batch-view")).toBeVisible();
    await expect(picker(page)).toBeVisible();
  });
});

for (const scheme of SCHEMES) {
  test.describe(`${scheme}, with the version picker showing`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("has no accessibility violations", async ({ page }) => {
      await page.goto("/");
      await openProject(page);
      await expect(picker(page)).toBeVisible();
      await waitForAnimations(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  });
}
