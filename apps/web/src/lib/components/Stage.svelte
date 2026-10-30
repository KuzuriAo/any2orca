<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { ConversionState } from "../types";
  import StatusBanner from "./StatusBanner.svelte";
  import PlateVisualizer from "./PlateVisualizer.svelte";
  import BatchConversionView from "./BatchConversionView.svelte";

  let {
    convState,
    isDragging = false,
    batchFiles = null,
    pendingManifest = null,
    triggerFilePicker,
    onClearBatch,
    onOpenPrivacy,
    onOpenPresetsManager = () => {},
    onConfirmManifest,
    onCancelManifest,
  }: {
    convState: ConversionState;
    isDragging?: boolean;
    batchFiles?: File[] | null;
    pendingManifest?: { files: { name: string; url: string }[]; hosts: string[] } | null;
    triggerFilePicker: () => void;
    onClearBatch: () => void;
    onOpenPrivacy: () => void;
    onOpenPresetsManager?: () => void;
    onConfirmManifest?: () => void;
    onCancelManifest?: () => void;
  } = $props();

  let isReadingOrParsing = $derived(
    convState.stage === "reading" || convState.stage === "parsing"
  );

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="stage-container">
  <StatusBanner
    errorMessage={convState.errorMessage}
    errorCode={convState.errorCode}
    warnings={convState.warnings}
    onDismissError={() => { convState.errorMessage = null; convState.errorCode = null; }}
  />

  {#if pendingManifest}
    <section class="manifest-card glass-card" data-testid="manifest-confirm" aria-labelledby="manifest-title">
      <div class="manifest-content">
        <div class="manifest-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </div>
        <div class="manifest-text">
          <h2 id="manifest-title" class="manifest-title">Load files from partner link?</h2>
          <p class="manifest-desc">
            This link asks to load <strong>{pendingManifest.files.map((f) => f.name).join(", ")}</strong> from
            <span class="manifest-hosts">
              {#each pendingManifest.hosts as host, i}
                <code>{host}</code>{#if i < pendingManifest.hosts.length - 1}, {/if}
              {/each}
            </span>.
          </p>
          <p class="manifest-subtext">
            Your files never leave your device. Models load directly into your browser.
          </p>
        </div>
      </div>
      <div class="manifest-actions">
        <button type="button" class="btn btn-primary" onclick={onConfirmManifest}>Load files</button>
        <button type="button" class="btn btn-secondary" onclick={onCancelManifest}>Cancel</button>
      </div>
    </section>
  {:else if batchFiles && batchFiles.length > 0}
    <BatchConversionView
      initialFiles={batchFiles}
      onClearBatch={onClearBatch}
      onOpenPresetsManager={onOpenPresetsManager}
    />
  {:else if !convState.metadata}
    <!-- Empty Stage / Inspecting Stage -->
    <section
      class="empty-stage glass-card"
      class:drag-active={isDragging && !isReadingOrParsing}
      class:is-loading={isReadingOrParsing}
      data-testid="dropzone"
      aria-busy={isReadingOrParsing}
    >
      <div class="plate-pedestal" aria-hidden="true">
        <div class="virtual-plate-grid" class:is-loading={isReadingOrParsing}>
          <div class="plate-grid-lines"></div>
          <div class="plate-crosshair"></div>
          <div class="plate-dimension-tag">270 mm × 270 mm</div>
        </div>
      </div>

      {#if isReadingOrParsing}
        <div class="loading-content" role="status" aria-live="polite">
          <div class="drop-sphere is-spinning" aria-hidden="true">
            <div class="loading-spinner"></div>
          </div>

          <h2 class="drop-headline">
            Inspecting 3MF archive...
          </h2>

          {#if convState.file}
            <div class="loading-file-pill">
              <span class="file-name">{convState.file.name}</span>
              {#if convState.file.size}
                <span class="file-size-badge">{formatBytes(convState.file.size)}</span>
              {/if}
            </div>
          {/if}

          <div class="loading-progress-container">
            <div class="loading-progress-bar">
              <div
                class="loading-progress-fill"
                style="width: {convState.progressPercent || 25}%"
              ></div>
            </div>
            <div class="loading-status-row">
              <span class="loading-status-text">
                {convState.stageMessage || "Reading your file..."}
              </span>
              <span class="loading-pct">{convState.progressPercent || 0}%</span>
            </div>
          </div>

          <div class="guarantee-row">
            <span class="guarantee-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Runs in your browser
            </span>
            <span class="guarantee-pill">Zero File Data Leaves Your Device</span>
          </div>
        </div>
      {:else}
        <div class="drop-content">
          <div class="drop-sphere" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>

          <h2 class="drop-headline">
            {isDragging ? "Release 3MF onto Build Plate" : "Drop your .3mf project here"}
          </h2>
          <p class="drop-subline">
            Translates Bambu Studio, Creality Print, Anycubic, ELEGOO, and Flashforge projects for Snapmaker U1 with zero uploads. Your files never leave your device.
          </p>

          <div class="drop-cta-row">
            <button type="button" class="btn btn-primary btn-cta" onclick={triggerFilePicker}>
              Choose 3MF File...
            </button>
            <span class="cta-divider">or drag file anywhere</span>
          </div>

          <div class="guarantee-row">
            <span class="guarantee-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Runs in your browser
            </span>
            <span class="guarantee-pill">All Filament Slots &amp; Colors Preserved</span>
            <span class="guarantee-pill">Multi-Plate Support</span>
          </div>
        </div>
      {/if}
    </section>
  {:else}
    <!-- Active Stage: Print Bed Canvas & Visualizer -->
    <div class="canvas-stage glass-card">
      <div class="canvas-header-bar">
        <div class="canvas-title-group">
          <span class="stage-dot"></span>
          <h2 class="canvas-title">Print Bed Coordinate Mapping</h2>
        </div>
        <div class="stage-specs-pills">
          <span class="spec-pill">{convState.metadata.platesCount} Plate{convState.metadata.platesCount === 1 ? "" : "s"}</span>
          <span class="spec-pill">{convState.metadata.objectsCount} Objects</span>
          {#if convState.metadata.printerModel}
            <span class="spec-pill source-model-pill">{convState.metadata.printerModel}</span>
          {/if}
        </div>
      </div>

      <div class="visualizer-frame">
        {#if convState.inspection}
          <PlateVisualizer inspection={convState.inspection} response={convState.response} />
        {:else}
          <div class="visualizer-placeholder">
            <span>Analyzing plate coordinates...</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .stage-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .manifest-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .manifest-content {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    flex: 1;
  }

  .manifest-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .manifest-text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .manifest-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }

  .manifest-desc {
    font-size: 0.88rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .manifest-hosts code {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    padding: 0.15rem 0.35rem;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--accent-strong);
  }

  .manifest-subtext {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 0;
  }

  .manifest-actions {
    display: flex;
    gap: 0.75rem;
  }

  /* Empty Hero Stage */
  .empty-stage {
    min-height: 480px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 1.5rem;
    position: relative;
    overflow: hidden;
    cursor: default;
  }

  .empty-stage.drag-active {
    border-color: var(--accent);
    box-shadow: 0 0 32px var(--btn-primary-glow);
  }

  .plate-pedestal {
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .virtual-plate-grid {
    width: 148px;
    height: 148px;
    border-radius: var(--radius-md);
    background: var(--bed-surface-bg);
    border: 1.5px solid var(--bed-surface-border);
    position: relative;
    box-shadow: var(--card-shadow);
  }

  .plate-grid-lines {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, var(--bed-grid-color) 1px, transparent 1px),
      linear-gradient(to bottom, var(--bed-grid-color) 1px, transparent 1px);
    background-size: 24.6px 24.6px;
    border-radius: inherit;
  }

  .plate-crosshair {
    position: absolute;
    width: 12px;
    height: 12px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .plate-crosshair::before,
  .plate-crosshair::after {
    content: "";
    position: absolute;
    background: var(--bed-crosshair-color);
  }

  .plate-crosshair::before {
    top: 0;
    bottom: 0;
    left: 5px;
    width: 2px;
  }

  .plate-crosshair::after {
    left: 0;
    right: 0;
    top: 5px;
    height: 2px;
  }

  .plate-dimension-tag {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.02em;
    white-space: nowrap;
    background: var(--bg-card);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 580px;
    gap: 0.75rem;
  }

  .drop-sphere {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px var(--btn-primary-glow);
  }

  .drop-headline {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0.25rem 0 0;
    letter-spacing: var(--letter-spacing-heading);
  }

  .drop-subline {
    font-size: 0.88rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .drop-cta-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-cta {
    padding: 0.75rem 1.6rem;
    font-size: 0.95rem;
  }

  .cta-divider {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .guarantee-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .guarantee-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 500;
    padding: 0.25rem 0.65rem;
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .guarantee-pill svg {
    color: var(--success);
  }

  /* Active Canvas Stage */
  .canvas-stage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
  }

  .canvas-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .canvas-title-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stage-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 8px var(--success-glow);
  }

  .canvas-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .stage-specs-pills {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .spec-pill {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .source-model-pill {
    color: var(--accent-strong);
    border-color: var(--badge-accent-border);
  }

  .visualizer-frame {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 380px;
  }

  .visualizer-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  @media (max-width: 640px) {
    .manifest-card {
      flex-direction: column;
      align-items: stretch;
    }
    .manifest-actions {
      flex-direction: column;
    }
    .empty-stage {
      padding: 2rem 1rem;
      min-height: 400px;
    }
  }

  .empty-stage.is-loading {
    cursor: wait;
    pointer-events: none;
  }

  .virtual-plate-grid.is-loading {
    animation: platePulse 2s ease-in-out infinite;
  }

  @keyframes platePulse {
    0%, 100% {
      box-shadow: var(--card-shadow);
      border-color: var(--bed-surface-border);
    }
    50% {
      box-shadow: 0 0 20px var(--btn-primary-glow);
      border-color: var(--accent);
    }
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 580px;
    width: 100%;
    gap: 0.85rem;
    animation: fadeIn 0.2s ease;
  }

  .drop-sphere.is-spinning {
    background: var(--badge-accent-bg);
    border-color: var(--badge-accent-border);
  }

  .loading-spinner {
    width: 26px;
    height: 26px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-file-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    padding: 0.35rem 0.85rem;
    border-radius: var(--radius-pill);
    font-size: 0.82rem;
    max-width: 90%;
  }

  .file-name {
    color: var(--text-primary);
    font-weight: 600;
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size-badge {
    color: var(--text-muted);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .loading-progress-container {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-top: 0.4rem;
  }

  .loading-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--bg-input);
    border-radius: 9999px;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }

  .loading-progress-fill {
    height: 100%;
    background: var(--btn-primary-bg);
    border-radius: 9999px;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .loading-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.78rem;
    gap: 0.75rem;
  }

  .loading-status-text {
    color: var(--text-secondary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loading-pct {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

</style>
