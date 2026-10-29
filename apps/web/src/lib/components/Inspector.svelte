<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { ConversionState } from "../types";
  import ProfilePicker from "./ProfilePicker.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import FilamentComplianceSelector from "./FilamentComplianceSelector.svelte";
  import HighFlowHotendToggle from "./HighFlowHotendToggle.svelte";
  import FilamentSwatches from "./FilamentSwatches.svelte";
  import StampToggle from "./StampToggle.svelte";
  import HardenedNozzleToggle from "./HardenedNozzleToggle.svelte";
  import { isHardenedNozzleSupported, fetchProfileCatalog } from "../api";
  import type { ProfileCatalog } from "any2orca";
  import { presetsEngine } from "../presetsEngine";

  let {
    convState,
    onConvertAnother,
    onSelectProfile,
    onSelectComplianceMode,
    onClearFile,
    onSelectPreset = () => {},
    onOpenPresetsManager = () => {},
  }: {
    convState: ConversionState;
    onConvertAnother: () => void;
    onSelectProfile: (profileId: string) => void;
    onSelectComplianceMode: (mode: "generic" | "snapmaker" | null) => void;
    onClearFile?: () => void;
    onSelectPreset?: (presetName: string | null) => void;
    onOpenPresetsManager?: () => void;
  } = $props();

  let catalog = $state<ProfileCatalog | null>(null);

  $effect(() => {
    fetchProfileCatalog().then((cat) => {
      catalog = cat;
    }).catch(() => {});
  });

  const targetProfileId = $derived.by(() => {
    if (convState.selectedPresetName && activePreset?.base) {
      return activePreset.base;
    }
    return convState.selectedProfileId || convState.matchedProfile?.profileId || null;
  });

  const targetPrinterId = $derived.by(() => {
    if (!targetProfileId || !catalog) return null;
    return catalog.get(targetProfileId)?.printerId ?? null;
  });

  const activePreset = $derived.by(() => {
    if (!convState.selectedPresetName) return null;
    return (
      presetsEngine
        .listPresets()
        .find((p) => p.name.toLowerCase() === convState.selectedPresetName!.toLowerCase()) ?? null
    );
  });

  const is04Profile = $derived.by(() => {
    if (convState.selectedProfileId) {
      if (convState.selectedProfileId.includes("-0.4-") || convState.selectedProfileId.endsWith("-0.4")) return true;
      if (convState.selectedProfileId.match(/-0\.[268]-/)) return false;
    }
    const dia = convState.matchedProfile?.nozzleDiameter || convState.metadata?.nozzleDiameter || "0.4";
    return isHardenedNozzleSupported(dia);
  });
</script>

<aside class="inspector-panel glass-card" aria-label="3MF Information and Conversion Settings">
  <div class="inspector-header">
    <div class="inspector-title-group">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
      <h2 class="inspector-title">3MF Information</h2>
    </div>
    <div class="inspector-header-actions">
      <button
        type="button"
        class="inspector-action-btn"
        onclick={onConvertAnother}
        data-testid="convert-another"
        title="Convert a different file"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="1 4 1 10 7 10"></polyline>
          <polyline points="23 20 23 14 17 14"></polyline>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
        </svg>
        <span>Convert Another</span>
      </button>
      {#if onClearFile}
        <button
          type="button"
          class="inspector-close-btn"
          onclick={onClearFile}
          data-testid="clear-loaded-file"
          title="Remove file"
          aria-label="Remove file"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if convState.metadata}
    <div class="inspector-scroll-area">
      <!-- Section 1: Printhead Configuration -->
      <section class="inspector-group" aria-labelledby="printhead-heading">
        <h3 id="printhead-heading" class="inspector-label">Printhead Configuration</h3>
        <div class="inspector-row-item">
          <span class="row-label">Nozzle Diameter</span>
          <span class="row-value">{convState.metadata.nozzleDiameter || "0.4"} mm</span>
        </div>
        <div class="inspector-row-item">
          <span class="row-label">Layer Height</span>
          <span class="row-value">{convState.metadata.layerHeight || "0.20"} mm</span>
        </div>
        <div class="inspector-toggle-box">
          <HighFlowHotendToggle
            detectedDiameter={convState.metadata.nozzleDiameter || "0.4"}
            compact={true}
          />
        </div>
        {#if is04Profile}
          <div class="inspector-toggle-box">
            <HardenedNozzleToggle compact={true} />
          </div>
        {/if}
      </section>

      <!-- Section 2: Target Preset Matcher & Tuned Presets -->
      <section class="inspector-group" aria-label="Snapmaker U1 Profile and preset selection">
        <ProfilePicker
          detectedDiameter={convState.metadata.nozzleDiameter || "0.4"}
          sourceLayerHeight={convState.metadata.layerHeight}
          sourcePresetName={convState.metadata.sourcePresetName}
          selectedProfileId={activePreset ? activePreset.base : convState.selectedProfileId}
          matchedProfile={convState.matchedProfile}
          onSelectProfile={onSelectProfile}
          compact={true}
          showTitle={true}
          disabled={Boolean(activePreset)}
        />
        <div class="preset-picker-box">
          <PresetPicker
            selectedPreset={convState.selectedPresetName ?? null}
            onSelectPreset={onSelectPreset}
            onOpenPresetsManager={onOpenPresetsManager}
            compact={true}
            showTitle={true}
          />
        </div>
      </section>

      <!-- Section 3: Filament Brand Preset Relabeling -->
      <section class="inspector-group" aria-label="Filament brand compliance selection">
        <FilamentComplianceSelector
          mode={convState.filamentComplianceMode ?? null}
          onChange={onSelectComplianceMode}
          fallbackNotice={convState.filamentComplianceFallback}
          unchangedNotice={convState.filamentComplianceUnchanged}
          compact={true}
        />
      </section>

      <!-- Section 4: Version Note Option -->
      <section class="inspector-group" aria-label="Version note option">
        <StampToggle compact={true} />
      </section>

      <!-- Section 5: Filaments Tray -->
      {#if convState.metadata.filaments && convState.metadata.filaments.length > 0}
        <section class="inspector-group" aria-label="Project Filaments">
          <FilamentSwatches
            filaments={convState.metadata.filaments}
            complianceMode={convState.filamentComplianceMode}
            catalog={catalog}
            printerId={targetPrinterId}
            nozzleDiameter={convState.metadata.nozzleDiameter || "0.4"}
          />
        </section>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .inspector-panel {
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    gap: 1rem;
    height: fit-content;
  }

  .inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .inspector-title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--accent-strong);
  }

  .inspector-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }


  .inspector-header-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .inspector-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .inspector-close-btn:hover {
    color: var(--danger);
    border-color: var(--danger);
    background: var(--bg-card-hover);
  }

  .inspector-close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .inspector-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .inspector-action-btn:hover {
    color: var(--text-primary);
    border-color: var(--border-focus);
    background: var(--bg-card-hover);
  }

  .inspector-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .inspector-group {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .inspector-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin: 0;
  }

  .inspector-row-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.65rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
  }

  .row-label {
    color: var(--text-secondary);
  }

  .row-value {
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-mono);
  }

  .preset-picker-box {
    margin-top: 0.85rem;
  }

  .inspector-toggle-box {
    margin-top: 0.25rem;
  }
</style>
