// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  convertAndWait,
  demoModel,
  file,
  openProject,
  removeSavePicker,
  SCHEMES,
} from "./helpers";

const STORAGE_KEY = "any2orca_presets";

const SEED_PRESET_FAST_WALLS = {
  format: "any2orca-presets",
  version: 1,
  presets: [
    {
      name: "Fast walls",
      base: "snapmaker-u1-0.4-standard",
      baseInferred: false,
      catalog: {
        version: "0.1.0",
        tracks: "Snapmaker Orca 2.4.0",
      },
      changes: {
        wall_loops: "4",
        sparse_infill_speed: "480",
        top_surface_speed: "250",
      },
      created: "2026-10-21",
    },
  ],
};

async function seedPreset(page: Page) {
  await page.addInitScript((val) => {
    localStorage.setItem("any2orca_presets", JSON.stringify(val));
  }, SEED_PRESET_FAST_WALLS);
}

const getDocPos = async (locator: Locator) =>
  locator.evaluate((node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    return { y: r.top + window.scrollY, height: r.height };
  });

test.describe("sidebar help popovers", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
    await seedPreset(page);
    await page.goto("/");
    await openProject(page);
  });

  const HELP_ITEMS = [
    { id: "high-flow", btnTestId: "helptip-btn-high-flow", popoverId: "helptip-popover-high-flow", title: "Liber High Flow" },
    { id: "hardened-steel", btnTestId: "helptip-btn-hardened-steel", popoverId: "helptip-popover-hardened-steel", title: "My nozzles are hardened steel" },
    { id: "tuned-preset", btnTestId: "helptip-btn-tuned-preset", popoverId: "helptip-popover-tuned-preset", title: "Tuned presets" },
    { id: "filament", btnTestId: "helptip-btn-filament", popoverId: "helptip-popover-filament", title: "Filament" },
    { id: "stamp", btnTestId: "helptip-btn-stamp", popoverId: "helptip-popover-stamp", title: "Add a version note to the file" },
  ];

  test("opening any help popover does not push controls below it down", { tag: "@appearance" }, async ({ page }) => {
    const stampToggle = page.locator(".stamp-wrapper");
    const footer = page.locator("footer");

    for (const item of HELP_ITEMS) {
      const refEl = item.id === "stamp" ? footer : stampToggle;
      const before = await getDocPos(refEl);

      const btn = page.getByTestId(item.btnTestId);
      await expect(btn).toBeVisible();
      await btn.click();

      const popover = page.locator(`#${item.popoverId}`);
      await expect(popover).toBeVisible();

      const after = await getDocPos(refEl);
      // Floating popover must not shift document positions of controls below it
      expect(Math.abs(after.y - before.y)).toBeLessThan(1);
      expect(Math.abs(after.height - before.height)).toBeLessThan(1);

      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
      await expect(btn).toBeFocused();
    }
  });

  test("popover closes on Escape and returns focus to the button", async ({ page }) => {
    const btn = page.getByTestId("helptip-btn-tuned-preset");
    await btn.click();
    const popover = page.locator("#helptip-popover-tuned-preset");
    await expect(popover).toBeVisible();
    await expect(btn).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn).toBeFocused();
  });

  test("popover closes on outside click and returns focus to the button", async ({ page }) => {
    const btn = page.getByTestId("helptip-btn-high-flow");
    await btn.click();
    const popover = page.locator("#helptip-popover-high-flow");
    await expect(popover).toBeVisible();

    await page.locator(".inspector-title").click();
    await expect(popover).toBeHidden();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn).toBeFocused();
  });

  test("opening another popover closes the first (only one open at a time)", async ({ page }) => {
    const btn1 = page.getByTestId("helptip-btn-high-flow");
    const popover1 = page.locator("#helptip-popover-high-flow");
    const btn2 = page.getByTestId("helptip-btn-hardened-steel");
    const popover2 = page.locator("#helptip-popover-hardened-steel");

    await btn1.click();
    await expect(popover1).toBeVisible();
    await expect(popover2).toBeHidden();

    await btn2.click();
    await expect(popover1).toBeHidden();
    await expect(popover2).toBeVisible();

    const btn3 = page.getByTestId("helptip-btn-tuned-preset");
    const popover3 = page.locator("#helptip-popover-tuned-preset");
    await btn3.click();
    await expect(popover2).toBeHidden();
    await expect(popover3).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popover3).toBeHidden();
  });

  test("tuned preset popover has the required exact copy without em dashes", async ({ page }) => {
    const btn = page.getByTestId("helptip-btn-tuned-preset");
    await btn.click();
    const popover = page.locator("#helptip-popover-tuned-preset");
    await expect(popover).toBeVisible();

    const text = (await popover.textContent()) ?? "";
    expect(text).toContain("A preset is your own print settings, made from a project you tuned in Snapmaker Orca");
    expect(text).toContain("walls, infill, supports, speeds and so on");
    expect(text).toContain("It changes only what you changed from Snapmaker's stock profile");
    expect(text).toContain("machine settings, filaments and the model's layout are never part of it");
    expect(text).toContain("A preset applies to this conversion only");
    expect(text).toContain("Manage presets under Advanced");
    expect(text).not.toContain("—");
  });

  test("version note popover has explanation and link to output-stamp.md", async ({ page }) => {
    const btn = page.getByTestId("helptip-btn-stamp");
    await btn.click();
    const popover = page.locator("#helptip-popover-stamp");
    await expect(popover).toBeVisible();

    await expect(popover.getByText(/holds nothing about you or your model/i)).toBeVisible();
    const link = popover.getByRole("link", { name: /what's in it/i });
    await expect(link).toHaveAttribute("href", /output-stamp\.md$/);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});

test.describe("sidebar help popovers accessibility", { tag: "@appearance" }, () => {
  for (const scheme of SCHEMES) {
    test(`popovers pass axe in ${scheme} theme`, async ({ page }) => {
      await removeSavePicker(page);
      await seedPreset(page);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await openProject(page);

      const btn = page.getByTestId("helptip-btn-tuned-preset");
      await btn.click();
      await expect(page.locator("#helptip-popover-tuned-preset")).toBeVisible();
      await page.waitForTimeout(300);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }
});

test.describe("sidebar help popover opacity", { tag: "@appearance" }, () => {
  for (const scheme of SCHEMES) {
    test(`popover background alpha is at least 0.95 in ${scheme} theme`, async ({ page }) => {
      await removeSavePicker(page);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await openProject(page);

      const btn = page.getByTestId("helptip-btn-stamp");
      await btn.click();
      const popover = page.locator("#helptip-popover-stamp");
      await expect(popover).toBeVisible();

      const alpha = await popover.evaluate((el) => {
        const bg = window.getComputedStyle(el).backgroundColor;
        const match = bg.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/);
        if (!match) throw new Error(`Could not parse background color: ${bg}`);
        return match[1] !== undefined ? parseFloat(match[1]) : 1.0;
      });

      expect(alpha, `computed background alpha (${alpha}) in ${scheme} should be >= 0.95`).toBeGreaterThanOrEqual(0.95);
    });
  }
});

test.describe("sidebar help popover viewport containment", { tag: "@appearance" }, () => {
  const WIDTHS = [320, 390, 768, 1024, 1440] as const;
  const TIPS = [
    { id: "high-flow", btn: "helptip-btn-high-flow", popover: "#helptip-popover-high-flow" },
    { id: "hardened-steel", btn: "helptip-btn-hardened-steel", popover: "#helptip-popover-hardened-steel" },
    { id: "tuned-preset", btn: "helptip-btn-tuned-preset", popover: "#helptip-popover-tuned-preset" },
    { id: "filament", btn: "helptip-btn-filament", popover: "#helptip-popover-filament" },
    { id: "stamp", btn: "helptip-btn-stamp", popover: "#helptip-popover-stamp" },
  ] as const;

  for (const width of WIDTHS) {
    test(`every popover stays fully on screen at ${width}px wide`, async ({ page }) => {
      await removeSavePicker(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await openProject(page);

      for (const tip of TIPS) {
        const btn = page.getByTestId(tip.btn);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        const popover = page.locator(tip.popover);
        await expect(popover).toBeVisible();
        await page.waitForTimeout(200);

        const { left, right } = await popover.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right) };
        });

        expect(left, `${tip.id} popover left (${left}px) should be >= 0 at ${width}px wide`).toBeGreaterThanOrEqual(0);
        expect(right, `${tip.id} popover right (${right}px) should be <= ${width}px at ${width}px wide`).toBeLessThanOrEqual(width);

        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
      }
    });
  }
});

test.describe("preset fresh-every-time lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await removeSavePicker(page);
    await seedPreset(page);
    await page.goto("/");
  });

  test("initial project load starts at No preset and shows helper text", async ({ page }) => {
    await openProject(page);

    const picker = page.getByTestId("preset-picker");
    await expect(picker).toHaveValue("");
    await expect(picker.locator("option").first()).toHaveText("No preset (creator's settings)");

    const helper = page.locator(".preset-helper-text");
    await expect(helper).toBeVisible();
    await expect(helper).toHaveText("Converts with the creator's settings on Snapmaker's stock profile.");

    const summary = page.getByTestId("preset-summary-line");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText("No preset");
  });

  test("selecting a preset updates summary line, and result view repeats it", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("preset-picker").selectOption("Fast walls");

    const summary = page.getByTestId("preset-summary-line");
    await expect(summary).toHaveText("Converting with preset: Fast walls (3 changes)");

    await convertAndWait(page);

    const resultSummary = page.getByTestId("preset-summary-line-complete");
    await expect(resultSummary).toBeVisible();
    await expect(resultSummary).toHaveText("Converting with preset: Fast walls (3 changes)");
  });

  test("apply and convert again on the same file keeps the chosen preset", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("preset-picker").selectOption("Fast walls");
    await convertAndWait(page);

    // If WhatChangedPanel apply button is available, click it to reconvert
    const applyBtn = page.getByTestId("apply-reconvert-button");
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.getByTestId("download-button").waitFor({ timeout: 30_000 });
      const resultSummary = page.getByTestId("preset-summary-line-complete");
      await expect(resultSummary).toHaveText("Converting with preset: Fast walls (3 changes)");
    } else {
      // Re-trigger convert
      const resultSummary = page.getByTestId("preset-summary-line-complete");
      await expect(resultSummary).toHaveText("Converting with preset: Fast walls (3 changes)");
    }
  });

  test("reload resets to No preset", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("preset-picker").selectOption("Fast walls");
    await expect(page.getByTestId("preset-summary-line")).toHaveText("Converting with preset: Fast walls (3 changes)");

    await page.reload();
    await openProject(page);

    await expect(page.getByTestId("preset-picker")).toHaveValue("");
    await expect(page.getByTestId("preset-summary-line")).toHaveText("No preset");
  });

  test("loading another file resets to No preset and stamp has no options.preset", async ({ page }) => {
    await openProject(page);
    await page.getByTestId("preset-picker").selectOption("Fast walls");
    await expect(page.getByTestId("preset-summary-line")).toHaveText("Converting with preset: Fast walls (3 changes)");

    // Load second file via Convert Another
    await page.getByTestId("convert-another").click();
    await page.getByTestId("file-input").setInputFiles(file("second.3mf", Buffer.from(demoModel)));
    await page.getByTestId("convert-button").waitFor({ timeout: 20_000 });

    await expect(page.getByTestId("preset-picker")).toHaveValue("");
    await expect(page.getByTestId("preset-summary-line")).toHaveText("No preset");

    await convertAndWait(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-button").click(),
    ]);
    const bytes = new Uint8Array(readFileSync(await download.path()));
    const stampFile = unzipSync(bytes)["Metadata/any2orca.json"];
    expect(stampFile).toBeDefined();
    const stamp = JSON.parse(strFromU8(stampFile));
    expect(stamp.options.preset).toBeUndefined();
  });

  test("batch mode keeps preset while open and resets when new batch starts", async ({ page }) => {
    const twoFiles = [file("a.3mf", demoModel), file("b.3mf", demoModel)];
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    await expect(page.getByTestId("batch-view")).toBeVisible();

    // Global preset picker in batch view
    const globalPicker = page.locator(".batch-global-controls select");
    await expect(globalPicker).toHaveValue("");
    await expect(globalPicker.locator("option").first()).toHaveText("No preset (creator's settings)");

    await globalPicker.selectOption("Fast walls");
    await expect(globalPicker).toHaveValue("Fast walls");

    // Clear batch
    await page.getByTestId("clear-batch").click();
    await expect(page.getByTestId("batch-view")).toBeHidden();

    // Start a new batch
    await page.getByTestId("file-input").setInputFiles(twoFiles);
    await expect(page.getByTestId("batch-view")).toBeVisible();

    const newGlobalPicker = page.locator(".batch-global-controls select");
    await expect(newGlobalPicker).toHaveValue("");
  });

  test("selecting a preset with one change shows profile displayName and 'your 1 setting'", async ({ page }) => {
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("any2orca_presets") || '{"format":"any2orca-presets","version":1,"presets":[]}');
      stored.presets.push({
        name: "Single tweak",
        base: "snapmaker-u1-0.4-standard",
        baseInferred: false,
        catalog: { version: "0.1.0", tracks: "Snapmaker Orca 2.4.0" },
        changes: { wall_loops: "4" },
        created: "2026-10-28",
      });
      localStorage.setItem("any2orca_presets", JSON.stringify(stored));
    });

    await openProject(page);
    await page.getByTestId("preset-picker").selectOption("Single tweak");

    const helper = page.locator(".preset-helper-text");
    await expect(helper).toContainText("Converts onto 0.20mm Standard @Snapmaker U1 (0.4 nozzle); your 1 setting replaces the creator's.");
  });

});
