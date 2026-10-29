<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { ConversionState } from "../types";
  import { highFlowStore } from "../highFlowState.svelte";
  import { isHighFlowSupported } from "../api";
  import { presetsEngine } from "../presetsEngine";
  import WhatChangedPanel from "./WhatChangedPanel.svelte";

  let {
    convState,
    onConvert,
    onDownload,
    onReconvert,
  }: {
    convState: ConversionState;
    onConvert: () => void;
    onDownload: () => void;
    onReconvert?: (aboveStock: { keep: string[]; stock: string[] }) => void | Promise<void>;
  } = $props();

  let isConverting = $derived(
    convState.stage === "converting" ||
    convState.stage === "stitching" ||
    convState.stage === "reading" ||
    convState.stage === "parsing"
  );

  let highFlowSummary = $derived.by(() => {
    if (!isHighFlowSupported(convState.metadata?.nozzleDiameter)) {
      return "High-flow hotends: none";
    }
    return highFlowStore.summary;
  });

  let presetSummary = $derived.by(() => {
    if (!convState.selectedPresetName) return "No preset";
    const presets = presetsEngine.listPresets();
    const found = presets.find(
      (p) => p.name.toLowerCase() === convState.selectedPresetName!.toLowerCase()
    );
    if (!found) return `Converting with preset: ${convState.selectedPresetName}`;
    const count = Object.keys(found.changes).length;
    return `Converting with preset: ${found.name} (${count} ${count === 1 ? "change" : "changes"})`;
  });
</script>

{#if convState.metadata}
  <aside class="action-bar-container" aria-label="Conversion actions">
    {#if isConverting}
      <!-- Active Processing Bar -->
      <div class="island-card island-converting">
        <div class="pulse-spinner" aria-hidden="true"></div>
        <div class="island-status-col">
          <span class="island-status-text">{convState.stageMessage || "Converting your file..."}</span>
          <div class="island-mini-progress">
            <div class="island-mini-bar" style="width: {convState.progressPercent || 30}%"></div>
          </div>
        </div>
        <span class="island-pct">{convState.progressPercent || 0}%</span>
      </div>
    {:else if convState.stage === "complete"}
      <!-- Completed State with Manual Download CTA -->
      <div class="complete-wrapper">
        <div class="island-card island-complete">
          <div class="complete-info-col">
            <div class="success-icon-badge" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div class="complete-text-group">
              <span class="complete-title">Snapmaker U1 3MF Ready</span>
              <span class="complete-sub">{convState.downloadFilename || "Converted.3mf"}</span>
              <span data-testid="preset-summary-line-complete" class="preset-summary-line">
                {presetSummary}
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="download-button"
            class="btn btn-primary download-btn"
            onclick={onDownload}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download 3MF</span>
          </button>
        </div>
        <WhatChangedPanel
          data={convState.whatChanged}
          outputFilename={convState.downloadFilename}
          onReconvert={onReconvert}
        />
      </div>
    {:else}
      <!-- Ready to Convert Action -->
      <div class="island-card island-ready">
        <div class="ready-meta">
          <div class="ready-status">
            <span class="ready-dot" aria-hidden="true"></span>
            <span class="ready-count">{convState.metadata.objectsCount} Objects Ready</span>
          </div>
          <span data-testid="high-flow-summary" class="high-flow-summary">
            {highFlowSummary}
          </span>
          <span data-testid="preset-summary-line" class="preset-summary-line">
            {presetSummary}
          </span>
        </div>
        <button
          type="button"
          data-testid="convert-button"
          class="btn btn-primary convert-btn"
          disabled={convState.errorCode === "catalog_load_failed"}
          onclick={onConvert}
        >
          <span>Convert to Snapmaker U1</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .complete-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .action-bar-container {
    width: 100%;
    margin-top: 1.25rem;
    display: flex;
    justify-content: center;
    box-sizing: border-box;
  }

  .island-card {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-card);
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-btn);
    box-shadow: var(--card-shadow);
    padding: 0.85rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Converting State */
  .island-converting {
    justify-content: space-between;
  }

  .pulse-spinner {
    width: 20px;
    height: 20px;
    border: 2.5px solid var(--border-subtle);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .island-status-col {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .island-status-text {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .island-mini-progress {
    width: 100%;
    height: 4px;
    background: var(--bg-input);
    border-radius: 9999px;
    overflow: hidden;
  }

  .island-mini-bar {
    height: 100%;
    background: var(--btn-primary-bg);
    border-radius: 9999px;
    transition: width 0.2s ease;
  }

  .island-pct {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  /* Complete State */
  .island-complete {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.85rem;
  }

  .complete-info-col {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
    flex: 1 1 240px;
  }

  .success-icon-badge {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--success-glow);
    border: 1px solid var(--success-glow);
    color: var(--success);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .complete-text-group {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }

  .complete-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .complete-sub {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .download-btn {
    flex-shrink: 0;
    padding: 0.65rem 1.4rem;
    gap: 0.45rem;
    white-space: nowrap;
  }

  /* Ready State */
  .island-ready {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.85rem;
  }

  .ready-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    flex: 1 1 200px;
    min-width: 0;
  }

  .ready-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .ready-count {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .high-flow-summary {
    font-size: 0.76rem;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1.3;
  }

  .preset-summary-line {
    font-size: 0.76rem;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1.3;
  }

  .ready-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 6px var(--success-glow);
  }

  .convert-btn {
    padding: 0.65rem 1.4rem;
    gap: 0.5rem;
    flex-shrink: 0;
    white-space: nowrap;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 540px) {
    .island-card {
      padding: 0.75rem 1rem;
    }
    .island-complete,
    .island-ready {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .complete-info-col {
      width: 100%;
    }
    .convert-btn,
    .download-btn {
      width: 100%;
      justify-content: center;
      padding: 0.65rem 1rem;
      font-size: 0.9rem;
    }
  }
</style>
