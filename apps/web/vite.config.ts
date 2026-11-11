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
import { injectCrawlerFallback, injectFaqPageCrawlerFallback } from "./src/lib/faq.ts"


function getBrandName(): "a2o" | "oss" {
  const brand = (process.env.VITE_BRAND || "").toLowerCase().trim();
  if (brand === "a2o" || brand === "any2orca") return "a2o";
  return "oss";
}

function transformFaqHtml(rawFaqHtml: string, siteConfig: ReturnType<typeof parseSiteUrl>, hiddenSections: ReturnType<typeof parseHideSections>): string {
  const transformedMeta = transformHtmlMetadata(rawFaqHtml, siteConfig)
  const withCrawlerFallback = injectFaqPageCrawlerFallback(transformedMeta, siteConfig.isOfficial)
  return injectHideSectionsAttribute(withCrawlerFallback, hiddenSections)
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
    transformIndexHtml(html, ctx) {
      const isFaq = Boolean(
        ctx?.filename?.replace(/\\/g, "/").endsWith("/faq/index.html") ||
        ctx?.path?.startsWith("/faq")
      )
      if (isFaq) {
        return transformFaqHtml(html, siteConfig, hiddenSections)
      }
      const transformedMeta = transformHtmlMetadata(html, siteConfig)
      const withCrawlerFallback = injectCrawlerFallback(transformedMeta, siteConfig.isOfficial, hiddenSections.has("faq"))
      return injectHideSectionsAttribute(withCrawlerFallback, hiddenSections)
    },
    configureServer(server) {
      const brand = getBrandName();
      const brandingDir = path.resolve(import.meta.dirname, "src/assets/branding");

      server.middlewares.use((req, res, next) => {
        if (req.url === "/faq" || req.url?.startsWith("/faq?")) {
          req.url = req.url.replace(/^\/faq/, "/faq/index.html");
        }
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
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (
          req.url === "/faq" ||
          req.url === "/faq/" ||
          req.url?.startsWith("/faq?") ||
          req.url?.startsWith("/faq/?")
        ) {
          const faqHtmlPath = path.resolve(outDir, "faq/index.html")
          if (fs.existsSync(faqHtmlPath)) {
            res.statusCode = 200
            res.setHeader("Content-Type", "text/html; charset=utf-8")
            res.end(fs.readFileSync(faqHtmlPath))
            return
          }
        }
        next()
      })
    },
    closeBundle() {
      const builtIndexPath = path.resolve(outDir, "index.html")
      const srcFaqPath = path.resolve(import.meta.dirname, "faq/index.html")
      if (fs.existsSync(builtIndexPath) && fs.existsSync(srcFaqPath)) {
        const builtIndex = fs.readFileSync(builtIndexPath, "utf8")
        let faqHtml = fs.readFileSync(srcFaqPath, "utf8")
        // Copy built module script / stylesheet tags from built index.html into faq/index.html
        const builtHeadAssets = builtIndex.match(/\s*<script type="module" crossorigin[^>]*><\/script>(?:\s*<link rel="stylesheet"[^>]*>)*/)?.[0] ?? ""
        faqHtml = faqHtml.replace(/\s*<script type="module" src="\/src\/main\.ts"><\/script>/, "")
        faqHtml = faqHtml.replace("</head>", `${builtHeadAssets}\n  </head>`)
        faqHtml = transformFaqHtml(faqHtml, siteConfig, hiddenSections)
        const outFaqDir = path.resolve(outDir, "faq")
        fs.mkdirSync(outFaqDir, { recursive: true })
        fs.writeFileSync(path.resolve(outFaqDir, "index.html"), faqHtml, "utf8")
      }

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
