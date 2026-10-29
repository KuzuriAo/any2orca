// SPDX-License-Identifier: AGPL-3.0-or-later
export type Theme = "dark" | "light";

const THEME_KEY = "any2orca_theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    // Storage access may throw in restricted sandboxes
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Keep in-memory on storage restrictions
  }
}
