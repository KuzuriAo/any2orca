// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SiteMetadataConfig {
  url: string | null;
  isOfficial: boolean;
}

export const OFFICIAL_SITE_URL = "https://any2orca.com";
export const MAX_SITE_URL_LENGTH = 2048;

/**
 * Escapes characters for safe inclusion within HTML attribute values.
 */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escapes characters for safe inclusion within XML element content.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Strips non-printable ASCII control characters and truncates for error messages.
 */
export function sanitizeRejectedValue(val: string, maxLen = 80): string {
  const clean = val.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  if (clean.length > maxLen) {
    return clean.slice(0, maxLen) + "...";
  }
  return clean;
}

function failValidation(raw: string, reason: string): never {
  const sanitized = sanitizeRejectedValue(raw);
  throw new Error(
    `Invalid VITE_SITE_URL: "${sanitized}". ${reason} Expected "http:" or "https:" URL with no query, fragment, credentials, or trailing slash (letters, digits, and -._~/ in path), or "none" for an unindexed private copy.`
  );
}

/**
 * Resolves and strictly validates the site URL from the build-time setting (VITE_SITE_URL).
 * - unset: defaults to the official site URL (https://any2orca.com)
 * - "none" / "false" / "null" / "off" / empty: indicates a private, unindexed copy without a public URL
 * - valid http/https URL: validated and normalized (lowercase scheme and host, no default port, no trailing slash)
 *
 * Any malformed or hostile input fails the build with a descriptive error.
 */
export function parseSiteUrl(raw: string | undefined): SiteMetadataConfig {
  if (raw === undefined) {
    return { url: null, isOfficial: false };
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "none" || lower === "false" || lower === "null" || lower === "off") {
    return { url: null, isOfficial: false };
  }

  if (trimmed.length > MAX_SITE_URL_LENGTH) {
    failValidation(trimmed, "URL exceeds maximum length of 2,048 characters.");
  }

  // Reject whitespace, newlines, control characters, quotes, angle brackets, or backslashes
  if (/[\s\r\n\t<>"\\]/.test(trimmed) || trimmed.includes("\x27")) {
    failValidation(trimmed, "URL contains disallowed characters.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    failValidation(trimmed, "Value is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    failValidation(trimmed, `Protocol "${parsed.protocol}" is not supported.`);
  }

  if (parsed.username || parsed.password) {
    failValidation(trimmed, "User credentials are not allowed.");
  }

  if (parsed.search) {
    failValidation(trimmed, "Query strings are not allowed.");
  }

  if (parsed.hash) {
    failValidation(trimmed, "URL fragments (#) are not allowed.");
  }

  if (!parsed.hostname) {
    failValidation(trimmed, "Hostname is missing.");
  }

  const validHostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?$|^\[[a-fA-F0-9:]+\]$/;
  if (!validHostRegex.test(parsed.hostname)) {
    failValidation(trimmed, "Hostname contains invalid characters.");
  }

  const rawPath = parsed.pathname;
  if (rawPath && rawPath !== "/") {
    if (!/^\/[a-zA-Z0-9\-._~/]*$/.test(rawPath)) {
      failValidation(trimmed, "Path contains invalid characters.");
    }
  }

  const scheme = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  let port = "";
  if (parsed.port) {
    if ((scheme === "http:" && parsed.port !== "80") || (scheme === "https:" && parsed.port !== "443")) {
      port = `:${parsed.port}`;
    }
  }
  const cleanPath = (rawPath === "/" ? "" : rawPath).replace(/\/+$/, "");
  const normalized = `${scheme}//${host}${port}${cleanPath}`;

  if (normalized.length > MAX_SITE_URL_LENGTH) {
    failValidation(trimmed, "Normalized URL exceeds maximum length of 2,048 characters.");
  }

  return {
    url: normalized,
    isOfficial: normalized === OFFICIAL_SITE_URL,
  };
}

/**
 * Updates or cleans metadata tags in index.html to reflect the target site URL.
 */
export function transformHtmlMetadata(html: string, config: SiteMetadataConfig): string {
  if (config.isOfficial) {
    return html;
  }

  let result = html;

  if (config.url) {
    const targetUrl = config.url;
    const escapedUrl = escapeHtmlAttr(targetUrl);
    const jsonLdUrl = JSON.stringify(`${targetUrl}/`);
    const jsonLdImage = JSON.stringify(`${targetUrl}/og-image-any2orca.png`);

    result = result.replace(
      /<link rel="canonical" href="https:\/\/any2orca\.com\/" \/>/,
      `<link rel="canonical" href="${escapedUrl}/" />`
    );
    result = result.replace(
      /\n\s*<meta name="google-site-verification" content="[^"]*" \/>/,
      ""
    );
    result = result.replace(
      /<meta property="og:url" content="https:\/\/any2orca\.com\/" \/>/,
      `<meta property="og:url" content="${escapedUrl}/" />`
    );
    result = result.replace(
      /<meta property="og:image" content="https:\/\/any2orca\.com\/og-image-any2orca\.png" \/>/,
      `<meta property="og:image" content="${escapedUrl}/og-image-any2orca.png" />`
    );
    result = result.replace(
      /<meta name="twitter:url" content="https:\/\/any2orca\.com\/" \/>/,
      `<meta name="twitter:url" content="${escapedUrl}/" />`
    );
    result = result.replace(
      /<meta name="twitter:image" content="https:\/\/any2orca\.com\/og-image-any2orca\.png" \/>/,
      `<meta name="twitter:image" content="${escapedUrl}/og-image-any2orca.png" />`
    );
    result = result.replace(
      /"url":\s*"https:\/\/any2orca\.com\/"/,
      `"url": ${jsonLdUrl}`
    );
    result = result.replace(
      /"image":\s*"https:\/\/any2orca\.com\/og-image-any2orca\.png"/,
      `"image": ${jsonLdImage}`
    );
  } else {
    // Private / local copy: instruct search crawlers not to index this copy
    result = result.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
      "<meta name=\"robots\" content=\"noindex, nofollow\" />"
    );
    // Remove canonical and remote-pointing tags, keep local image path
    result = result.replace(
      /\n\s*<link rel="canonical" href="https:\/\/any2orca\.com\/" \/>/,
      ""
    );
    result = result.replace(
      /\n\s*<meta name="google-site-verification" content="[^"]*" \/>/,
      ""
    );
    result = result.replace(
      /\n\s*<meta property="og:url" content="https:\/\/any2orca\.com\/" \/>/,
      ""
    );
    result = result.replace(
      /<meta property="og:image" content="https:\/\/any2orca\.com\/og-image-any2orca\.png" \/>/,
      "<meta property=\"og:image\" content=\"/og-image-any2orca.png\" />"
    );
    result = result.replace(
      /\n\s*<meta name="twitter:url" content="https:\/\/any2orca\.com\/" \/>/,
      ""
    );
    result = result.replace(
      /<meta name="twitter:image" content="https:\/\/any2orca\.com\/og-image-any2orca\.png" \/>/,
      "<meta name=\"twitter:image\" content=\"/og-image-any2orca.png\" />"
    );
    result = result.replace(
      /\n\s*"url":\s*"https:\/\/any2orca\.com\/",?/,
      ""
    );
    result = result.replace(
      /"image":\s*"https:\/\/any2orca\.com\/og-image-any2orca\.png"/,
      "\"image\": \"/og-image-any2orca.png\""
    );
  }

  return result;
}

export function generateRobotsTxt(config: SiteMetadataConfig): string {
  if (config.url) {
    if (/[\r\n]/.test(config.url)) {
      throw new Error("Invalid URL: site URL cannot contain line breaks");
    }
    const cleanUrl = config.url.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
    return `User-agent: *\nAllow: /\n\nSitemap: ${cleanUrl}/sitemap.xml\n`;
  }
  return "User-agent: *\nDisallow: /\n";
}

export function generateSitemapXml(config: SiteMetadataConfig): string | null {
  if (!config.url) {
    return null;
  }
  const escapedUrl = escapeXml(config.url);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${escapedUrl}/</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`;
}
