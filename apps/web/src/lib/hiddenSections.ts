// SPDX-License-Identifier: AGPL-3.0-or-later

export const ALLOWED_HIDE_SECTIONS = ["beyond", "faq", "integrate", "support"] as const;
export type HideSection = (typeof ALLOWED_HIDE_SECTIONS)[number];

const MAX_RUNTIME_ATTR_LEN = 100;

function sanitizeRejectedValue(val: string, maxLen = 80): string {
  const clean = val.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  if (clean.length > maxLen) {
    return clean.slice(0, maxLen) + "...";
  }
  return clean;
}

/**
 * Validates and parses VITE_HIDE_SECTIONS at build time:
 * Comma-separated list from: "beyond", "faq", "integrate", "support".
 * Rejects any unknown name with an error that names the setting and lists the allowed names.
 * Unset or empty returns an empty Set.
 */
export function parseHideSections(raw: string | undefined): Set<HideSection> {
  if (raw === undefined) {
    return new Set();
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return new Set();
  }
  const parts = trimmed
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const result = new Set<HideSection>();
  for (const part of parts) {
    if (!ALLOWED_HIDE_SECTIONS.includes(part as HideSection)) {
      const sanitized = sanitizeRejectedValue(part);
      throw new Error(
        `Invalid VITE_HIDE_SECTIONS: "${sanitized}". Unknown section name. Allowed section names are: ${ALLOWED_HIDE_SECTIONS.join(", ")}.`
      );
    }
    result.add(part as HideSection);
  }
  return result;
}

/**
 * Forgiving runtime parser for document.documentElement.dataset.hide.
 * - Caps input length at 100 characters.
 * - Trims and compares lowercase.
 * - Silently drops any unknown or hostile names.
 * - Treats missing, null, or empty as empty set (hide nothing).
 * - Never throws.
 */
export function parseRuntimeHideSections(raw: string | undefined | null): Set<HideSection> {
  if (typeof raw !== "string") {
    return new Set();
  }
  const capped = raw.slice(0, MAX_RUNTIME_ATTR_LEN).trim();
  if (!capped) {
    return new Set();
  }
  const parts = capped
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const result = new Set<HideSection>();
  for (const part of parts) {
    if (ALLOWED_HIDE_SECTIONS.includes(part as HideSection)) {
      result.add(part as HideSection);
    }
  }
  return result;
}

let cachedRuntimeHiddenSections: Set<HideSection> | null = null;

function getRuntimeHiddenSections(): Set<HideSection> {
  if (cachedRuntimeHiddenSections !== null) {
    return cachedRuntimeHiddenSections;
  }
  const g = globalThis as unknown as {
    document?: { documentElement?: { dataset?: { hide?: string } } };
  };
  if (typeof g.document !== "undefined" && g.document?.documentElement) {
    cachedRuntimeHiddenSections = parseRuntimeHideSections(g.document.documentElement.dataset?.hide);
  } else {
    cachedRuntimeHiddenSections = new Set();
  }
  return cachedRuntimeHiddenSections;
}

export function isSectionHidden(section: HideSection): boolean {
  return getRuntimeHiddenSections().has(section);
}

/** Testing helper to reset the cached runtime hidden sections. */
export function _resetHiddenSectionsCache(): void {
  cachedRuntimeHiddenSections = null;
}

/**
 * HTML transformation helper to inject the data-hide attribute on <html ...>.
 * When hiddenSections is empty, returns html byte-identical.
 */
export function injectHideSectionsAttribute(html: string, hiddenSections: Set<HideSection>): string {
  if (hiddenSections.size === 0) {
    return html;
  }
  const hideAttrValue = Array.from(hiddenSections).join(",");
  if (/data-hide="[^"]*"/.test(html)) {
    return html.replace(/data-hide="[^"]*"/, `data-hide="${hideAttrValue}"`);
  }
  return html.replace(/(<html\b[^>]*)(>)/i, `$1 data-hide="${hideAttrValue}"$2`);
}
