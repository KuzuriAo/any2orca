<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  let { onDismiss }: { onDismiss: () => void } = $props();
</script>

<aside class="migration-notice" aria-label="bambu2orca migration notice" data-testid="b2o-notice">
  <div class="notice-icon" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  </div>
  <div class="notice-body">
    <span class="notice-text">
      bambu2orca is now any2orca. Same converter, now running entirely on your device: no account, no limits.
    </span>
    <a
      href="https://github.com/KuzuriAo/any2orca#readme"
      target="_blank"
      rel="noopener noreferrer"
      class="notice-link"
    >
      What changed
    </a>
  </div>
  <button
    type="button"
    class="notice-dismiss-btn"
    onclick={onDismiss}
    aria-label="Dismiss notice"
    data-testid="b2o-notice-dismiss"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
</aside>

<style>
  .migration-notice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 10px var(--btn-primary-glow);
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .notice-icon {
    color: var(--accent-strong);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .notice-body {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    flex-wrap: wrap;
    line-height: 1.4;
  }

  .notice-text {
    color: var(--text-primary);
  }

  .notice-link {
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  .notice-link:hover {
    filter: brightness(1.2);
  }

  .notice-dismiss-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .notice-dismiss-btn:hover {
    color: var(--text-primary);
    background: var(--border-subtle);
  }
</style>
