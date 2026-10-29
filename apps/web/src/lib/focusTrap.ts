// SPDX-License-Identifier: AGPL-3.0-or-later

export function trapFocus(node: HTMLElement, enabled = true) {
  function getFocusables(): HTMLElement[] {
    return Array.from(
      node.querySelectorAll<HTMLElement>(
        "button:not([disabled]):not([tabindex=\"-1\"]), [href]:not([tabindex=\"-1\"]), input:not([disabled]):not([tabindex=\"-1\"]), select:not([disabled]):not([tabindex=\"-1\"]), textarea:not([disabled]):not([tabindex=\"-1\"]), [tabindex]:not([tabindex=\"-1\"]):not([disabled])"
      )
    ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!enabled || e.key !== "Tab") return;

    const focusables = getFocusables();
    if (focusables.length === 0) {
      node.focus();
      e.preventDefault();
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? focusables.indexOf(active) : -1;

    if (e.shiftKey) {
      if (currentIndex <= 0) {
        focusables[focusables.length - 1].focus();
        e.preventDefault();
      } else {
        focusables[currentIndex - 1].focus();
        e.preventDefault();
      }
    } else {
      if (currentIndex === -1 || currentIndex >= focusables.length - 1) {
        focusables[0].focus();
        e.preventDefault();
      } else {
        focusables[currentIndex + 1].focus();
        e.preventDefault();
      }
    }
  }

  function focusInitial() {
    if (!enabled) return;
    const active = document.activeElement;
    if (active && node.contains(active)) return;
    const focusables = getFocusables();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      node.focus();
    }
  }

  // Focus immediately or in next tick
  queueMicrotask(() => {
    focusInitial();
  });

  window.addEventListener("keydown", handleKeyDown, true);

  return {
    update(newEnabled: boolean) {
      const becameEnabled = !enabled && newEnabled;
      enabled = newEnabled;
      if (becameEnabled) {
        queueMicrotask(() => {
          focusInitial();
        });
      }
    },
    destroy() {
      window.removeEventListener("keydown", handleKeyDown, true);
    },
  };
}
