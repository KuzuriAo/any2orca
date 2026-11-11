<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    FAQ_GROUPS,
    type FaqGroup,
    type FaqItem,
    getFaqGroupId,
    getFaqItems,
    getStarterFaqItems,
  } from "../faq";

  let {
    mode = "starter",
  }: {
    mode?: "starter" | "page";
  } = $props();

  const allFaqItems = $derived(getFaqItems());
  const starterFaqItems = $derived(getStarterFaqItems());
  const faqItems = $derived(mode === "page" ? allFaqItems : starterFaqItems);

  let jsEnabled = $state(false);
  let activeGroup = $state<FaqGroup>(FAQ_GROUPS[0]);
  let filterQuery = $state("");
  let savedOpenIdsBeforeFilter: Set<string> | null = null;

  function initialOpenIds(): Set<string> {
    const ids = new Set<string>();
    if (typeof window !== "undefined" && window.location.hash.length > 1) {
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      const items = mode === "page" ? getFaqItems() : getStarterFaqItems();
      if (items.some((i) => i.id === targetId)) {
        ids.add(targetId);
      }
    }
    return ids;
  }

  let openIds = $state<Set<string>>(initialOpenIds());

  function htmlToPlainText(html: string): string {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return doc.body.textContent ?? "";
    }
    return html;
  }

  const plainTextById = $derived.by(() => {
    const map = new Map<string, string>();
    for (const item of allFaqItems) {
      map.set(item.id, htmlToPlainText(item.answerHtml).toLowerCase());
    }
    return map;
  });

  function itemMatchesQuery(item: FaqItem, normalizedQuery: string): boolean {
    if (!normalizedQuery) return true;
    if (item.question.toLowerCase().includes(normalizedQuery)) return true;
    const answerText = plainTextById.get(item.id) ?? htmlToPlainText(item.answerHtml).toLowerCase();
    return answerText.includes(normalizedQuery);
  }

  const normalizedFilter = $derived(filterQuery.trim().slice(0, 100).toLowerCase());
  const isFiltering = $derived(normalizedFilter.length > 0);

  const matchingItems = $derived(
    isFiltering
      ? allFaqItems.filter((item) => itemMatchesQuery(item, normalizedFilter))
      : allFaqItems,
  );

  const allVisibleOpen = $derived(
    matchingItems.length > 0 && matchingItems.every((item) => openIds.has(item.id)),
  );

  function handleFilterInput(rawValue: string) {
    const capped = rawValue.slice(0, 100);
    const wasFiltering = filterQuery.trim().length > 0;
    const nextTrimmed = capped.trim().toLowerCase();
    const nowFiltering = nextTrimmed.length > 0;

    if (!wasFiltering && nowFiltering) {
      savedOpenIdsBeforeFilter = new Set(openIds);
    }

    filterQuery = capped;

    if (nowFiltering) {
      const matched = allFaqItems.filter((item) => itemMatchesQuery(item, nextTrimmed));
      openIds = new Set(matched.map((item) => item.id));
    } else if (wasFiltering && !nowFiltering) {
      openIds = savedOpenIdsBeforeFilter ? new Set(savedOpenIdsBeforeFilter) : new Set();
      savedOpenIdsBeforeFilter = null;
    }
  }

  function clearFilter() {
    handleFilterInput("");
  }

  function toggleItem(id: string) {
    const next = new Set(openIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    openIds = next;
  }

  function toggleExpandAll() {
    if (allVisibleOpen) {
      const next = new Set(openIds);
      for (const item of matchingItems) {
        next.delete(item.id);
      }
      openIds = next;
    } else {
      const next = new Set(openIds);
      for (const item of matchingItems) {
        next.add(item.id);
      }
      openIds = next;
    }
  }

  function handleAnchorClick(e: MouseEvent, id: string) {
    if (typeof window === "undefined") return;
    e.preventDefault();
    const fullUrl = `${window.location.origin}${window.location.pathname}#${id}`;
    navigator.clipboard?.writeText?.(fullUrl).catch(() => {});
    if (window.location.hash !== `#${id}`) {
      window.location.hash = id;
    } else {
      const next = new Set(openIds);
      next.add(id);
      openIds = next;
    }
  }

  function handleGroupClick(e: MouseEvent, group: FaqGroup) {
    activeGroup = group;
    const groupId = getFaqGroupId(group);
    const el = typeof document !== "undefined" ? document.getElementById(groupId) : null;
    if (el) {
      e.preventDefault();
      history.replaceState(null, "", `#${groupId}`);
      el.scrollIntoView?.({ block: "start" });
    }
  }

  onMount(() => {
    jsEnabled = true;
  });

  $effect(() => {
    if (typeof window === "undefined" || mode !== "page") return;
    function applyHash(scroll: boolean) {
      if (window.location.hash.length <= 1) return;
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      const targetItem = allFaqItems.find((i) => i.id === targetId);
      if (targetItem) {
        if (filterQuery.trim().length > 0) {
          const q = filterQuery.trim().toLowerCase();
          if (!itemMatchesQuery(targetItem, q)) {
            const restored = savedOpenIdsBeforeFilter
              ? new Set(savedOpenIdsBeforeFilter)
              : new Set<string>();
            restored.add(targetId);
            filterQuery = "";
            savedOpenIdsBeforeFilter = null;
            openIds = restored;
          } else if (!openIds.has(targetId)) {
            const next = new Set(openIds);
            next.add(targetId);
            openIds = next;
          }
        } else if (!openIds.has(targetId)) {
          const next = new Set(openIds);
          next.add(targetId);
          openIds = next;
        }
        activeGroup = targetItem.group;
        if (scroll) {
          requestAnimationFrame(() => {
            const el = document.getElementById(targetId);
            el?.scrollIntoView?.({ block: "start" });
          });
        }
        return;
      }

      const matchedGroup = FAQ_GROUPS.find((g) => getFaqGroupId(g) === targetId);
      if (matchedGroup) {
        activeGroup = matchedGroup;
        if (scroll) {
          requestAnimationFrame(() => {
            const el = document.getElementById(targetId);
            el?.scrollIntoView?.({ block: "start" });
          });
        }
      }
    }
    applyHash(true);
    const onHashChange = () => applyHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });

  $effect(() => {
    if (typeof window === "undefined" || mode !== "page") return;
    function updateActiveGroupOnScroll() {
      let current: FaqGroup = FAQ_GROUPS[0];
      for (const group of FAQ_GROUPS) {
        const el = document.getElementById(getFaqGroupId(group));
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 160) {
          current = group;
        }
      }
      activeGroup = current;
    }
    window.addEventListener("scroll", updateActiveGroupOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveGroupOnScroll);
  });
</script>

{#if mode === "starter"}
  <section id="faq" class="faq-starter-section" aria-labelledby="faq-heading">
    <div class="faq-starter-header">
      <h2 id="faq-heading" class="faq-starter-title">Common questions</h2>
      <a href="/faq" class="faq-all-questions-link" data-testid="faq-all-questions">
        <span>All {allFaqItems.length} questions</span>
        <span aria-hidden="true">→</span>
      </a>
    </div>

    <div class="faq-group-card faq-starter-card">
      {#each faqItems as item (item.id)}
        <div id={item.id} class="faq-item faq-starter-item">
          <a
            href={`/faq#${item.id}`}
            class="faq-starter-link"
            id={`faq-question-${item.id}`}
          >
            <span class="faq-question-text">{item.question}</span>
            <span class="faq-starter-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      {/each}
    </div>
  </section>
{:else}
  <section id="faq" class="faq-page-section" aria-labelledby="faq-heading" tabindex="-1">
    <div class="faq-header">
      <a href="/" class="faq-back-link" data-testid="faq-back-link">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to converter</span>
      </a>
      <h1 id="faq-heading" class="faq-title">Frequently Asked Questions</h1>
      <p class="faq-subtitle">
        Answers on local in-browser conversion, bed centering, nozzle sizes, and Snapmaker Space compatibility.
      </p>

      {#if jsEnabled}
        <div class="faq-filter-wrapper">
          <div class="faq-filter-box">
            <svg class="faq-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="search"
              class="faq-filter-input"
              data-testid="faq-filter-input"
              aria-label="Search questions"
              maxlength="100"
              placeholder="Search questions (e.g. nozzle size, PrusaSlicer, presets, privacy)..."
              value={filterQuery}
              oninput={(e) => handleFilterInput((e.currentTarget as HTMLInputElement).value)}
            />
            {#if filterQuery.length > 0}
              <button
                type="button"
                class="faq-filter-clear"
                data-testid="faq-filter-clear"
                aria-label="Clear search"
                onclick={clearFilter}
              >
                Clear
              </button>
            {/if}
          </div>
          <div class="sr-only" aria-live="polite" data-testid="faq-filter-status">
            {#if isFiltering}
              {matchingItems.length === 0
                ? "No matching questions"
                : `${matchingItems.length} matching ${matchingItems.length === 1 ? "question" : "questions"}`}
            {:else}
              {allFaqItems.length} questions
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="faq-layout">
      <nav class="faq-rail" aria-label="Question categories" data-testid="faq-rail">
        <ul class="faq-rail-list">
          {#each FAQ_GROUPS as group (group)}
            {@const groupId = getFaqGroupId(group)}
            {@const count = matchingItems.filter((item) => item.group === group).length}
            <li class="faq-rail-item">
              <a
                href={`#${groupId}`}
                class="faq-rail-link"
                class:is-active={activeGroup === group}
                aria-current={activeGroup === group ? "location" : undefined}
                data-testid={`faq-rail-link-${groupId}`}
                onclick={(e) => handleGroupClick(e, group)}
              >
                <span class="faq-rail-label">{group}</span>
                <span class="faq-rail-count" data-testid={`faq-rail-count-${groupId}`}>{count}</span>
              </a>
            </li>
          {/each}
        </ul>

        {#if jsEnabled && matchingItems.length > 0}
          <button
            type="button"
            class="faq-expand-all-btn"
            data-testid="faq-expand-all"
            onclick={toggleExpandAll}
          >
            {allVisibleOpen ? "Collapse all" : "Expand all"}
          </button>
        {/if}
      </nav>

      <div class="faq-reading-column" data-testid="faq-reading-column">
        {#if matchingItems.length === 0}
          <div class="faq-empty-state" data-testid="faq-filter-empty">
            <p class="faq-empty-text">No matching questions</p>
            <button
              type="button"
              class="btn btn-secondary faq-empty-clear-btn"
              data-testid="faq-filter-empty-clear"
              onclick={clearFilter}
            >
              Clear
            </button>
          </div>
        {:else}
          {#each FAQ_GROUPS as group (group)}
            {@const groupId = getFaqGroupId(group)}
            {@const groupItems = matchingItems.filter((item) => item.group === group)}
            {#if groupItems.length > 0}
              <div class="faq-group-section" id={groupId} data-testid={`faq-group-section-${groupId}`}>
                <h2 class="faq-group-title">{group}</h2>
                <div class="faq-group-card">
                  {#each groupItems as item (item.id)}
                    {@const isOpen = openIds.has(item.id)}
                    <div id={item.id} class="faq-item" class:is-open={isOpen}>
                      <div class="faq-item-header">
                        <button
                          type="button"
                          class="faq-trigger"
                          onclick={() => toggleItem(item.id)}
                          aria-expanded={isOpen}
                          aria-controls={`faq-answer-${item.id}`}
                          id={`faq-question-${item.id}`}
                        >
                          <span class="faq-question-text">{item.question}</span>
                          <span class="faq-chevron" class:rotated={isOpen} aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </span>
                        </button>
                        <a
                          href={`#${item.id}`}
                          class="faq-anchor-link"
                          aria-label="Link to this question"
                          title="Link to this question"
                          data-testid={`faq-anchor-${item.id}`}
                          onclick={(e) => handleAnchorClick(e, item.id)}
                        >
                          #
                        </a>
                      </div>

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
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Starter section on home page (/) */
  .faq-starter-section {
    width: 100%;
    max-width: 1040px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .faq-starter-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .faq-starter-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .faq-all-questions-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--accent-strong);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .faq-all-questions-link:hover {
    color: var(--text-primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .faq-all-questions-link:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .faq-starter-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.95rem 1.25rem;
    color: var(--text-primary);
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.4;
    box-sizing: border-box;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .faq-starter-link:hover {
    background-color: var(--bg-card-hover);
    color: var(--accent-strong);
  }

  .faq-starter-link:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: -2px;
  }

  .faq-starter-arrow {
    color: var(--text-muted);
    font-weight: 600;
    flex-shrink: 0;
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .faq-starter-link:hover .faq-starter-arrow {
    color: var(--accent-strong);
    transform: translateX(2px);
  }

  /* /faq page section */
  .faq-page-section {
    width: 100%;
    max-width: 1040px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    outline: none;
  }

  .faq-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .faq-back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent-strong);
    text-decoration: none;
    margin-bottom: 0.15rem;
  }

  .faq-back-link:hover {
    text-decoration: underline;
  }

  .faq-back-link:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .faq-title {
    font-size: 1.85rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .faq-subtitle {
    font-size: 0.95rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .faq-filter-wrapper {
    width: 100%;
    max-width: 560px;
    margin-top: 0.35rem;
  }

  .faq-filter-box {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.55rem 0.85rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .faq-filter-box:focus-within {
    border-color: var(--accent-strong);
    box-shadow: 0 0 0 2px var(--btn-primary-glow);
  }

  .faq-filter-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .faq-filter-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    line-height: 1.4;
    outline: none;
  }

  .faq-filter-input::placeholder {
    color: var(--text-muted);
  }

  .faq-filter-clear {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .faq-filter-clear:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
  }

  .faq-filter-clear:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  /* Two-column layout on desktop (> 860px), stacked with pills on <= 860px */
  .faq-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 760px);
    gap: 2.5rem;
    align-items: start;
    justify-content: space-between;
    width: 100%;
  }

  .faq-rail {
    position: sticky;
    top: 5.5rem;
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .faq-rail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .faq-rail-item {
    margin: 0;
  }

  .faq-rail-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.86rem;
    font-weight: 600;
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .faq-rail-link:hover {
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .faq-rail-link.is-active {
    background: var(--bg-card);
    border-color: var(--border-subtle);
    color: var(--accent-strong);
  }

  .faq-rail-link:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .faq-rail-count {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .faq-rail-link.is-active .faq-rail-count {
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
  }

  .faq-expand-all-btn {
    align-self: flex-start;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  }

  .faq-expand-all-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
  }

  .faq-expand-all-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .faq-reading-column {
    width: 100%;
    max-width: 760px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    box-sizing: border-box;
  }

  .faq-group-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    scroll-margin-top: 5.5rem;
  }

  .faq-group-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    padding: 0 0.15rem;
    letter-spacing: -0.01em;
  }

  /* One card per group, hairline dividers between questions */
  .faq-group-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .faq-item {
    scroll-margin-top: 5.5rem;
    display: flex;
    flex-direction: column;
  }

  .faq-item + .faq-item {
    border-top: 1px solid var(--border-subtle);
  }

  .faq-item-header {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
  }

  .faq-trigger {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0.5rem 1rem 1.25rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
    transition: color 0.15s ease;
  }

  .faq-trigger:hover {
    color: var(--accent-strong);
  }

  .faq-trigger:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .faq-question-text {
    font-size: 0.96rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .faq-chevron {
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.2s ease, color 0.15s ease;
  }

  .faq-chevron.rotated {
    transform: rotate(180deg);
    color: var(--accent-strong);
  }

  .faq-anchor-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.9rem 0 0.4rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .faq-anchor-link:hover {
    color: var(--accent-strong);
  }

  .faq-anchor-link:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .faq-content {
    padding: 0 1.25rem 1.2rem;
  }

  .faq-content-inner {
    max-width: 68ch;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.65;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .faq-content-inner :global(p) {
    margin: 0;
  }

  .faq-content-inner :global(strong) {
    color: var(--text-primary);
    font-weight: 600;
  }

  .faq-content-inner :global(a) {
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .faq-content-inner :global(a:hover) {
    color: var(--text-primary);
  }

  .faq-content-inner :global(ul),
  .faq-content-inner :global(ol) {
    margin: 0;
    padding-left: 1.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .faq-content-inner :global(code) {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    padding: 0.12rem 0.35rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--accent-strong);
  }

  .faq-empty-state {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
    text-align: center;
  }

  .faq-empty-text {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  @media (max-width: 860px) {
    .faq-layout {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .faq-rail {
      position: static;
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .faq-rail-list {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .faq-rail-link {
      padding: 0.4rem 0.7rem;
      border-radius: var(--radius-pill);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      font-size: 0.82rem;
    }

    .faq-rail-link.is-active {
      border-color: var(--accent-strong);
    }

    .faq-title {
      font-size: 1.5rem;
    }

    .faq-trigger {
      padding: 0.9rem 0.35rem 0.9rem 1rem;
    }

    .faq-content {
      padding: 0 1rem 1rem;
    }
  }
</style>
