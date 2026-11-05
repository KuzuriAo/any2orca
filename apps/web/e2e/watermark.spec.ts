// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { demoModel, openProject, convertAndWait, removeSavePicker, SCHEMES, waitForAnimations } from "./helpers";

const SOURCES_DIR = fileURLToPath(new URL("../../../packages/core/src/test-fixtures/sources/", import.meta.url));

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

      const readBrandMetrics = async () => {
        await waitForAnimations(page);
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
          const ctmA = textEl.getScreenCTM()?.a ?? 1;
          const renderedFontSize = Number(textEl.getAttribute("font-size") || "0") * ctmA;
          return {
            text: textEl.textContent?.trim() ?? "",
            height: rect.height,
            renderedFontSize,
            contrast,
            effectiveOpacity,
            svgWidth: svgRect?.width ?? 0,
          };
        });
      };

      const measureSettledBrandText = async (expectedName: string) => {
        let settled: Awaited<ReturnType<typeof readBrandMetrics>> = null;
        let prevHeight = -1;
        await expect
          .poll(
            async () => {
              const curr = await readBrandMetrics();
              if (!curr || curr.text !== expectedName) return false;
              // Wait until getBoundingClientRect().height reflects the current CTM font size and agrees with the previous poll
              const matchesFontBox = curr.height >= curr.renderedFontSize * 1.18;
              const stable = matchesFontBox && Math.abs(curr.height - prevHeight) < 0.01;
              prevHeight = curr.height;
              if (stable) settled = curr;
              return stable;
            },
            { timeout: 5000, intervals: [50, 100, 150, 200] },
          )
          .toBe(true);
        return settled!;
      };

      const watermarkText = page.getByTestId("bed-watermark-text");
      const heightsByWidth: Record<number, number> = {};
      const fontSizesByWidth: Record<number, number> = {};

      for (const state of ["before", "after"] as const) {
        const expectedName = state === "before" ? "Bambu Lab" : "Snapmaker";
        if (state === "after") {
          await convertAndWait(page);
        }
        await expect(watermarkText).toHaveText(expectedName);

        for (const width of [1280, 400] as const) {
          await page.setViewportSize({ width, height: 900 });
          const metrics = await measureSettledBrandText(expectedName);
          expect(metrics, `${scheme} ${state} @ ${width}px`).not.toBeNull();
          expect(metrics.text).toBe(expectedName);
          expect(metrics.height, `${scheme} ${state} @ ${width}px height`).toBeGreaterThanOrEqual(12);
          expect(metrics.contrast, `${scheme} ${state} @ ${width}px contrast`).toBeGreaterThanOrEqual(4.5);
          heightsByWidth[width] = metrics.height;
          fontSizesByWidth[width] = metrics.renderedFontSize;
        }
      }

      // Also verify a 350x350 Creality bed renders the brand name at the same screen height as the 256x256 and 270x270 beds
      const crealityBuf = readFileSync(`${SOURCES_DIR}creality-print-7.3.0.6157-scene.3mf`);
      await openProject(page, "creality-scene.3mf", crealityBuf);
      await expect(watermarkText).toHaveText("Creality");
      for (const width of [1280, 400] as const) {
        await page.setViewportSize({ width, height: 900 });
        const crealityMetrics = await measureSettledBrandText("Creality");
        expect(crealityMetrics, `${scheme} creality 350x350 @ ${width}px`).not.toBeNull();
        expect(crealityMetrics.text).toBe("Creality");
        expect(crealityMetrics.height, `${scheme} creality 350x350 @ ${width}px height`).toBeGreaterThanOrEqual(12);
        expect(Math.abs(crealityMetrics.height - heightsByWidth[width]), `${scheme} creality 350x350 matches 270x270 height @ ${width}px`).toBeLessThan(1);
        expect(
          Math.abs(crealityMetrics.renderedFontSize - fontSizesByWidth[width]),
          `${scheme} creality 350x350 matches 270x270 rendered font size @ ${width}px`,
        ).toBeLessThan(0.5);
        expect(crealityMetrics.contrast, `${scheme} creality 350x350 @ ${width}px contrast`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
const PRUSA_DIR = fileURLToPath(new URL("../../../packages/core/src/test-fixtures/prusaslicer/", import.meta.url));

test(
  "multi-plate preview places PrusaSlicer 2.9 beds and Bambu Studio plates inside their beds before and after converting",
  { tag: "@appearance" },
  async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");

    const readPlateRects = async (bedHeight: number) => {
      return page.evaluate((bh) => {
        const objRects = Array.from(document.querySelectorAll<SVGRectElement>(".bed-svg .object-group > rect")).map((r) => {
          const x = Number(r.getAttribute("x"));
          const y = Number(r.getAttribute("y"));
          const w = Number(r.getAttribute("width"));
          const h = Number(r.getAttribute("height"));
          const title = r.parentElement?.querySelector("title")?.textContent ?? "";
          return {
            title,
            svgX: x,
            svgY: y,
            width: w,
            height: h,
            minX: Math.round(x),
            maxX: Math.round(x + w),
            minY: Math.round(bh - (y + h)),
            maxY: Math.round(bh - y),
          };
        });
        const origRects = Array.from(document.querySelectorAll<SVGRectElement>('.bed-svg > rect[stroke-dasharray="3,3"]')).map(
          (r) => {
            const x = Number(r.getAttribute("x"));
            const y = Number(r.getAttribute("y"));
            const w = Number(r.getAttribute("width"));
            const h = Number(r.getAttribute("height"));
            return { svgX: x, svgY: y, width: w, height: h };
          },
        );
        return { objRects, origRects };
      }, bedHeight);
    };

    // 1. PrusaSlicer 4-bed XL fixture (360 x 360 mm)
    const prusaBedsBuf = readFileSync(`${PRUSA_DIR}prusaslicer-2.9.6-beds.3mf`);
    await openProject(page, "prusaslicer-2.9.6-beds.3mf", prusaBedsBuf);

    const expectedPrusaPlates = [
      { plate: 1, name: "Merged", minX: 138, maxX: 229, minY: 126, maxY: 226 },
      { plate: 2, name: "Shape-Cylinder", minX: 166, maxX: 207, minY: 152, maxY: 193 },
      { plate: 3, name: "Shape-Sphere", minX: 151, maxX: 196, minY: 152, maxY: 197 },
      { plate: 4, name: "Shape-Box", minX: 164, maxX: 200, minY: 155, maxY: 191 },
    ] as const;

    for (const expected of expectedPrusaPlates) {
      await page.locator(".plate-tabs .tab-btn", { hasText: `Plate ${expected.plate}` }).click();
      const { objRects } = await readPlateRects(360);
      expect(objRects, `Prusa plate ${expected.plate} object count`).toHaveLength(1);
      const obj = objRects[0]!;
      expect(obj.title).toContain(expected.name);
      expect(obj.svgX).toBeGreaterThanOrEqual(0);
      expect(obj.svgX + obj.width).toBeLessThanOrEqual(360);
      expect(obj.svgY).toBeGreaterThanOrEqual(0);
      expect(obj.svgY + obj.height).toBeLessThanOrEqual(360);
      expect({ minX: obj.minX, maxX: obj.maxX, minY: obj.minY, maxY: obj.maxY }).toEqual({
        minX: expected.minX,
        maxX: expected.maxX,
        minY: expected.minY,
        maxY: expected.maxY,
      });
    }

    await convertAndWait(page);
    for (const expected of expectedPrusaPlates) {
      await page.locator(".plate-tabs .tab-btn", { hasText: `Plate ${expected.plate}` }).click();
      const { objRects, origRects } = await readPlateRects(270);
      expect(objRects, `Converted Prusa plate ${expected.plate} object count`).toHaveLength(1);
      const obj = objRects[0]!;
      expect(obj.svgX, `Converted Prusa plate ${expected.plate} x min`).toBeGreaterThanOrEqual(0);
      expect(obj.svgX + obj.width, `Converted Prusa plate ${expected.plate} x max`).toBeLessThanOrEqual(270);
      expect(obj.svgY, `Converted Prusa plate ${expected.plate} y min`).toBeGreaterThanOrEqual(0);
      expect(obj.svgY + obj.height, `Converted Prusa plate ${expected.plate} y max`).toBeLessThanOrEqual(270);

      expect(origRects, `Converted Prusa plate ${expected.plate} original outline count`).toHaveLength(1);
      const orig = origRects[0]!;
      expect(orig.svgX, `Converted Prusa plate ${expected.plate} orig x min`).toBeGreaterThanOrEqual(0);
      expect(orig.svgX + orig.width, `Converted Prusa plate ${expected.plate} orig x max`).toBeLessThanOrEqual(270);
      expect(orig.svgY, `Converted Prusa plate ${expected.plate} orig y min`).toBeGreaterThanOrEqual(0);
      expect(orig.svgY + orig.height, `Converted Prusa plate ${expected.plate} orig y max`).toBeLessThanOrEqual(270);
    }

    // 2. Bambu Studio multi-plate fixture (demo-model.3mf, 2 plates on 256 x 256 mm bed)
    await openProject(page);
    await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 2" }).click();
    const bambuPreP2 = await readPlateRects(256);
    expect(bambuPreP2.objRects).toHaveLength(1);
    expect({
      minX: bambuPreP2.objRects[0]!.minX,
      maxX: bambuPreP2.objRects[0]!.maxX,
      minY: bambuPreP2.objRects[0]!.minY,
      maxY: bambuPreP2.objRects[0]!.maxY,
    }).toEqual({ minX: 110, maxX: 145, minY: 110, maxY: 145 });

    await convertAndWait(page);
    await page.locator(".plate-tabs .tab-btn", { hasText: "Plate 2" }).click();
    const bambuPostP2 = await readPlateRects(270);
    expect(bambuPostP2.objRects).toHaveLength(1);
    expect(bambuPostP2.objRects[0]!.svgX).toBeGreaterThanOrEqual(0);
    expect(bambuPostP2.objRects[0]!.svgX + bambuPostP2.objRects[0]!.width).toBeLessThanOrEqual(270);
    expect(bambuPostP2.objRects[0]!.svgY).toBeGreaterThanOrEqual(0);
    expect(bambuPostP2.objRects[0]!.svgY + bambuPostP2.objRects[0]!.height).toBeLessThanOrEqual(270);

    // Verify at 1440px and 390px in both dark and light themes with no horizontal overflow
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "light"] as const) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `no horizontal overflow at ${width}px (${theme})`).toBeLessThanOrEqual(0);
      }
    }
  },
);


test(
  "project with an empty plate 2 before used plate 3 shows three tabs with Plate 2 marked empty, draws Plate 3 inside the 270 mm bed after converting, shows the empty line on Plate 2, and displays the empty-plate note",
  { tag: "@appearance" },
  async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");

    const entries = unzipSync(new Uint8Array(demoModel));
    const settings = strFromU8(entries["Metadata/model_settings.config"]!);
    const second = settings.indexOf("  <plate>", settings.indexOf("</plate>"));
    const empty =
      '  <plate>\n    <metadata key="plater_id" value="2"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n  </plate>\n';
    entries["Metadata/model_settings.config"] = strToU8(
      settings.slice(0, second) +
        empty +
        settings.slice(second).replace('key="plater_id" value="2"', 'key="plater_id" value="3"'),
    );
    const emptyPlateModel = Buffer.from(zipSync(entries));

    await openProject(page, "empty-plate-2.3mf", emptyPlateModel);

    const tabs = page.locator(".plate-tabs .tab-btn");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveText("Plate 1");
    await expect(tabs.nth(1)).toHaveText("Plate 2, empty");
    await expect(tabs.nth(2)).toHaveText("Plate 3");

    // Pre-conversion: Plate 2 shows the empty bed and empty line
    await tabs.nth(1).click();
    await expect(page.getByTestId("empty-plate-message")).toHaveText("No objects on this plate");
    await expect(page.locator(".bed-svg .object-group > rect")).toHaveCount(0);

    await convertAndWait(page);

    // Note is visible on the page
    const notes = page.getByTestId("status-warning");
    await expect(notes).toBeVisible();
    await expect(notes).toContainText(
      "plate 2 has no objects in the project; it stays empty, so the other plates keep their numbers",
    );

    // Post-conversion: Plate 2 still shows the empty line and 0 objects
    await expect(page.getByTestId("empty-plate-message")).toHaveText("No objects on this plate");
    await expect(page.locator(".bed-svg .object-group > rect")).toHaveCount(0);

    // Post-conversion: Plate 3's object is drawn inside the 270 mm bed on its own tab
    await tabs.nth(2).click();
    await expect(page.getByTestId("empty-plate-message")).toBeHidden();
    const plate3Rects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<SVGRectElement>(".bed-svg .object-group > rect")).map((r) => ({
        svgX: Number(r.getAttribute("x")),
        svgY: Number(r.getAttribute("y")),
        width: Number(r.getAttribute("width")),
        height: Number(r.getAttribute("height")),
      }));
    });
    expect(plate3Rects).toHaveLength(1);
    const obj = plate3Rects[0]!;
    expect(obj.svgX).toBeGreaterThanOrEqual(0);
    expect(obj.svgX + obj.width).toBeLessThanOrEqual(270);
    expect(obj.svgY).toBeGreaterThanOrEqual(0);
    expect(obj.svgY + obj.height).toBeLessThanOrEqual(270);

    // Verify at 1440px and 390px in both dark and light themes with axe and no horizontal overflow
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "light"] as const) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal overflow at ${width}px (${theme})`).toBeLessThanOrEqual(0);
      }
    }
    await waitForAnimations(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  },
);


test(
  "project with four used plates and an empty fifth plate uses the 3-column source grid so every object draws inside the bed before converting, with Plate 5 marked empty",
  { tag: "@appearance" },
  async ({ page }) => {
    await removeSavePicker(page);
    await page.goto("/");

    const entries = unzipSync(new Uint8Array(demoModel));
    let modelXml = strFromU8(entries["3D/3dmodel.model"]!);
    // Add object 4 (clone of object 3) and place objects 1..4 on a 3-column 256mm grid (pitch = 307.2):
    // Plate 1 (col 0, row 0): (110, 40)
    // Plate 2 (col 1, row 0): (100 + 307.2 = 407.2, 140)
    // Plate 3 (col 2, row 0): (110 + 614.4 = 724.4, 110)
    // Plate 4 (col 0, row 1): (110, 110 - 307.2 = -197.2)
    const obj3Block = /<object id="3"[\s\S]*?<\/object>/.exec(modelXml)![0];
    const obj4Block = obj3Block.replace('<object id="3"', '<object id="4"');
    modelXml = modelXml
      .replace("</resources>", `    ${obj4Block}\n  </resources>`)
      .replace(
        /<build>[\s\S]*?<\/build>/,
        `<build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 110.0 40.0 0" printable="1"/>
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 407.2 140.0 0" printable="1"/>
    <item objectid="3" transform="1 0 0 0 1 0 0 0 1 724.4 110.0 0" printable="1"/>
    <item objectid="4" transform="1 0 0 0 1 0 0 0 1 110.0 -197.2 0" printable="1"/>
  </build>`,
      );
    entries["3D/3dmodel.model"] = strToU8(modelXml);

    entries["Metadata/model_settings.config"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1"><metadata key="extruder" value="1"/></object>
  <object id="2"><metadata key="extruder" value="2"/></object>
  <object id="3"><metadata key="extruder" value="3"/></object>
  <object id="4"><metadata key="extruder" value="1"/></object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="1"/></model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="2"/>
    <metadata key="plater_name" value=""/>
    <model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="2"/></model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="3"/>
    <metadata key="plater_name" value=""/>
    <model_instance><metadata key="object_id" value="3"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="3"/></model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="4"/>
    <metadata key="plater_name" value=""/>
    <model_instance><metadata key="object_id" value="4"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="4"/></model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="5"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
  </plate>
</config>`);

    const fivePlateModel = Buffer.from(zipSync(entries));
    await openProject(page, "five-plates-last-empty.3mf", fivePlateModel);

    const tabs = page.locator(".plate-tabs .tab-btn");
    await expect(tabs).toHaveCount(5);
    await expect(tabs.nth(0)).toHaveText("Plate 1");
    await expect(tabs.nth(1)).toHaveText("Plate 2");
    await expect(tabs.nth(2)).toHaveText("Plate 3");
    await expect(tabs.nth(3)).toHaveText("Plate 4");
    await expect(tabs.nth(4)).toHaveText("Plate 5, empty");

    for (let plateNum = 1; plateNum <= 4; plateNum++) {
      await tabs.nth(plateNum - 1).click();
      await expect(page.getByTestId("empty-plate-message")).toBeHidden();
      const rects = await page.evaluate(() => {
        return Array.from(document.querySelectorAll<SVGRectElement>(".bed-svg .object-group > rect")).map((r) => ({
          svgX: Number(r.getAttribute("x")),
          svgY: Number(r.getAttribute("y")),
          width: Number(r.getAttribute("width")),
          height: Number(r.getAttribute("height")),
        }));
      });
      expect(rects, `Plate ${plateNum} pre-conversion object count`).toHaveLength(1);
      const obj = rects[0]!;
      expect(obj.svgX, `Plate ${plateNum} svgX >= 0`).toBeGreaterThanOrEqual(0);
      expect(obj.svgX + obj.width, `Plate ${plateNum} svgX + width <= 256`).toBeLessThanOrEqual(256);
      expect(obj.svgY, `Plate ${plateNum} svgY >= 0`).toBeGreaterThanOrEqual(0);
      expect(obj.svgY + obj.height, `Plate ${plateNum} svgY + height <= 256`).toBeLessThanOrEqual(256);
    }

    await tabs.nth(4).click();
    await expect(page.getByTestId("empty-plate-message")).toHaveText("No objects on this plate");
    await expect(page.locator(".bed-svg .object-group > rect")).toHaveCount(0);
  },
);
