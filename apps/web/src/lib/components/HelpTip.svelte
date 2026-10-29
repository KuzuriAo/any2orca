<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Shared help popover for side control panel options.
  Invariant (set 2026-10-21): HelpTip is how every option in the side control panel
  is explained from now on. An option is a label plus its control, with its explanation
  in a HelpTip; no inline explanation text, no separate help drawer, no one-off tooltip.
  When adding a new option later, add its help text in the same change.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { helpTipStore } from "../helpTipState.svelte";

  let {
    id,
    title,
    ariaLabel,
    testId,
    children,
  }: {
    id: string;
    title: string;
    ariaLabel?: string;
    testId?: string;
    children?: Snippet;
  } = $props();

  let buttonEl = $state<HTMLButtonElement | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let isOpen = $derived(helpTipStore.isOpen(id));

  const popoverId = $derived(`helptip-popover-${id}`);
  const titleId = $derived(`helptip-title-${id}`);

  function toggle() {
    helpTipStore.toggle(id);
  }

  function closeAndRefocus() {
    if (isOpen) {
      helpTipStore.close(id);
      buttonEl?.focus();
    }
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      closeAndRefocus();
    }
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (!isOpen) return;
    const target = e.target as Node;
    if (buttonEl && buttonEl.contains(target)) return;
    if (popoverEl && popoverEl.contains(target)) return;
    helpTipStore.close(id);
    setTimeout(() => {
      buttonEl?.focus();
    }, 10);
  }

  // Keep the open popover fully on screen at any width: measure it where the CSS puts it, then shift it
  // sideways by just enough to leave a 12px gap from each edge.
  $effect(() => {
    const el = popoverEl;
    if (!isOpen || !el) return;
    const fit = () => {
      el.style.translate = "0 0";
      const gap = 12;
      const viewport = document.documentElement.clientWidth;
      const left = el.getBoundingClientRect().left;
      const right = left + el.offsetWidth;
      const shift = left < gap ? gap - left : right > viewport - gap ? viewport - gap - right : 0;
      el.style.translate = `${Math.round(shift)}px 0`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });
</script>

<svelte:window
  onkeydown={handleWindowKeyDown}
  onpointerdown={handleWindowPointerDown}
/>

<div class="helptip-wrapper">
  <button
    type="button"
    class="helptip-btn"
    class:is-active={isOpen}
    aria-expanded={isOpen}
    aria-controls={popoverId}
    aria-label={ariaLabel || `Help: ${title}`}
    data-testid={testId || `helptip-btn-${id}`}
    bind:this={buttonEl}
    onclick={toggle}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  </button>

  {#if isOpen}
    <div
      class="helptip-popover"
      id={popoverId}
      role="region"
      aria-labelledby={titleId}
      bind:this={popoverEl}
    >
      <div class="helptip-header">
        <h4 id={titleId} class="helptip-title">{title}</h4>
        <button
          type="button"
          class="helptip-close-btn"
          onclick={closeAndRefocus}
          aria-label="Close help"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="helptip-content">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .helptip-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .helptip-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.15s ease;
  }

  .helptip-btn:hover {
    color: var(--accent-strong);
    background: var(--badge-accent-bg);
    border-color: var(--accent);
  }

  .helptip-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .helptip-btn.is-active {
    background: var(--accent);
    border-color: var(--accent-strong);
    color: var(--text-on-accent);
    box-shadow: 0 0 8px var(--btn-primary-glow);
  }

  .helptip-popover {
    position: absolute;
    z-index: 100;
    background: var(--bg-popover);
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-shadow: var(--card-shadow);
    padding: 0.85rem 1rem;
    animation: popIn 0.15s ease;
    box-sizing: border-box;
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (min-width: 641px) {
    .helptip-popover {
      right: calc(100% + 12px);
      top: -8px;
      width: min(320px, calc(100vw - 24px));
    }
  }

  @media (max-width: 640px) {
    .helptip-popover {
      right: 0;
      top: calc(100% + 8px);
      width: min(320px, calc(100vw - 24px));
    }
  }

  .helptip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0.35rem;
  }

  .helptip-title {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .helptip-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  .helptip-close-btn:hover {
    color: var(--text-primary);
  }

  .helptip-close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .helptip-content {
    font-size: 0.785rem;
    color: var(--text-secondary);
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  :global(.helptip-content p) {
    margin: 0;
  }

  :global(.helptip-content a) {
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: fit-content;
    transition: color 0.15s ease;
  }

  :global(.helptip-content a:hover) {
    color: var(--accent);
  }
</style>
