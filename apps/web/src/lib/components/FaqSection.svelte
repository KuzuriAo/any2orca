<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { getFaqItems } from "../faq";

  let openIndex = $state<number | null>(0); // Open first item by default

  function toggleItem(index: number) {
    openIndex = openIndex === index ? null : index;
  }

  const faqItems = getFaqItems();
</script>

<section id="faq" class="faq-container glass-card" aria-labelledby="faq-heading">
  <div class="faq-header">
    <div class="faq-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span>Help & Knowledge Base</span>
    </div>
    <h2 id="faq-heading" class="faq-title">Frequently Asked Questions</h2>
    <p class="faq-subtitle">
      Everything you need to know about local in-browser conversion, bed centering, and Snapmaker Space compatibility.
    </p>
  </div>

  <div class="faq-accordion">
    {#each faqItems as item, index (item.id)}
      {@const isOpen = openIndex === index}
      <div class="faq-item" class:is-open={isOpen}>
        <button
          type="button"
          class="faq-trigger"
          onclick={() => toggleItem(index)}
          aria-expanded={isOpen}
          aria-controls={`faq-answer-${item.id}`}
          id={`faq-question-${item.id}`}
        >
          <div class="faq-question-group">
            <span class="faq-question-text">{item.question}</span>
            <span class="badge" class:badge-emerald={item.badgeType === 'emerald'} class:badge-violet={item.badgeType === 'amethyst' || item.badgeType === 'violet'}>
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
    {/each}
  </div>
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
  }

  .faq-subtitle {
    font-size: 0.92rem;
    color: var(--text-secondary);
    max-width: 620px;
    line-height: 1.5;
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
    transition: transform 0.25s ease;
    flex-shrink: 0;
  }

  .faq-chevron.rotated {
    transform: rotate(180deg);
  }

  .faq-content {
    border-top: 1px solid var(--border-subtle);
    padding: 1.15rem 1.35rem 1.35rem;
    background: var(--bg-input);
    animation: fadeIn 0.2s ease;
  }

  .faq-content-inner {
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  :global(.faq-content-inner p) {
    margin: 0;
    color: var(--text-secondary);
  }

  :global(.faq-content-inner strong) {
    color: var(--text-primary);
  }

  :global(.faq-content-inner p strong),
  :global(.faq-content-inner li strong) {
    color: var(--text-primary);
  }

  :global(.faq-content-inner code) {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    background: var(--badge-accent-bg);
    color: var(--code-text, var(--accent-strong));
    padding: 0.15rem 0.35rem;
    border-radius: var(--radius-sm);
  }

  :global(.faq-content-inner ul),
  :global(.faq-content-inner ol) {
    margin: 0.25rem 0 0.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  :global(.faq-content-inner li) {
    color: var(--text-secondary);
  }

  :global(.faq-content-inner .verify-tip) {
    padding: 0.65rem 0.85rem;
    border-radius: var(--radius-sm);
    background: var(--success-glow);
    border: 1px solid var(--success-glow);
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  :global(.faq-content-inner .verify-tip em) {
    color: var(--text-secondary);
  }

  :global(.faq-content-inner .verify-tip strong) {
    color: var(--text-secondary);
  }

  :global(.faq-content-inner .verify-tip code) {
    color: var(--code-text, var(--accent-strong));
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 640px) {
    .faq-container {
      padding: 1.5rem 1rem;
    }

    .faq-trigger {
      padding: 1rem;
    }

    .faq-question-text {
      font-size: 0.92rem;
    }
  }
</style>
