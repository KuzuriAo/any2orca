// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Yield control back to the browser's main event loop.
 * 
 * Prevents "Page Unresponsive" / Long Task watchdog timeouts in browsers
 * during heavy in-memory operations (unzipping large 3MF archives, parsing
 * hundreds of thousands of 3D vertices, regex XML transformations, and re-zipping).
 * 
 * Uses the modern standard `scheduler.yield()` when available (Chromium 129+),
 * with a fallback to `setTimeout(resolve, 0)`.
 */
export async function yieldToMain(): Promise<void> {
  if (
    typeof window !== "undefined" &&
    "scheduler" in window &&
    typeof (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler?.yield === "function"
  ) {
    return (window as unknown as { scheduler: { yield: () => Promise<void> } }).scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
