// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, type Plugin } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import fs from "node:fs"
import path from "node:path"
import {
  parseSiteUrl,
  transformHtmlMetadata,
  generateRobotsTxt,
  generateSitemapXml,
} from "./src/lib/site-metadata.ts"
import { parseHideSections, injectHideSectionsAttribute } from "./src/lib/hiddenSections.ts"
import { injectCrawlerFallback } from "./src/lib/faq.ts"


function getBrandName(): "a2o" | "oss" {
  const brand = (process.env.VITE_BRAND || "").toLowerCase().trim();
  if (brand === "a2o" || brand === "any2orca") return "a2o";
  return "oss";
}

function siteMetadataPlugin(): Plugin {
  let outDir = "dist"
  const siteConfig = parseSiteUrl(process.env.VITE_SITE_URL)
  const hiddenSections = parseHideSections(process.env.VITE_HIDE_SECTIONS)

  return {
    name: "site-metadata",
    configResolved(config) {
      outDir = config.build.outDir
    },
    transformIndexHtml(html) {
      const transformedMeta = transformHtmlMetadata(html, siteConfig)
      const withCrawlerFallback = injectCrawlerFallback(transformedMeta, siteConfig.isOfficial, hiddenSections.has("faq"))
      return injectHideSectionsAttribute(withCrawlerFallback, hiddenSections)
    },
    configureServer(server) {
      const brand = getBrandName();
      const brandingDir = path.resolve(import.meta.dirname, "src/assets/branding");

      server.middlewares.use((req, res, next) => {
        if (req.url === "/favicon.svg") {
          res.setHeader("Content-Type", "image/svg+xml");
          res.end(fs.readFileSync(path.resolve(brandingDir, `favicon-${brand}.svg`)));
          return;
        }
        if (req.url === "/favicon.ico") {
          res.setHeader("Content-Type", "image/x-icon");
          res.end(fs.readFileSync(path.resolve(brandingDir, `favicon-${brand}.ico`)));
          return;
        }
        if (req.url === "/logo.png") {
          res.setHeader("Content-Type", "image/png");
          res.end(fs.readFileSync(path.resolve(brandingDir, `logo-${brand}.png`)));
          return;
        }
        if (req.url === "/robots.txt") {
          res.setHeader("Content-Type", "text/plain")
          res.end(generateRobotsTxt(siteConfig))
          return
        }
        if (req.url === "/sitemap.xml") {
          const sitemap = generateSitemapXml(siteConfig)
          if (sitemap) {
            res.setHeader("Content-Type", "application/xml")
            res.end(sitemap)
          } else {
            res.statusCode = 404
            res.end("Not Found")
          }
          return
        }
        next()
      })
    },
    closeBundle() {
      const robotsPath = path.resolve(outDir, "robots.txt")
      const sitemapPath = path.resolve(outDir, "sitemap.xml")

      fs.writeFileSync(robotsPath, generateRobotsTxt(siteConfig), "utf8")

      const sitemap = generateSitemapXml(siteConfig)
      if (sitemap) {
        fs.writeFileSync(sitemapPath, sitemap, "utf8")
      } else if (fs.existsSync(sitemapPath)) {
        fs.unlinkSync(sitemapPath)
      }

      const licensePath = path.resolve(outDir, "LICENSE.txt")
      const noticePath = path.resolve(outDir, "NOTICE.txt")
      if (!fs.existsSync(licensePath)) {
        fs.writeFileSync(licensePath, fs.readFileSync(path.resolve(import.meta.dirname, "LICENSE"), "utf8"))
      }
      if (!fs.existsSync(noticePath)) {
        fs.writeFileSync(noticePath, fs.readFileSync(path.resolve(import.meta.dirname, "../../NOTICE"), "utf8"))
      }

      const brand = getBrandName();
      const brandingDir = path.resolve(import.meta.dirname, "src/assets/branding");
      fs.copyFileSync(path.resolve(brandingDir, `favicon-${brand}.svg`), path.resolve(outDir, "favicon.svg"));
      fs.copyFileSync(path.resolve(brandingDir, `favicon-${brand}.ico`), path.resolve(outDir, "favicon.ico"));
      fs.copyFileSync(path.resolve(brandingDir, `logo-${brand}.png`), path.resolve(outDir, "logo.png"));

    },
  }
}

export default defineConfig({
  plugins: [svelte(), siteMetadataPlugin()],
  server: {
    port: 5173,
  },
})
