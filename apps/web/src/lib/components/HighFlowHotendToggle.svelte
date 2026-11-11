<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { highFlowStore } from "../highFlowState.svelte";
  import { fetchProfiles, isHighFlowSupported } from "../api";
  import type { ProfileSummary } from "any2orca";
  import HelpTip from "./HelpTip.svelte";
  import { HIGH_FLOW_HELP, HIGH_FLOW_STORE_URL } from "../optionHelp";
  import SettingSwitch from "./SettingSwitch.svelte";
  import { snapmakerOrcaReleaseStore } from "../snapmakerOrcaReleaseState.svelte";

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
      fetchProfiles(detectedDiameter, snapmakerOrcaReleaseStore.version)
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

<SettingSwitch
  id="high-flow-switch"
  testId="high-flow-toggle"
  label="Liber High Flow"
  checked={highFlowStore.installed && isSupported}
  disabled={!isSupported}
  {compact}
  onchange={handleToggle}
>
  {#snippet icon()}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 2v8"></path>
      <path d="M8.5 4.5l7 7"></path>
      <path d="M15.5 4.5l-7 7"></path>
      <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7z"></path>
    </svg>
  {/snippet}
  {#snippet help()}
    <HelpTip
      id="high-flow"
      title="Liber High Flow"
      testId="helptip-btn-high-flow"
    >
      <p>{HIGH_FLOW_HELP}</p>
      <a
        href={HIGH_FLOW_STORE_URL}
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
      <a href="/faq#high-flow-hotend">More in the FAQ</a>
    </HelpTip>
  {/snippet}
  {#snippet hint()}
    {#if !isSupported}
      <span class="unsupported-hint">Snapmaker's High Flow Hotend is only available for the 0.4mm nozzle.</span>
    {/if}
  {/snippet}

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
</SettingSwitch>

<style>
  .unsupported-hint {
    font-size: 0.78rem;
    color: var(--warning);
    line-height: 1.3;
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

</style>
