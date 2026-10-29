// SPDX-License-Identifier: AGPL-3.0-or-later
(function() {
  try {
    var saved = localStorage.getItem("any2orca_theme");
    var theme = (saved === "light" || saved === "dark")
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
