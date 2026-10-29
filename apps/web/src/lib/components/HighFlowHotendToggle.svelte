<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { highFlowStore } from "../highFlowState.svelte";
  import { fetchProfiles, isHighFlowSupported } from "../api";
  import type { ProfileSummary } from "any2orca";
  import HelpTip from "./HelpTip.svelte";

  let {
    detectedDiameter = "0.4",
    isSupported: isSupportedProp,
    compact = false,
  }: {
    detectedDiameter?: string;
    isSupported?: boolean;
    compact?: boolean;
  } = $props();

  let profiles = $state<ProfileSummary[]>([]);

  $effect(() => {
    if (isSupportedProp === undefined) {
      fetchProfiles(detectedDiameter)
        .then((res) => {
          profiles = res;
        })
        .catch(() => {
          // ignore
        });
    }
  });

  const isSupported = $derived.by(() => {
    if (isSupportedProp !== undefined) return isSupportedProp;
    if (profiles.length > 0) {
      return profiles.some((p) => p.highFlowSupported === true);
    }
    return isHighFlowSupported(detectedDiameter);
  });

  function handleToggle() {
    if (!isSupported) return;
    highFlowStore.toggle();
  }
</script>

<div class="high-flow-card" class:is-compact={compact} class:is-disabled={!isSupported}>
  <div class="toggle-row">
    <div class="label-col">
      <div class="label-wrapper">
        <span class="hotend-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 2v8"></path>
            <path d="M8.5 4.5l7 7"></path>
            <path d="M15.5 4.5l-7 7"></path>
            <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7z"></path>
          </svg>
        </span>
        <label id="high-flow-label" for="high-flow-switch" class="switch-label">
          Liber High Flow
        </label>
        <HelpTip
          id="high-flow"
          title="Liber High Flow"
          testId="helptip-btn-high-flow"
        >
          <p>
            Select the toolheads that have the Snapmaker Liber High Flow Hotend installed. Your converted file will record them, so Snapmaker Orca matches your printer. When you slice, Snapmaker Orca asks which colors print on which nozzle. Currently, only the 0.20mm Standard profile has faster high-flow speeds included. High-flow hotends help most on large prints with long, continuous paths; gains are smaller on fine detail, curves and frequent turns.
          </p>
          <a
            href="https://shop.snapmaker.com/products/liber-high-flow-hotend"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>View Liber High Flow Hotend on Snapmaker Store</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </HelpTip>
      </div>

      {#if !isSupported}
        <span class="unsupported-hint">Snapmaker's High Flow Hotend is only available for the 0.4mm nozzle.</span>
      {/if}
    </div>

    <button
      id="high-flow-switch"
      data-testid="high-flow-toggle"
      type="button"
      role="switch"
      aria-label="Liber High Flow Hotend installed"
      aria-labelledby="high-flow-label"
      aria-checked={highFlowStore.installed && isSupported}
      disabled={!isSupported}
      onclick={handleToggle}
      class="switch-btn"
      class:is-active={highFlowStore.installed && isSupported}
    >
      <span class="switch-slider"></span>
    </button>
  </div>

  {#if highFlowStore.installed && isSupported}
    <div class="toolheads-section">
      <div
        role="group"
        aria-label="Toolheads with the Liber hotend"
        class="toolheads-group"
      >
        {#each [0, 1, 2, 3] as i}
          {@const active = highFlowStore.toolheads[i]}
          <button
            type="button"
            data-testid={`high-flow-toolhead-${i + 1}`}
            aria-pressed={active}
            aria-label={`T${i + 1}, toolhead ${i + 1}`}
            class="toolhead-chip"
            class:is-selected={active}
            onclick={() => highFlowStore.toggleToolhead(i)}
          >
            {#if active}
              <svg class="chip-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {/if}
            <span class="chip-text">T{i + 1}</span>
          </button>
        {/each}

        <button
          type="button"
          data-testid="high-flow-all"
          aria-label="Select all toolheads"
          class="all-chip"
          onclick={() => highFlowStore.selectAll()}
        >
          All
        </button>
      </div>

      {#if !highFlowStore.hasActive}
        <span class="toolhead-hint">No toolheads selected (standard speeds used).</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .high-flow-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    transition: all 0.2s ease;
  }

  .high-flow-card.is-disabled {
    opacity: 0.72;
  }

  .high-flow-card.is-compact {
    padding: 0.75rem 0.9rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .label-col {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .label-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .is-compact .switch-label {
    font-size: 0.82rem;
  }

  .hotend-icon {
    display: inline-flex;
    align-items: center;
    color: var(--accent-strong);
    flex-shrink: 0;
  }

  .switch-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    cursor: pointer;
    line-height: 1.35;
  }

  .is-disabled .switch-label {
    cursor: not-allowed;
  }

  .unsupported-hint {
    font-size: 0.78rem;
    color: var(--warning);
    line-height: 1.3;
  }

  .switch-btn {
    position: relative;
    width: 44px;
    height: 24px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    cursor: pointer;
    flex-shrink: 0;
    padding: 2px;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .switch-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .switch-btn.is-active {
    background: var(--accent);
    border-color: var(--accent-strong);
    box-shadow: 0 0 12px var(--btn-primary-glow);
  }

  .switch-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .switch-slider {
    display: block;
    width: 18px;
    height: 18px;
    background: var(--text-primary);
    border-radius: 50%;
    box-shadow: var(--card-shadow);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateX(0);
  }

  .switch-btn.is-active .switch-slider {
    transform: translateX(20px);
  }

  .toolhead-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.3;
    padding-top: 0.15rem;
  }

  .toolheads-section {
    padding-top: 0.4rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .toolheads-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .toolhead-chip {
    min-height: 44px;
    min-width: 44px;
    padding: 0 0.85rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolhead-chip:hover {
    background: var(--btn-secondary-hover-bg);
    border-color: var(--btn-secondary-hover-border);
    color: var(--text-primary);
  }

  .toolhead-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toolhead-chip.is-selected,
  .toolhead-chip.is-selected:hover {
    background: var(--btn-primary-bg);
    border-color: var(--border-focus);
    color: var(--text-on-accent);
    box-shadow: 0 0 10px var(--btn-primary-glow);
  }

  .chip-check {
    flex-shrink: 0;
  }

  .chip-text {
    line-height: 1;
  }

  .all-chip {
    min-height: 44px;
    min-width: 44px;
    padding: 0 0.85rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--accent-strong);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .all-chip:hover {
    background: var(--btn-secondary-hover-bg);
    border-color: var(--btn-secondary-hover-border);
    color: var(--text-primary);
  }

  .all-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .switch-label {
      font-size: 0.82rem;
    }
  }
</style>
