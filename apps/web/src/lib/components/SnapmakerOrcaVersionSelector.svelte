<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick } from "svelte";
  import { fetchReleases } from "../api";
  import {
    resolveOlderVersionsUi,
    snapmakerOrcaReleaseStore,
    splitReleases,
  } from "../snapmakerOrcaReleaseState.svelte";
  import HelpTip from "./HelpTip.svelte";

  let {
    compact = false,
  }: {
    compact?: boolean;
  } = $props();

  $effect(() => {
    if (snapmakerOrcaReleaseStore.releases.length === 0) {
      fetchReleases()
        .then((releases) => snapmakerOrcaReleaseStore.setReleases(releases))
        .catch(() => {});
    }
  });

  let expandedByClick = $state(false);
  let selectEl = $state<HTMLSelectElement | undefined>(undefined);

  const releases = $derived(snapmakerOrcaReleaseStore.releases);
  const { shown, older } = $derived(splitReleases(releases));
  const selected = $derived(snapmakerOrcaReleaseStore.current?.version ?? "");
  const { olderOpen, showOlderButton } = $derived(
    resolveOlderVersionsUi(
      older.length,
      expandedByClick,
      snapmakerOrcaReleaseStore.isOlderSelected,
    ),
  );

  function handleChange(e: Event) {
    snapmakerOrcaReleaseStore.setVersion((e.currentTarget as HTMLSelectElement).value || null);
  }

  async function handleShowOlder() {
    expandedByClick = true;
    await tick();
    selectEl?.focus();
  }
</script>

<!-- Only a choice when there is one: a catalog with a single release has nothing to pick. -->
{#if releases.length > 1}
  <div class="version-card" class:is-compact={compact}>
    <div class="version-label-row">
      <label for="snapmaker-orca-version" class="version-label">Snapmaker Orca version</label>
      <HelpTip
        id="snapmaker-orca-version"
        title="Snapmaker Orca version"
        testId="helptip-btn-snapmaker-orca-version"
      >
        <p>
          Pick the version you slice with; its About window shows it. The file gets that version's U1 profiles and stock values. The newest is the default. Older versions are under Show older versions, for anyone who has to stay on one.
        </p>
        <p>
          A file made for a newer version still opens and slices in an older one, though it may show a notice about a setting the newer one added. Snapmaker Orca's command line stops at that setting instead, so for command-line slicing pick exactly your version.
        </p>
      </HelpTip>
    </div>
    <div class="select-wrapper">
      <select
        bind:this={selectEl}
        id="snapmaker-orca-version"
        data-testid="snapmaker-orca-version"
        class="version-select"
        value={selected}
        onchange={handleChange}
      >
        {#each shown as release (release.version)}
          <option value={release.version}>{release.version}{release.isDefault ? " (newest)" : ""}</option>
        {/each}
        {#if olderOpen}
          <optgroup label="Older versions">
            {#each older as release (release.version)}
              <option value={release.version}>{release.version}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
      <div class="select-arrow" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>
    {#if showOlderButton}
      <button
        type="button"
        class="older-versions-btn"
        data-testid="show-older-versions"
        aria-expanded={olderOpen}
        aria-controls="snapmaker-orca-version"
        onclick={handleShowOlder}
      >
        Show older versions
      </button>
    {/if}
  </div>
{/if}

<style>
  .version-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.95rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .version-card.is-compact {
    padding: 0.65rem 0.85rem;
  }

  .version-label-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .version-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
  }

  .is-compact .version-label {
    font-size: 0.82rem;
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .version-select {
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

  .version-select:hover {
    border-color: var(--border-focus);
  }

  .version-select:focus-visible {
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

  .older-versions-btn {
    align-self: flex-start;
    background: transparent;
    border: none;
    padding: 0.15rem 0;
    color: var(--accent-strong);
    font-family: var(--font-sans);
    font-size: 0.78rem;
    font-weight: 500;
    text-decoration: underline;
    cursor: pointer;
  }

  .older-versions-btn:hover {
    color: var(--text-primary);
  }

  .older-versions-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
</style>
