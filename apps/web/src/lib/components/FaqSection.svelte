<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { FAQ_GROUPS, getFaqItems, getStarterFaqItems } from "../faq";

  let {
    mode = "starter",
  }: {
    mode?: "starter" | "page";
  } = $props();

  const faqItems = $derived(mode === "page" ? getFaqItems() : getStarterFaqItems());

  function initialOpenIds(): Set<string> {
    const items = mode === "page" ? getFaqItems() : getStarterFaqItems();
    const ids = new Set<string>();
    if (items.length > 0) {
      ids.add(items[0].id);
    }
    if (typeof window !== "undefined" && window.location.hash.length > 1) {
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      if (items.some((i) => i.id === targetId)) {
        ids.add(targetId);
      }
    }
    return ids;
  }

  let openIds = $state<Set<string>>(initialOpenIds());

  function toggleItem(id: string) {
    const next = new Set(openIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    openIds = next;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    function applyHash(scroll: boolean) {
      if (window.location.hash.length <= 1) return;
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      if (faqItems.some((i) => i.id === targetId)) {
        if (!openIds.has(targetId)) {
          const next = new Set(openIds);
          next.add(targetId);
          openIds = next;
        }
        if (scroll) {
          const el = document.getElementById(targetId);
          el?.scrollIntoView?.({ block: "start" });
        }
      }
    }
    applyHash(true);
    const onHashChange = () => applyHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });
</script>

{#snippet faqItemCard(item: (typeof faqItems)[number])}
  {@const isOpen = openIds.has(item.id)}
  <div id={item.id} class="faq-item" class:is-open={isOpen}>
    <button
      type="button"
      class="faq-trigger"
      onclick={() => toggleItem(item.id)}
      aria-expanded={isOpen}
      aria-controls={`faq-answer-${item.id}`}
      id={`faq-question-${item.id}`}
    >
      <div class="faq-question-group">
        <span class="faq-question-text">{item.question}</span>
        <span
          class="badge"
          class:badge-emerald={item.badgeType === "emerald"}
          class:badge-violet={item.badgeType === "amethyst" || item.badgeType === "violet"}
        >
          {item.badge}
        </span>
      </div>
      <div class="faq-chevron" class:rotated={isOpen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </button>

    {#if isOpen}
      <div
        class="faq-content"
        id={`faq-answer-${item.id}`}
        role="region"
        aria-labelledby={`faq-question-${item.id}`}
      >
        <div class="faq-content-inner">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html item.answerHtml}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<section id="faq" class="faq-container glass-card" aria-labelledby="faq-heading">
  <div class="faq-header">
    {#if mode === "page"}
      <a href="/" class="faq-back-link" data-testid="faq-back-link">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to converter</span>
      </a>
    {/if}
    <div class="faq-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span>Help & Knowledge Base</span>
    </div>
    {#if mode === "page"}
      <h1 id="faq-heading" class="faq-title">Frequently Asked Questions</h1>
    {:else}
      <h2 id="faq-heading" class="faq-title">Frequently Asked Questions</h2>
    {/if}
    <p class="faq-subtitle">
      Everything you need to know about local in-browser conversion, bed centering, and Snapmaker Space compatibility.
    </p>
  </div>

  {#if mode === "page"}
    <div class="faq-groups">
      {#each FAQ_GROUPS as group (group)}
        {@const groupItems = faqItems.filter((item) => item.group === group)}
        {#if groupItems.length > 0}
          <div class="faq-group" data-testid={`faq-group-${group}`}>
            <h2 class="faq-group-title">{group}</h2>
            <div class="faq-accordion">
              {#each groupItems as item (item.id)}
                {@render faqItemCard(item)}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="faq-accordion">
      {#each faqItems as item (item.id)}
        {@render faqItemCard(item)}
      {/each}
    </div>
    <div class="faq-footer">
      <a href="/faq" class="faq-all-link" data-testid="faq-all-questions">
        <span>All questions</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </a>
    </div>
  {/if}
</section>

<style>
  .faq-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    padding: 2.25rem 2rem;
    scroll-margin-top: 2rem;
  }

  .faq-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
  }

  .faq-back-link {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent-strong);
    text-decoration: none;
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .faq-back-link:hover {
    border-color: var(--border-focus);
    color: var(--text-primary);
  }

  .faq-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-pill);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .faq-title {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: var(--letter-spacing-heading);
    margin: 0;
  }

  .faq-subtitle {
    font-size: 0.92rem;
    color: var(--text-secondary);
    max-width: 620px;
    line-height: 1.5;
  }

  .faq-groups {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .faq-group {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .faq-group-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: var(--letter-spacing-heading);
    margin: 0;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .faq-accordion {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .faq-item {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: all 0.2s ease;
    scroll-margin-top: 1.5rem;
  }

  .faq-item:hover {
    border-color: var(--border-focus);
  }

  .faq-item.is-open {
    border-color: var(--accent);
    background: var(--bg-card-hover);
    box-shadow: var(--card-shadow);
  }

  .faq-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem 1.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
    font-family: var(--font-sans);
  }

  .faq-question-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .faq-question-text {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .faq-chevron {
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .faq-chevron.rotated {
    transform: rotate(180deg);
  }

  .faq-content {
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-surface);
  }

  .faq-content-inner {
    padding: 1.25rem 1.5rem;
    font-size: 0.92rem;
    color: var(--text-secondary);
    line-height: 1.65;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .faq-content-inner :global(p) {
    margin: 0;
  }

  .faq-content-inner :global(strong) {
    color: var(--text-primary);
    font-weight: 600;
  }

  .faq-content-inner :global(code) {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    padding: 0.15rem 0.4rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--accent-strong);
  }

  .faq-content-inner :global(ul),
  .faq-content-inner :global(ol) {
    margin: 0;
    padding-left: 1.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .faq-content-inner :global(.verify-tip) {
    padding: 0.75rem 1rem;
    background: var(--badge-accent-bg);
    border-left: 3px solid var(--accent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    font-size: 0.85rem;
  }

  .faq-footer {
    display: flex;
    justify-content: center;
    padding-top: 0.25rem;
  }

  .faq-all-link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.6rem 1.25rem;
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--accent-strong);
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .faq-all-link:hover {
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
    color: var(--text-primary);
  }

  @media (max-width: 640px) {
    .faq-container {
      padding: 1.5rem 1.15rem;
    }

    .faq-title {
      font-size: 1.3rem;
    }

    .faq-trigger {
      padding: 0.95rem 1rem;
    }

    .faq-question-text {
      font-size: 0.92rem;
    }

    .faq-content-inner {
      padding: 1rem 1.1rem;
      font-size: 0.86rem;
    }
  }
</style>
