<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { FileMetadata } from "../types";
  import { resolveFilamentName, type ProfileCatalog } from "any2orca";
  import { fetchProfileCatalog } from "../api";

  let {
    filaments,
    complianceMode = null,
    printerId = null,
    catalog = null,
    nozzleDiameter = "0.4",
  }: {
    filaments: FileMetadata["filaments"];
    complianceMode?: "generic" | "snapmaker" | null;
    printerId?: string | null;
    catalog?: ProfileCatalog | null;
    nozzleDiameter?: string;
  } = $props();

  let fetchedCatalog = $state<ProfileCatalog | null>(null);

  $effect(() => {
    if (!catalog && !fetchedCatalog) {
      fetchProfileCatalog()
        .then((cat) => {
          fetchedCatalog = cat;
        })
        .catch(() => {});
    }
  });

  const activeCatalog = $derived(catalog ?? fetchedCatalog);

  let selectedFilament = $state<FileMetadata["filaments"][number] | null>(null);
  import { copyTextToClipboard } from "../clipboard";
  let copyStatus = $state<"copied" | "failed" | null>(null);

  function formatCleanColorName(rawName?: string): string | null {
    if (!rawName) return null;
    // Strip common line type prefixes (e.g. "Matte ", "Basic ", "Silk ", "PolyLite ", "PolyTerra ")
    const clean = rawName.replace(/^(Matte|Basic|Silk|PolyLite|PolyTerra|Galaxy|High Speed|Tough)\s+/i, "").trim();
    return clean || rawName;
  }

  function getSlotPresetName(fil: FileMetadata["filaments"][number]): string {
    const creatorName = fil.name || `Slot ${fil.id}`;
    if (complianceMode && activeCatalog?.index?.filamentNames && printerId) {
      const resolved = resolveFilamentName(
        activeCatalog.index.filamentNames,
        printerId,
        fil.type || "PLA",
        fil.name || "",
        complianceMode
      );
      if (resolved.preset?.name) {
        return resolved.preset.name;
      }
    }
    return creatorName;
  }

  function openDetail(fil: FileMetadata["filaments"][number]) {
    selectedFilament = fil;
    copyStatus = null;
  }

  function closeDetail() {
    selectedFilament = null;
    copyStatus = null;
  }

  async function copyHexToClipboard(hex: string) {
    const ok = await copyTextToClipboard(hex);
    copyStatus = ok ? "copied" : "failed";
    setTimeout(() => {
      copyStatus = null;
    }, 2000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && selectedFilament) {
      closeDetail();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="filament-section">
  <div class="section-header">
    <div class="title-with-badge">
      <h4 class="section-title">Project Filaments ({filaments.length})</h4>
      <span class="badge badge-emerald">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        {filaments.length} Slots Preserved
      </span>
    </div>
    <span class="note-text">Click any swatch for full filament specs</span>
  </div>

  <div class="swatches-grid">
    {#each filaments as fil (fil.id)}
      {@const presetName = getSlotPresetName(fil)}
      {@const originalColorName = formatCleanColorName(fil.colorName)}
      {@const showVendorColorName = !complianceMode && Boolean(originalColorName)}
      <button
        type="button"
        class="swatch-card"
        class:has-color-name={showVendorColorName}
        onclick={() => openDetail(fil)}
        title="Click to view full specs for Slot {fil.id}"
      >
        <div class="swatch-indicator" style="background-color: {fil.color};">
          <span class="slot-num">{fil.id}</span>
        </div>
        <div class="swatch-info">
          <div class="swatch-title-row">
            <span class="swatch-name" title={presetName}>
              {presetName}
            </span>
            <span class="type-tag">{fil.type || 'PLA'}</span>
          </div>
          <div class="swatch-sub-row">
            {#if showVendorColorName}
              <span class="color-product-name" title="{originalColorName} ({fil.color})">
                {originalColorName}
              </span>
            {:else}
              <span class="hex-code">{fil.color}</span>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
</div>

{#if selectedFilament}
  {@const modalPresetName = getSlotPresetName(selectedFilament)}
  {@const modalColorName = !complianceMode ? selectedFilament.colorName : null}
  <!-- Full-Sized Filament Detail Modal -->
  <div
    class="modal-backdrop"
    onclick={closeDetail}
    onkeydown={(e) => e.key === 'Escape' && closeDetail()}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-card"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filament-modal-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <div class="modal-header-meta">
          <span class="badge badge-amethyst">Filament slot {selectedFilament.id} (in the source file)</span>
          {#if selectedFilament.type}
            <span class="type-tag modal-type-tag">{selectedFilament.type}</span>
          {/if}
          {#if complianceMode}
            <span class="badge badge-subtle">{complianceMode === 'snapmaker' ? 'Snapmaker Preset' : 'Generic Preset'}</span>
          {/if}
        </div>
        <button
          type="button"
          class="modal-close-btn"
          onclick={closeDetail}
          aria-label="Close filament details"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Big Swatch Hero -->
        <div class="modal-hero">
          <div class="modal-swatch-large" style="background-color: {selectedFilament.color};">
            <span class="modal-slot-num">{selectedFilament.id}</span>
          </div>
          <div class="modal-hero-text">
            <h3 id="filament-modal-title" class="modal-title">
              {modalColorName || modalPresetName || `Slot ${selectedFilament.id}`}
            </h3>
            <div class="hex-action-row">
              <span class="modal-hex-label">{selectedFilament.color}</span>
              <button
                type="button"
                class="copy-hex-btn"
                class:copied={copyStatus === "copied"}
                class:failed={copyStatus === "failed"}
                onclick={() => selectedFilament && copyHexToClipboard(selectedFilament.color)}
                title="Copy HEX color code"
              >
                {#if copyStatus === "copied"}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Copied!</span>
                {:else if copyStatus === "failed"}
                  <span>Couldn't copy</span>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copy Hex</span>
                {/if}
              </button>
            </div>
          </div>
        </div>

        <!-- Spec Key-Value Details -->
        <div class="specs-grid">
          {#if modalColorName}
            <div class="spec-item">
              <span class="spec-label">Vendor Color Name</span>
              <span class="spec-value highlight-amethyst">{modalColorName}</span>
            </div>
          {/if}

          <div class="spec-item">
            <span class="spec-label">Material Type</span>
            <span class="spec-value">{selectedFilament.type || 'PLA'}</span>
          </div>

          <div class="spec-item">
            <span class="spec-label">Color Code</span>
            <span class="spec-value mono-val">{selectedFilament.color}</span>
          </div>

          <div class="spec-item">
            <span class="spec-label">Tray / Slot Index</span>
            <span class="spec-value">Filament slot {selectedFilament.id} (in the source file)</span>
          </div>

          <div class="spec-item full-width">
            <span class="spec-label">Full Preset / Settings ID</span>
            <span class="spec-value mono-val preset-val">
              {modalPresetName}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>

  .note-text {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .section-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    margin: 0;
  }

  .badge-emerald {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.18rem 0.55rem;
    border-radius: var(--radius-sm);
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.01em;
  }

  .swatches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .swatch-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.65rem 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .swatch-card:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-focus);
    transform: translateY(-1px);
  }

  .swatch-card.has-color-name:hover {
    border-color: var(--border-focus);
    box-shadow: 0 4px 14px var(--btn-primary-glow);
  }

  .swatch-indicator {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    box-shadow: var(--card-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .slot-num {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .swatch-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .swatch-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .swatch-name {
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .type-tag {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: var(--radius-sm);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
    text-transform: uppercase;
  }

  .swatch-sub-row {
    display: flex;
    align-items: center;
    margin-top: 0.15rem;
    height: 18px;
  }

  .color-product-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.2s ease;
  }

  .swatch-card:hover .color-product-name {
    filter: brightness(1.2);
  }

  .hex-code {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  /* Modal Backdrop */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--modal-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    animation: modalFadeIn 0.2s ease-out;
  }

  @keyframes modalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Modal Card */
  .modal-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-floating);
    border-radius: var(--radius-modal);
    width: 100%;
    max-width: 480px;
    overflow: hidden;
    animation: modalZoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes modalZoomIn {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .modal-header-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-amethyst {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius-pill);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
  }

  .modal-type-tag {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .modal-close-btn:hover {
    color: var(--text-primary);
    background: var(--border-subtle);
  }

  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Modal Hero */
  .modal-hero {
    display: flex;
    align-items: center;
    gap: 1.15rem;
    padding: 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .modal-swatch-large {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 3px solid var(--border-subtle);
    box-shadow: var(--card-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .modal-slot-num {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
  }

  .modal-hero-text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    flex: 1;
  }

  .modal-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.25;
    word-break: break-word;
  }

  .hex-action-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .modal-hex-label {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .copy-hex-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .copy-hex-btn:hover {
    background: var(--badge-accent-bg);
    border-color: var(--border-focus);
    color: var(--accent-strong);
  }

  .copy-hex-btn.copied {
    background: var(--success-glow);
    border-color: var(--success-glow);
    color: var(--success);
  }

  /* Specs Grid */
  .specs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .spec-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .spec-item.full-width {
    grid-column: 1 / -1;
  }

  .spec-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .spec-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    word-break: break-word;
  }

  .spec-value.highlight-amethyst {
    color: var(--accent-strong);
    font-weight: 700;
  }

  .spec-value.mono-val {
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }

  .spec-value.preset-val {
    color: var(--text-secondary);
    font-size: 0.75rem;
    line-height: 1.4;
    max-height: 80px;
    overflow-y: auto;
  }
</style>