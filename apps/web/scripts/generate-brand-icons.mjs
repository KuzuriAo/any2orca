// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BRAND_COLORS = {
  a2o: "#8b5cf6",
  oss: "#0284c7",
};

const SVG_PATH = `M6460 8864 c-427 -92 -648 -517 -464 -889 51 -104 125 -181 283 -292
582 -411 730 -531 875 -711 322 -399 396 -973 181 -1405 -156 -313 -317 -464
-932 -873 -197 -132 -307 -211 -337 -245 -338 -375 -11 -953 524 -926 189 9
189 9 1305 632 165 92 399 223 520 290 178 99 652 366 1075 605 36 20 175 99
310 175 307 173 456 263 543 327 374 277 382 757 17 1084 -93 83 -294 218
-820 549 -69 43 -204 129 -300 191 -96 61 -222 141 -280 176 -58 36 -202 127
-320 203 -118 76 -260 166 -315 200 -55 34 -343 215 -640 400 -297 186 -586
364 -643 396 -199 110 -407 151 -582 113z`;

function getSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="520 326 618 618" fill="none">
  <g transform="translate(0,1254) scale(0.1,-0.1)" fill="${color}" stroke="none">
  <path d="${SVG_PATH}"/>
  </g>
</svg>
`;
}

function createIco(pngBuffers) {
  const headerLen = 6;
  const dirEntryLen = 16;
  const numImages = pngBuffers.length;
  let offset = headerLen + dirEntryLen * numImages;

  const header = Buffer.alloc(headerLen);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(numImages, 4); // count

  const entries = [];
  for (const img of pngBuffers) {
    const entry = Buffer.alloc(dirEntryLen);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((img) => img.buffer)]);
}

async function main() {
  const outDir = path.resolve(import.meta.dirname, "../src/assets/branding");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const [brand, color] of Object.entries(BRAND_COLORS)) {
    const svg = getSvg(color);
    const svgPath = path.resolve(outDir, `favicon-${brand}.svg`);
    fs.writeFileSync(svgPath, svg, "utf8");

    // 512x512 logo.png
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent(`<style>body,html{margin:0;padding:0;overflow:hidden;background:transparent;}</style>${svg}`);
    const logoPng = await page.screenshot({ omitBackground: true, type: "png" });
    fs.writeFileSync(path.resolve(outDir, `logo-${brand}.png`), logoPng);

    // 16, 32, 48 favicon.ico
    const sizes = [16, 32, 48];
    const images = [];
    for (const s of sizes) {
      await page.setViewportSize({ width: s, height: s });
      await page.setContent(`<style>body,html{margin:0;padding:0;overflow:hidden;background:transparent;}</style>${svg}`);
      const buffer = await page.screenshot({ omitBackground: true, type: "png" });
      images.push({ width: s, height: s, buffer });
    }
    const icoBuf = createIco(images);
    fs.writeFileSync(path.resolve(outDir, `favicon-${brand}.ico`), icoBuf);
    console.log(`Generated brand assets for ${brand} (${color})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Asset generation failed:", err);
  process.exit(1);
});
