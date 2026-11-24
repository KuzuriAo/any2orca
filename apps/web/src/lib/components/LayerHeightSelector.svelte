<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import HelpTip from "./HelpTip.svelte";
  import { LAYER_HEIGHT_HELP, formatLayerHeightMm } from "../layerHeight";

  let {
    value = null,
    heights = [],
    onChange,
    compact = false,
  }: {
    value: number | null;
    heights: readonly number[];
    onChange: (height: number | null) => void;
    compact?: boolean;
  } = $props();

  function handleChange(e: Event) {
    const raw = (e.currentTarget as HTMLSelectElement).value;
    if (!raw) {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  }
</script>

<div class="layer-height-card" class:is-compact={compact}>
  <div class="layer-height-label-row">
    <label for="layer-height-select" class="layer-height-label">Layer height</label>
    <HelpTip
      id="layer-height"
      title="Layer height"
      testId="helptip-btn-layer-height"
    >
      <p>{LAYER_HEIGHT_HELP}</p>
    </HelpTip>
  </div>
  <div class="select-wrapper">
    <select
      id="layer-height-select"
      data-testid="layer-height-select"
      class="layer-height-select"
      value={value === null ? "" : String(value)}
      onchange={handleChange}
    >
      <option value="">Keep the creator's layers</option>
      {#each heights as h (h)}
        <option value={String(h)}>{formatLayerHeightMm(h)}</option>
      {/each}
    </select>
    <div class="select-arrow" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  </div>
</div>

<style>
  .layer-height-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.95rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .layer-height-card.is-compact {
    padding: 0.65rem 0.85rem;
  }

  .layer-height-label-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .layer-height-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
  }

  .is-compact .layer-height-label {
    font-size: 0.82rem;
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .layer-height-select {
    width: 100%;
    min-height: 44px;
    appearance: none;
    padding: 0.65rem 2.2rem 0.65rem 0.85rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .layer-height-select:hover {
    border-color: var(--border-focus);
  }

  .layer-height-select:focus-visible {
    border-color: var(--accent-strong);
    box-shadow: 0 0 0 2px var(--btn-primary-glow);
  }

  .select-arrow {
    position: absolute;
    right: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-muted);
  }
</style>
