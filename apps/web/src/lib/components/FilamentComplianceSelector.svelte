<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import HelpTip from "./HelpTip.svelte";
  import {
    FILAMENT_COMPLIANCE_HELP,
    FILAMENT_COMPLIANCE_OPTIONS,
    POLYMAKER_DISABLED_REASON,
    type ComplianceMode,
  } from "../filamentComplianceCopy";

  let {
    mode = null,
    onChange,
    notes = null,
    compact = false,
    polymakerSupported = true,
  }: {
    mode: ComplianceMode;
    onChange: (mode: ComplianceMode) => void;
    notes?: string[] | null;
    compact?: boolean;
    polymakerSupported?: boolean;
  } = $props();

  const options = FILAMENT_COMPLIANCE_OPTIONS;

  let selectedId = $derived.by(() => {
    if (mode === "snapmaker") return "snapmaker";
    if (mode === "polymaker") return "polymaker";
    if (mode === "generic") return "generic";
    return "original";
  });
</script>

<div class="compliance-wrapper" class:is-compact={compact} class:has-override={mode !== null}>
  <div class="compliance-header">
    <div class="title-group">
      <span class="compliance-title">Filament</span>
      <HelpTip
        id="filament"
        title="Filament"
        testId="helptip-btn-filament"
      >
        <p>
          {FILAMENT_COMPLIANCE_HELP}
        </p>
        <a href="/faq#compliance-mode">More in the FAQ</a>
      </HelpTip>
    </div>
    {#if mode === "snapmaker"}
      <span class="badge badge-subtle badge-snapmaker">Snapmaker Space</span>
    {/if}
  </div>

  <div class="segment-group" role="radiogroup" aria-label="Filament brand preset compliance">
    {#each options as opt (opt.id)}
      {@const isActive = selectedId === opt.id}
      {@const isDisabled = opt.id === "polymaker" && !polymakerSupported}
      <button
        type="button"
        data-testid={`filament-mode-${opt.id}`}
        class="segment-btn"
        class:is-active={isActive}
        class:is-disabled={isDisabled}
        disabled={isDisabled}
        onclick={() => !isDisabled && onChange(opt.value)}
        role="radio"
        aria-checked={isActive}
        title={isDisabled ? POLYMAKER_DISABLED_REASON : opt.tooltip}
      >
        <div class="segment-label-row">
          <span class="segment-radio-dot"></span>
          <span class="segment-label">{opt.label}</span>
          {#if opt.badge && !compact}
            <span class="mini-tag">{opt.badge}</span>
          {/if}
        </div>
        {#if !compact}
          <span class="segment-desc">{opt.description}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if !polymakerSupported}
    <p class="unsupported-hint" data-testid="polymaker-disabled-reason">{POLYMAKER_DISABLED_REASON}</p>
  {/if}

  {#if notes && notes.length > 0}
    <div class="fallback-alert" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div class="fallback-alert-content">
        {#each notes as note}
          <div>{note}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .compliance-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.95rem 1.15rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .compliance-wrapper.has-override {
    border-color: var(--accent);
    box-shadow: 0 4px 18px -4px var(--btn-primary-glow);
  }

  .compliance-wrapper.is-compact {
    padding: 0.65rem 0.85rem;
    gap: 0.5rem;
  }

  .compliance-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: nowrap;
    width: 100%;
  }

  .title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .compliance-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .badge-subtle {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.18rem 0.55rem;
    border-radius: var(--radius-sm);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.01em;
  }

  .segment-group {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .is-compact .segment-group {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }

  @media (max-width: 900px) {
    .segment-group {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 520px) {
    .segment-group:not(.is-compact .segment-group) {
      grid-template-columns: 1fr;
    }
  }

  .segment-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    color: var(--text-secondary);
  }

  .is-compact .segment-btn {
    padding: 0.45rem 0.55rem;
    align-items: flex-start;
  }

  .segment-btn:hover:not(.is-active):not(:disabled) {
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
    color: var(--text-primary);
  }

  .segment-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .segment-btn.is-active {
    background: var(--bg-card-hover);
    border-color: var(--accent-strong);
    color: var(--text-primary);
    box-shadow: 0 0 0 1px var(--accent-strong);
  }

  .segment-btn:disabled,
  .segment-btn.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .segment-label-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    flex-wrap: wrap;
  }

  .segment-radio-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid var(--text-muted);
    flex-shrink: 0;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }

  .segment-btn.is-active .segment-radio-dot {
    border-color: var(--accent-strong);
    background: var(--accent-strong);
    box-shadow: inset 0 0 0 2px var(--bg-card);
  }

  .segment-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: inherit;
    white-space: nowrap;
  }

  .mini-tag {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.08rem 0.35rem;
    border-radius: var(--radius-sm);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
    white-space: nowrap;
  }

  .segment-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .segment-btn.is-active .segment-desc {
    color: var(--text-secondary);
  }

  .unsupported-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .fallback-alert {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    padding: 0.55rem 0.7rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-left: 3px solid var(--warning);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .fallback-alert svg {
    color: var(--warning);
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  .fallback-alert-content {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
</style>
