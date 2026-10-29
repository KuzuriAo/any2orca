// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";
import { openProject, convertAndWait, removeSavePicker, SCHEMES } from "./helpers";

test("bed preview renders neutral text watermark and no drawn logo paths", async ({ page }) => {
  await removeSavePicker(page);
  await page.goto("/");
  await openProject(page);

  // Pre-conversion (Bambu source): renders text and no drawn logo paths
  const watermarkText = page.getByTestId("bed-watermark-text");
  await expect(watermarkText).toBeVisible();
  await expect(watermarkText).toHaveText("Bambu Lab");

  // No vendor logo paths
  await expect(page.locator(".bed-svg path[d*='M -16 -20.5']")).toHaveCount(0);
  await expect(page.locator(".bed-svg path[d*='M 15.23']")).toHaveCount(0);
  await expect(page.locator(".bed-svg polygon")).toHaveCount(0);
  await expect(page.locator(".bed-svg path[d*='M937.97']")).toHaveCount(0);

  // Post-conversion: renders Snapmaker text and no drawn logo paths
  await convertAndWait(page);
  await expect(watermarkText).toHaveText("Snapmaker");
  await expect(page.locator(".bed-svg path[d*='M937.97']")).toHaveCount(0);
});

for (const scheme of SCHEMES) {
  test.describe(`bed brand name legibility (${scheme})`, { tag: "@appearance" }, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("renders at least 12px tall and at least 4.5:1 contrast against the bed surface at 1280px and 400px before and after converting", async ({ page }) => {
      await removeSavePicker(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      await openProject(page);

      const measureBrandText = async () => {
        return page.evaluate(() => {
          const textEl = document.querySelector<SVGTextElement>('[data-testid="bed-watermark-text"]');
          const bedRect = document.querySelector<SVGRectElement>(".bed-svg rect");
          if (!textEl || !bedRect) return null;

          const parseColor = (raw: string): [number, number, number, number] => {
            const probe = document.createElement("div");
            probe.style.color = raw.trim();
            document.body.appendChild(probe);
            const computed = window.getComputedStyle(probe).color;
            probe.remove();
            const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!m) return [0, 0, 0, 1];
            return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
          };

          const textCs = window.getComputedStyle(textEl);
          const [fgR, fgG, fgB, fgA] = parseColor(textCs.fill);
          const fillOpacity = Number(textCs.fillOpacity || "1");

          let effectiveOpacity = fgA * fillOpacity;
          let node: Element | null = textEl;
          while (node && node !== document.documentElement) {
            effectiveOpacity *= Number(window.getComputedStyle(node).opacity || "1");
            node = node.parentElement;
          }

          const rawBedBg =
            window.getComputedStyle(document.documentElement).getPropertyValue("--bed-surface-bg").trim() ||
            window.getComputedStyle(bedRect).fill;
          const [bgR, bgG, bgB] = parseColor(rawBedBg);

          const blend = (fg: number, bg: number) => fg * effectiveOpacity + bg * (1 - effectiveOpacity);
          const blended: [number, number, number] = [
            blend(fgR, bgR),
            blend(fgG, bgG),
            blend(fgB, bgB),
          ];

          const srgbToLinear = (c: number) => {
            const v = c / 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          };
          const luminance = ([r, g, b]: [number, number, number]) =>
            0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

          const l1 = luminance(blended);
          const l2 = luminance([bgR, bgG, bgB]);
          const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

          const rect = textEl.getBoundingClientRect();
          const svgRect = document.querySelector(".bed-svg")?.getBoundingClientRect();
          return {
            text: textEl.textContent?.trim() ?? "",
            height: rect.height,
            contrast,
            effectiveOpacity,
            svgWidth: svgRect?.width ?? 0,
          };
        });
      };

      for (const state of ["before", "after"] as const) {
        if (state === "after") {
          await convertAndWait(page);
        }
        for (const width of [1280, 400] as const) {
          await page.setViewportSize({ width, height: 900 });
          const metrics = await measureBrandText();
          expect(metrics, `${scheme} ${state} @ ${width}px`).not.toBeNull();
          expect(metrics!.text).toBe(state === "before" ? "Bambu Lab" : "Snapmaker");
          expect(metrics!.height, `${scheme} ${state} @ ${width}px height`).toBeGreaterThanOrEqual(12);
          expect(metrics!.contrast, `${scheme} ${state} @ ${width}px contrast`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  });
}
