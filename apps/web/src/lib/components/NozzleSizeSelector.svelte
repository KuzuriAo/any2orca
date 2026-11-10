<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { SUPPORTED_NOZZLE_DIAMETERS } from "any2orca";
  import { nozzleSizeStore } from "../nozzleSizeState.svelte";
  import HelpTip from "./HelpTip.svelte";

  let {
    compact = false,
  }: {
    compact?: boolean;
  } = $props();

  function handleChange(e: Event) {
    nozzleSizeStore.setValue((e.currentTarget as HTMLSelectElement).value);
  }
</script>

<div class="nozzle-card" class:is-compact={compact}>
  <div class="nozzle-label-row">
    <label for="nozzle-size-select" class="nozzle-label">Your U1's nozzle size</label>
    <HelpTip
      id="nozzle-size"
      title="Your U1's nozzle size"
      testId="helptip-btn-nozzle-size"
    >
      <p>
        The converted file is made for this nozzle size: its profile, layer heights and filament values are the U1's for that size, and the file records it. The U1's stock nozzles are 0.4 mm. Snapmaker Orca uses one size for all four toolheads. A project made for another size is converted anyway and you're told; 'Match the file' converts for the size the creator used.
      </p>
    </HelpTip>
  </div>
  <div class="select-wrapper">
    <select
      id="nozzle-size-select"
      data-testid="nozzle-size-select"
      class="nozzle-select"
      value={nozzleSizeStore.value}
      onchange={handleChange}
    >
      {#each SUPPORTED_NOZZLE_DIAMETERS as size (size)}
        <option value={size}>{size} mm</option>
      {/each}
      <option value="match">Match the file</option>
    </select>
    <div class="select-arrow" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  </div>
</div>

<style>
  .nozzle-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.95rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .nozzle-card.is-compact {
    padding: 0.65rem 0.85rem;
  }

  .nozzle-label-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .nozzle-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
  }

  .is-compact .nozzle-label {
    font-size: 0.82rem;
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .nozzle-select {
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

  .nozzle-select:hover {
    border-color: var(--border-focus);
  }

  .nozzle-select:focus-visible {
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
