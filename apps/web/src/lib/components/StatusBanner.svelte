<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { ConvertNote } from "any2orca";
  import { resolveWarningEntries } from "../warningFilaments";
  import { formatLayerHeightMm } from "../layerHeight";
  import CopyReportButton from "./CopyReportButton.svelte";

  let {
    errorMessage = null,
    errorCode = null,
    warnings = [],
    notes = null,
    filaments = [],
    problemReport = null,
    onDismissError,
    onSelectFilamentSlot,
    suggestedLayerHeight = null,
    onSelectLayerHeight,
  }: {
    errorMessage: string | null;
    errorCode: string | null;
    warnings: string[];
    notes?: readonly ConvertNote[] | null;
    filaments?: readonly { color?: string }[];
    /** The text to offer for a bug report, when there is one for this error. */
    problemReport?: string | null;
    onDismissError?: () => void;
    onSelectFilamentSlot?: (slot: number) => void;
    suggestedLayerHeight?: number | null;
    onSelectLayerHeight?: (height: number | null) => void;
  } = $props();

  let showWarnings = $state(true);

  const warningEntries = $derived(resolveWarningEntries(warnings, notes, filaments));
</script>

{#if errorMessage}
  <div class="alert-box alert-error" role="alert" data-testid="status-error">
    <div class="alert-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="alert-content">
      <div class="alert-title">Conversion Error</div>
      <p class="alert-desc">{errorMessage}</p>
      {#if errorCode === "too_large"}
        <p class="alert-hint">
          The any2orca command line can convert larger projects: <code>any2orca convert &lt;file&gt; --max-unpacked 4GB</code>.
        </p>
      {/if}
      <div class="alert-actions">
        <a
          href="https://github.com/KuzuriAo/any2orca/issues/new?template=bug_report.yml"
          target="_blank"
          rel="noopener noreferrer"
          class="alert-link"
        >
          Report a problem
        </a>
        {#if problemReport}
          <CopyReportButton report={problemReport} testid="copy-report-error" />
        {/if}
      </div>
    </div>
    {#if onDismissError}
      <button class="alert-dismiss" onclick={onDismissError} aria-label="Dismiss error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/if}
  </div>
{/if}

{#if warningEntries.length > 0 && showWarnings}
  <div class="alert-box alert-warning" data-testid="status-warning">
    <div class="alert-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    </div>
    <div class="alert-content">
      <div class="alert-title">Conversion Notes ({warningEntries.length})</div>
      <ul class="warning-list">
        {#each warningEntries as entry}
          <li class="warning-item">
            <span class="warning-text">{entry.text}</span>
            {#if entry.chips.length > 0}
              <ul class="warning-filaments" aria-label="Named filaments" data-testid="warning-filaments">
                {#each entry.chips as chip (chip.slot)}
                  <li class="warning-filament">
                    {#if onSelectFilamentSlot}
                      <button
                        type="button"
                        class="warning-filament-btn"
                        onclick={() => onSelectFilamentSlot(chip.slot)}
                        title={`View specs for Filament ${chip.slot}`}
                      >
                        <span class="warning-filament-dot" style="background-color: {chip.color};" aria-hidden="true"></span>
                        <span class="warning-filament-slot"><span class="sr-only">{"filament "}</span>{chip.slot}</span>
                      </button>
                    {:else}
                      <span class="warning-filament-pill">
                        <span class="warning-filament-dot" style="background-color: {chip.color};" aria-hidden="true"></span>
                        <span class="warning-filament-slot"><span class="sr-only">{"filament "}</span>{chip.slot}</span>
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
      {#if suggestedLayerHeight !== null && onSelectLayerHeight}
        <div class="warning-layer-action" data-testid="layer-height-banner-action">
          <span class="warning-layer-label">Use one supported height for every layer:</span>
          <button
            type="button"
            class="warning-layer-btn"
            data-testid="apply-nearest-layer-height"
            onclick={() => onSelectLayerHeight(suggestedLayerHeight)}
          >
            Use {formatLayerHeightMm(suggestedLayerHeight)} for every layer
          </button>
        </div>
      {/if}
    </div>
    <button class="alert-dismiss" onclick={() => (showWarnings = false)} aria-label="Dismiss notes">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
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

  .alert-box {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 1rem 1.25rem;
    border-radius: var(--radius-md);
    margin-bottom: 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
  }

  .alert-error {
    border-color: var(--danger);
    color: var(--text-primary);
  }

  .alert-error .alert-title {
    color: var(--danger);
  }

  .alert-error .alert-icon {
    color: var(--danger);
  }

  .alert-warning {
    border-color: var(--warning);
    color: var(--text-primary);
  }

  .alert-warning .alert-title {
    color: var(--warning);
  }

  .alert-warning .alert-icon {
    color: var(--warning);
  }

  .alert-content {
    flex: 1;
    min-width: 0;
  }

  .alert-title {
    font-size: 0.9rem;
    font-weight: 700;
    margin: 0 0 0.25rem 0;
  }

  .alert-desc {
    font-size: 0.825rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .alert-hint {
    margin: 0.45rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .alert-hint code {
    font-family: var(--font-mono);
    font-size: 0.775rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    color: var(--text-primary);
  }

  .alert-actions {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
  }

  .alert-link {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--accent-strong);
    text-decoration: underline;
    text-underline-offset: 3px;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .alert-link:hover {
    color: var(--text-primary);
  }

  .warning-list {
    margin: 0.35rem 0 0 1.15rem;
    padding: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .warning-item {
    line-height: 1.45;
  }

  .warning-filaments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
  }

  .warning-filament {
    display: inline-flex;
  }

  .warning-filament-pill,
  .warning-filament-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0.45rem 0.08rem 0.28rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }

  .warning-filament-btn {
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }

  .warning-filament-btn:hover {
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
  }

  .warning-filament-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .warning-filament-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    border: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .warning-layer-action {
    margin-top: 0.55rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem 0.75rem;
    font-size: 0.8125rem;
  }

  .warning-layer-label {
    color: var(--text-secondary);
  }

  .warning-layer-btn {
    background: var(--bg-input);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .warning-layer-btn:hover {
    background: var(--bg-card-hover);
    border-color: var(--accent-strong);
  }

  .warning-layer-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
  }

  .alert-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.2rem;
    transition: color 0.15s ease;
  }

  .alert-dismiss:hover {
    color: var(--text-primary);
  }
</style>
