<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { presetsEngine, type Preset } from "../presetsEngine";
  import { fetchProfiles } from "../api";
  import type { ProfileSummary } from "any2orca";
  import HelpTip from "./HelpTip.svelte";

  let {
    selectedPreset = null,
    onSelectPreset,
    onOpenPresetsManager,
    compact = false,
    showTitle = true,
  }: {
    selectedPreset?: string | null;
    onSelectPreset: (presetName: string | null) => void;
    onOpenPresetsManager?: () => void;
    compact?: boolean;
    showTitle?: boolean;
  } = $props();

  let presets = $state<Preset[]>([]);
  let profiles = $state<ProfileSummary[]>([]);

  onMount(async () => {
    presets = presetsEngine.listPresets();
    try {
      profiles = await fetchProfiles();
    } catch {}
  });

  $effect(() => {
    const _ = selectedPreset;
    untrack(() => {
      presets = presetsEngine.listPresets();
    });
  });

  const activePreset = $derived(
    presets.find((p) => p.name.toLowerCase() === (selectedPreset || "").toLowerCase())
  );

  const baseDisplayName = $derived(
    profiles.find((p) => p.id === activePreset?.base)?.displayName ?? activePreset?.base ?? ""
  );

  const changeCount = $derived(
    Object.keys(activePreset?.changes || {}).length
  );

  let hasAboveStock = $state(false);

  $effect(() => {
    if (activePreset) {
      untrack(() => {
        presetsEngine.isAboveStock(activePreset).then((above) => {
          hasAboveStock = above;
        }).catch(() => {
          hasAboveStock = false;
        });
      });
    } else {
      hasAboveStock = false;
    }
  });

  function handleSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    const val = target.value.trim();
    onSelectPreset(val.length > 0 ? val : null);
  }
</script>

<div class="preset-picker-container" class:compact>
  <div class="picker-control-group">
    {#if showTitle}
      <div class="picker-header">
        <div class="picker-title-group">
          <h3 class="section-title">Tuned Preset</h3>
          <HelpTip
            id="tuned-preset"
            title="Tuned presets"
            testId="helptip-btn-tuned-preset"
          >
            <p>
              A preset is your own print settings, made from a project you tuned in Snapmaker Orca: walls, infill, supports, speeds and so on. Converting with it applies your settings instead of the creator's. It changes only what you changed from Snapmaker's stock profile; machine settings, filaments and the model's layout are never part of it. A preset applies to this conversion only: choose it again each time, or leave it on "No preset" for a normal conversion. Manage presets under Advanced.
            </p>
          </HelpTip>
        </div>
        {#if onOpenPresetsManager}
          <button
            type="button"
            class="manage-presets-btn"
            onclick={onOpenPresetsManager}
            title="Manage saved presets or import from 3MF"
          >
            Manage
          </button>
        {/if}
      </div>
    {/if}

    <div class="picker-label-row">
      <div class="picker-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span>Print Preset</span>
      </div>

      <div class="picker-badges">
        {#if hasAboveStock}
          <span class="badge badge-warning" data-testid="above-stock-badge">
            Above-Stock
          </span>
        {/if}
        {#if !showTitle && onOpenPresetsManager}
          <button
            type="button"
            class="manage-link-btn"
            onclick={onOpenPresetsManager}
            title="Manage saved presets"
          >
            Manage
          </button>
        {/if}
      </div>
    </div>

    <div class="select-wrapper">
      <select
        data-testid="preset-picker"
        value={selectedPreset || ""}
        onchange={handleSelect}
        class="preset-select"
        aria-label="Select custom tuned preset"
      >
        <option value="">No preset (creator's settings)</option>
        {#each presets as preset (preset.name)}
          <option value={preset.name}>
            {preset.name.slice(0, 40)}
          </option>
        {/each}
      </select>
      <div class="select-arrow" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>
    <span class="preset-helper-text">
      {#if activePreset}
        Converts onto {baseDisplayName}; your {changeCount} {changeCount === 1 ? "setting replaces" : "settings replace"} the creator's.
      {:else}
        Converts with the creator's settings on Snapmaker's stock profile.
      {/if}
    </span>
  </div>
</div>

<style>
  .preset-picker-container {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: 100%;
  }

  .preset-picker-container.compact {
    gap: 0.5rem;
  }

  .picker-control-group {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.1rem;
  }

  .picker-title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .section-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    margin: 0;
  }

  .picker-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    gap: 0.4rem 0.5rem;
    flex-wrap: wrap;
  }

  .picker-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .picker-badges {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .badge-warning {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    color: var(--warning);
    white-space: nowrap;
  }

  .manage-presets-btn,
  .manage-link-btn {
    background: transparent;
    border: none;
    color: var(--accent-strong);
    font-size: 0.775rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.1rem 0.35rem;
    border-radius: var(--radius-sm);
    transition: opacity 0.15s ease;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .manage-presets-btn:hover,
  .manage-link-btn:hover {
    opacity: 0.8;
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .preset-select {
    width: 100%;
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

  .preset-select:hover {
    border-color: var(--border-focus);
  }

  .preset-select:focus {
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

  .preset-helper-text {
    font-size: 0.74rem;
    color: var(--text-muted);
    line-height: 1.35;
    margin-top: 0.1rem;
  }
</style>
