// SPDX-License-Identifier: AGPL-3.0-or-later
export type Brand = "oss" | "a2o";

/**
 * Normalizes theme/brand identifiers with backwards-compatibility aliases:
 * - "oss", "neutral", "opensource" -> "oss"
 * - "a2o", "any2orca" -> "a2o"
 */
export function normalizeBrand(raw: string | null | undefined): Brand | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "oss" || lower === "neutral" || lower === "opensource") return "oss";
  if (lower === "a2o" || lower === "any2orca") return "a2o";
  return null;
}

export function getInitialBrand(env: Partial<ImportMetaEnv> = import.meta.env ?? {}): Brand {
  const isDev = Boolean(env.DEV);

  // In local development only, allow query param (?brand=a2o / ?brand=oss)
  if (isDev && typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramBrand = urlParams.get("brand");
      const queryBrand = normalizeBrand(paramBrand);
      if (queryBrand) {
        try {
          sessionStorage.setItem("dev_brand_preview", queryBrand);
        } catch {}
        return queryBrand;
      }

      const savedPreview = normalizeBrand(sessionStorage.getItem("dev_brand_preview"));
      if (savedPreview) {
        return savedPreview;
      }
    } catch {
      // Storage access in restricted sandboxes
    }
  }

  // Environment variable override (VITE_BRAND)
  const envBrand = normalizeBrand(env.VITE_BRAND);
  if (envBrand) return envBrand;

  // Default production build is oss (open source software)
  return "oss";
}

export function applyBrand(brand: Brand): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-brand", brand);
}
