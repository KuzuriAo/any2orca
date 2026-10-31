<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { fetchProfiles } from "../api";
  import { highFlowStore } from "../highFlowState.svelte";
  import { snapmakerOrcaReleaseStore } from "../snapmakerOrcaReleaseState.svelte";
  import type { ProfileSummary } from "any2orca";

  let {
    detectedDiameter = "0.4",
    sourceLayerHeight,
    sourcePresetName,
    selectedProfileId,
    matchedProfile,
    onSelectProfile,
    compact = false,
    showTitle = true,
    disabled = false,
  }: {
    detectedDiameter?: string;
    sourceLayerHeight?: number;
    sourcePresetName?: string;
    selectedProfileId?: string | null;
    matchedProfile?: { profileId: string; nozzleDiameter: string; exactMatch?: boolean; exact?: boolean } | null;
    onSelectProfile: (id: string) => void;
    compact?: boolean;
    showTitle?: boolean;
    disabled?: boolean;
  } = $props();

  let profiles = $state<ProfileSummary[]>([]);
  let loading = $state(false);
  let loadError = $state<string | null>(null);

  const activeDiameter = $derived(
    matchedProfile?.nozzleDiameter || detectedDiameter || "0.4"
  );

  const autoMatchedProfile = $derived.by(() => {
    if (matchedProfile) {
      const found = profiles.find((p) => p.id === matchedProfile.profileId);
      return {
        id: matchedProfile.profileId,
        displayName: found?.displayName ?? matchedProfile.profileId,
        layerHeight: found?.layerHeight ?? (sourceLayerHeight ? Number(sourceLayerHeight) : 0.2),
        highFlowSpeeds: found?.highFlowSpeeds ?? false,
      };
    }
    return null;
  });

  const effectiveExact = $derived.by(() => {
    if (selectedProfileId && matchedProfile && selectedProfileId !== matchedProfile.profileId) {
      return true;
    }
    return (matchedProfile?.exactMatch ?? matchedProfile?.exact) ?? true;
  });

  const activeProfileId = $derived(
    selectedProfileId ||
      matchedProfile?.profileId ||
      ""
  );

  const sortedProfiles = $derived(
    [...profiles].sort(
      (a, b) => a.layerHeight - b.layerHeight || a.displayName.localeCompare(b.displayName)
    )
  );

  const activeProfile = $derived(
    profiles.find((p) => p.id === activeProfileId)
  );

  $effect(() => {
    // Reloads when the Snapmaker Orca version changes too: each release has its own profiles.
    loadProfilesForDiameter(activeDiameter, snapmakerOrcaReleaseStore.version);
  });

  async function loadProfilesForDiameter(diameter: string, version: string | null) {
    loading = true;
    loadError = null;
    try {
      profiles = await fetchProfiles(diameter, version);
    } catch (err: unknown) {
      console.error("Failed to load profiles:", err);
      const errObj = err as { message?: string };
      loadError = errObj.message || "Failed to load available profiles.";
    } finally {
      loading = false;
    }
  }

  function handleSelect(e: Event) {
    const target = e.target as HTMLSelectElement;
    onSelectProfile(target.value);
  }
</script>

<div class="profile-picker-container" class:compact>
  {#if !effectiveExact && activeProfile}
    <div class="match-notice">
      <div class="notice-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </div>
      <div class="notice-body">
        <div class="notice-title">Closest Preset Matched</div>
        <p class="notice-text">
          Source sliced at <strong>{sourceLayerHeight ? `${sourceLayerHeight}mm` : 'custom'} layer height</strong>. Matched to nearest preset:
          <strong>{activeProfile.displayName}</strong>.
        </p>
      </div>
    </div>
  {/if}

  <div class="picker-control-group">
    {#if showTitle}
      <div class="picker-header">
        <h3 class="section-title">Snapmaker U1 Profile</h3>
      </div>
    {/if}

    <div class="picker-label-row">
      <div class="picker-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
        </svg>
        <span>{activeDiameter}mm Nozzle</span>
      </div>

      {#if activeProfile}
        <div class="picker-badges">
          <span class="badge badge-subtle">{activeProfile.layerHeight}mm Layer</span>
          {#if highFlowStore.enabled && activeProfile.highFlowSpeeds}
            <span class="badge badge-emerald badge-high-flow">High-Flow Speeds</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="picker-skeleton">
        <span class="spinner-tiny"></span>
        <span>Loading profiles...</span>
      </div>
    {:else if loadError}
      <div class="picker-error">{loadError}</div>
    {:else if profiles.length > 0}
      <div class="select-wrapper">
        <select
          data-testid="profile-picker"
          value={activeProfileId}
          onchange={handleSelect}
          disabled={disabled}
          class="profile-select"
          aria-label="Select Snapmaker U1 Quality Preset"
        >
          {#if selectedProfileId && !profiles.some((p) => p.id === selectedProfileId)}
            <option value={selectedProfileId} selected>
              {selectedProfileId}
            </option>
          {/if}
          {#if autoMatchedProfile}
            <option value={autoMatchedProfile.id}>
              Auto-Match: {autoMatchedProfile.displayName} ({autoMatchedProfile.layerHeight}mm){highFlowStore.enabled && autoMatchedProfile.highFlowSpeeds ? " • High-flow speeds" : ""}
            </option>
          {/if}
          {#each sortedProfiles as profile}
            {#if !autoMatchedProfile || profile.id !== autoMatchedProfile.id}
              <option value={profile.id}>
                {profile.displayName} ({profile.layerHeight}mm){highFlowStore.enabled && profile.highFlowSpeeds ? " • High-flow speeds" : ""}
              </option>
            {/if}
          {/each}
        </select>
        <div class="select-arrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-picker-container {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: 100%;
  }

  .profile-picker-container.compact {
    gap: 0.5rem;
  }

  .match-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.825rem;
  }

  .notice-icon {
    color: var(--accent-strong);
    margin-top: 1px;
    flex-shrink: 0;
  }

  .notice-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .notice-title {
    font-weight: 600;
    color: var(--accent-strong);
    font-size: 0.85rem;
  }

  .notice-text {
    color: var(--text-secondary);
    line-height: 1.4;
    margin: 0;
  }

  .notice-text strong {
    color: var(--text-primary);
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
    gap: 0.35rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .badge-subtle {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .badge-high-flow {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    line-height: 1.2;
    letter-spacing: normal;
    white-space: nowrap;
  }

  .select-wrapper {
    position: relative;
    width: 100%;
  }

  .profile-select {
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

  .profile-select:disabled {
    cursor: not-allowed;
    opacity: 0.75;
    background: var(--bg-card);
  }

  .profile-select:hover {
    border-color: var(--border-focus);
  }

  .profile-select:focus {
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

  .picker-skeleton {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .spinner-tiny {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .picker-error {
    font-size: 0.8rem;
    color: var(--danger);
  }

</style>
