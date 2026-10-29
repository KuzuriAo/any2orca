// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Copies text to the clipboard.
 * Uses navigator.clipboard.writeText if available.
 * Falls back to document.execCommand("copy") when navigator.clipboard is unavailable (e.g. plain HTTP).
 * Returns true if the text was successfully copied, false otherwise.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Failed via clipboard API, try fallback below
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return Boolean(success);
    } catch {
      return false;
    }
  }

  return false;
}
