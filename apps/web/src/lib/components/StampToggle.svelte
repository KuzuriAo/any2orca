<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { stampStore } from "../stampState.svelte";
  import HelpTip from "./HelpTip.svelte";

  let {
    compact = true,
  }: {
    compact?: boolean;
  } = $props();
</script>

<div class="stamp-wrapper" class:is-compact={compact}>
  <div class="stamp-control-row">
    <label for="stamp-toggle" class="stamp-label-row">
      <input
        type="checkbox"
        id="stamp-toggle"
        data-testid="stamp-toggle"
        checked={stampStore.enabled}
        onchange={(e) => stampStore.setEnabled(e.currentTarget.checked)}
        class="stamp-checkbox"
      />
      <span class="stamp-label-text">Add a version note to the file</span>
    </label>
    <HelpTip
      id="stamp"
      title="Add a version note to the file"
      testId="helptip-btn-stamp"
    >
      <p>
        A small note saying which any2orca version and settings made the file. Paste it into a bug report to show how it was made, without sharing your model. It holds nothing about you or your model.
      </p>
      <a
        href="https://github.com/KuzuriAo/any2orca/blob/main/docs/output-stamp.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        What's in it?
      </a>
    </HelpTip>
  </div>
</div>

<style>
  .stamp-wrapper {
    display: flex;
    flex-direction: column;
    padding: 0.95rem 1.15rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .stamp-wrapper.is-compact {
    padding: 0.65rem 0.85rem;
  }

  .stamp-control-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .stamp-label-row {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 44px;
    cursor: pointer;
    user-select: none;
  }

  .stamp-checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--accent);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .stamp-checkbox:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .stamp-label-text {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .is-compact .stamp-label-text {
    font-size: 0.82rem;
  }
</style>
