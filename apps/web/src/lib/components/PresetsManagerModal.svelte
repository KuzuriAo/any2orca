<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import AdvancedToolTabs from "./AdvancedToolTabs.svelte";
  import HelpTip from "./HelpTip.svelte";
  import { onMount } from "svelte";
  import {
    presetsEngine,
    type Preset,
    type ExtractedPreset,
    type PresetChange,
  } from "../presetsEngine";
  import { parsePresetFile, withoutChanges, MAX_PRESETS_FILE_BYTES, Any2orcaError } from "any2orca";
  import { trapFocus } from "../focusTrap";
  import { getOfferedPresetFiles, type LoadedProjectFile } from "../presetLoadedFiles";
  import {
    nextSortState,
    ariaSortValue,
    sortPresetChanges,
    type PresetSortColumn,
    type SortDirection,
  } from "../tableSort";
  import { loadedFilesStore } from "../loadedFilesState.svelte";

  let {
    onClose,
    onPresetSaved,
    activeToolTab = "presets",
    onToolTabChange,
    loadedFiles,
  }: {
    onClose: () => void;
    onPresetSaved?: (presetName: string) => void;
    activeToolTab?: "presets" | "compare";
    onToolTabChange?: (tab: "presets" | "compare") => void;
    loadedFiles?: LoadedProjectFile[];
  } = $props();

  let activeTab = $state<"create" | "manage">("create");
  let savedPresets = $state<Preset[]>([]);
  let aboveStockMap = $state<Record<string, boolean>>({});
  let isExtracting = $state(false);
  let extractError = $state<string | null>(null);
  let extractedData = $state<ExtractedPreset | null>(null);
  let presetNameInput = $state("");
  let sourceFileName = $state("");

  const effectiveLoadedFiles = $derived((loadedFiles && loadedFiles.length > 0) ? loadedFiles : loadedFilesStore.files);
  const offeredFiles = $derived(getOfferedPresetFiles(effectiveLoadedFiles));
  let batchFilterQuery = $state("");
  let selectedLoadedFileIdx = $state("");

  const filteredOfferedFiles = $derived.by(() => {
    const list = offeredFiles.map((file, originalIndex) => ({ ...file, originalIndex }));
    const query = batchFilterQuery.trim().toLowerCase();
    if (!query) return list;
    return list.filter((item) => item.name.toLowerCase().includes(query));
  });

  let sortColumn = $state<PresetSortColumn | "default">("default");
  let sortDirection = $state<SortDirection>("asc");

  function toggleSort(col: PresetSortColumn) {
    const next = nextSortState({ column: sortColumn, direction: sortDirection }, col);
    sortColumn = next.column;
    sortDirection = next.direction;
  }

  function resetSort() {
    sortColumn = "default";
    sortDirection = "asc";
  }

  // Confirmation modal state for above-stock values
  let showAboveStockModal = $state(false);
  let aboveStockOpener: HTMLElement | null = null;
  let pendingSavePreset = $state<Preset | null>(null);
  let pendingAboveStockChanges = $state<PresetChange[]>([]);
  let rowChoices = $state<Record<string, "keep" | "stock">>({});
  let cancelButtonRef = $state<HTMLButtonElement | null>(null);
  let saveButtonRef = $state<HTMLButtonElement | null>(null);
  let importButtonRef = $state<HTMLButtonElement | null>(null);
  let modalCardRef = $state<HTMLDivElement | null>(null);
  let stockProfilesList = $state<{ id: string; displayName: string }[]>([]);
  let storageError = $state<string | null>(null);
  let isImporting = $state(false);

  // Import queue state for presets needing confirmation
  let pendingImportQueue = $state<Array<{ preset: Preset; aboveStockChanges: PresetChange[] }>>([]);
  let importAddedCount = $state(0);
  let importSkippedList = $state<string[]>([]);
  let isProcessingImport = $state(false);

  // Import feedback state
  let importFeedback = $state<{ added: number; skipped: string[] } | null>(null);
  let deleteConfirmTarget = $state<string | null>(null);

  // File input refs
  let masterFileInput = $state<HTMLInputElement | null>(null);
  let importFileInput = $state<HTMLInputElement | null>(null);
  let isDragOver = $state(false);

  onMount(() => {
    refreshPresets();
    presetsEngine.stockProfiles().then((list) => {
      stockProfilesList = list;
    }).catch(() => {});
  });

  $effect(() => {
    if (showAboveStockModal && cancelButtonRef) {
      cancelButtonRef.focus();
    }
  });

  function refreshPresets() {
    savedPresets = presetsEngine.listPresets();
    storageError = presetsEngine.getStorageError();
    for (const p of savedPresets) {
      presetsEngine.isAboveStock(p).then((above) => {
        aboveStockMap[p.name.toLowerCase()] = above;
      }).catch(() => {});
    }
  }

  function getProfileDisplayName(id: string): string {
    const found = stockProfilesList.find((p) => p.id === id);
    return found ? found.displayName : id;
  }

  function handleExportRawStorage() {
    const raw = presetsEngine.getRawStorage();
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "any2orca-presets-backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleConfirmClearStorage() {
    if (window.confirm("This will erase your unreadable stored presets so you can start fresh. Continue?")) {
      presetsEngine.clearStorage();
      refreshPresets();
    }
  }

  const hasAboveStock = $derived(
    Boolean(extractedData?.changes.some((c) => c.aboveStock))
  );

  async function handleFileSelected(file: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".3mf")) {
      extractError = "Please select a valid .3mf project file.";
      return;
    }

    isExtracting = true;
    extractError = null;
    extractedData = null;
    sourceFileName = file.name;
    resetSort();

    try {
      const result = await presetsEngine.extractPreset(file);
      extractedData = result;
      const baseName = file.name.replace(/\.3mf$/i, "").slice(0, 35);
      presetNameInput = `${baseName} Tuned`.slice(0, 40);
    } catch (err: unknown) {
      if (err instanceof Any2orcaError || (err && typeof err === "object" && "message" in err)) {
        extractError = (err as any).message;
      } else {
        extractError = "Failed to extract settings from archive.";
      }
    } finally {
      isExtracting = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  }

  function handleSaveClick() {
    if (!extractedData) return;
    const trimmedName = presetNameInput.trim().slice(0, 40);
    if (!trimmedName) {
      extractError = "Please enter a preset name.";
      return;
    }

    const candidatePreset: Preset = {
      name: trimmedName,
      base: extractedData.preset.base,
      baseInferred: extractedData.preset.baseInferred,
      catalog: extractedData.preset.catalog,
      changes: extractedData.preset.changes,
      created: extractedData.preset.created,
    };

    const aboveChanges = extractedData.changes.filter((c) => c.aboveStock);
    if (aboveChanges.length > 0) {
      pendingSavePreset = candidatePreset;
      pendingAboveStockChanges = aboveChanges;
      const initial: Record<string, "keep" | "stock"> = {};
      for (const c of aboveChanges) initial[c.key] = "keep";
      rowChoices = initial;
      aboveStockOpener = (document.activeElement as HTMLElement) || null;
      showAboveStockModal = true;
      return;
    }

    commitSave(candidatePreset);
  }

  function commitSave(p: Preset) {
    try {
      presetsEngine.savePreset(p);
      refreshPresets();
      showAboveStockModal = false;
      pendingSavePreset = null;
      pendingAboveStockChanges = [];
      if (onPresetSaved) {
        onPresetSaved(p.name);
      }
      activeTab = "manage";
      setTimeout(() => {
        modalCardRef?.focus();
      }, 0);
    } catch (err: unknown) {
      if (err instanceof Any2orcaError || (err && typeof err === "object" && "message" in err)) {
        extractError = (err as any).message;
      } else {
        extractError = "Failed to save preset.";
      }
    }
  }

  function handleConfirmSaveAnyway() {
    const keysUsingStock = Object.keys(rowChoices).filter((k) => rowChoices[k] === "stock");

    if (isProcessingImport) {
      if (pendingImportQueue.length > 0) {
        const item = pendingImportQueue[0];
        try {
          const presetToSave = withoutChanges(item.preset, keysUsingStock);
          presetsEngine.savePreset(presetToSave);
          importAddedCount++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to save preset";
          importSkippedList.push(`Preset "${item.preset.name}": ${msg}`);
        }
        pendingImportQueue = pendingImportQueue.slice(1);
        processNextImportConfirmation();
      }
      return;
    }

    if (pendingSavePreset) {
      const presetToSave = withoutChanges(pendingSavePreset, keysUsingStock);
      commitSave(presetToSave);
    }
  }

  function handleKeepAll() {
    const updated: Record<string, "keep" | "stock"> = {};
    for (const c of pendingAboveStockChanges) updated[c.key] = "keep";
    rowChoices = updated;
  }

  function handleUseStockAll() {
    const updated: Record<string, "keep" | "stock"> = {};
    for (const c of pendingAboveStockChanges) updated[c.key] = "stock";
    rowChoices = updated;
  }

  function handleCancelAboveStock() {
    if (isProcessingImport) {
      if (pendingImportQueue.length > 0) {
        const item = pendingImportQueue[0];
        importSkippedList.push(`Preset \"${item.preset.name}\": Above-stock speeds were not agreed to.`);
        pendingImportQueue = pendingImportQueue.slice(1);
        processNextImportConfirmation();
      }
      return;
    }

    showAboveStockModal = false;
    pendingSavePreset = null;
    pendingAboveStockChanges = [];
    setTimeout(() => {
      saveButtonRef?.focus();
    }, 0);
  }

  function processNextImportConfirmation() {
    if (pendingImportQueue.length > 0) {
      const nextItem = pendingImportQueue[0];
      pendingAboveStockChanges = nextItem.aboveStockChanges;
      const initial: Record<string, "keep" | "stock"> = {};
      for (const c of nextItem.aboveStockChanges) initial[c.key] = "keep";
      rowChoices = initial;
      showAboveStockModal = true;
    } else {
      showAboveStockModal = false;
      isProcessingImport = false;
      refreshPresets();
      importFeedback = {
        added: importAddedCount,
        skipped: importSkippedList,
      };
      setTimeout(() => {
        importButtonRef?.focus();
      }, 0);
    }
  }

  function handleDeletePreset(name: string) {
    presetsEngine.deletePreset(name);
    refreshPresets();
    deleteConfirmTarget = null;
  }

  function handleExport() {
    const jsonText = presetsEngine.exportPresets();
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "any2orca-presets.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    if (!file) return;
    importFeedback = null;
    if (file.size > MAX_PRESETS_FILE_BYTES) {
      importFeedback = {
        added: 0,
        skipped: ["This presets file is larger than the 1 MB a presets file can be."],
      };
      return;
    }

    isImporting = true;
    try {
      const text = await file.text();
      const parsedFile = parsePresetFile(text);
      const existing = presetsEngine.listPresets();
      const toConfirm: Array<{ preset: Preset; aboveStockChanges: PresetChange[] }> = [];
      let added = 0;
      const skipped: string[] = [];

      for (const p of parsedFile.presets) {
        if (existing.some((e) => e.name.toLowerCase() === p.name.toLowerCase())) {
          skipped.push(`Preset \"${p.name}\": A preset with this name already exists.`);
          continue;
        }

        try {
          const resolved = await presetsEngine.resolvePreset(p);
          const aboveChanges = resolved.described.filter((c) => c.aboveStock);
          if (aboveChanges.length > 0) {
            toConfirm.push({ preset: p, aboveStockChanges: aboveChanges });
          } else {
            presetsEngine.savePreset(p);
            added++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to resolve preset";
          skipped.push(`Preset \"${p.name}\": ${msg}`);
        }
      }

      if (toConfirm.length > 0) {
        pendingImportQueue = toConfirm;
        importAddedCount = added;
        importSkippedList = skipped;
        isProcessingImport = true;
        processNextImportConfirmation();
      } else {
        refreshPresets();
        importFeedback = { added, skipped };
        setTimeout(() => {
          importButtonRef?.focus();
        }, 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to read presets file.";
      importFeedback = {
        added: 0,
        skipped: [msg],
      };
    } finally {
      isImporting = false;
    }
  }

  let isActive = $derived(activeToolTab === "presets");

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!isActive) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      if (showAboveStockModal) {
        handleCancelAboveStock();
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div
  class="modal-overlay"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  role="presentation"
>
  <div
    class="modal-card presets-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="presets-modal-title"
    tabindex="-1"
    bind:this={modalCardRef}
    inert={showAboveStockModal}
    use:trapFocus={isActive && !showAboveStockModal}
  >
    <div class="modal-header">
      <div class="header-badge-row">
        <span class="badge badge-accent">
          Advanced Tool
        </span>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <AdvancedToolTabs activeTab={activeToolTab} onTabChange={onToolTabChange} />

      <h2 id="presets-modal-title" class="modal-title">Tuned Print Presets</h2>
      <p class="modal-subtitle">
        Extract your calibrated slicing parameters from a master 3MF, or manage saved presets.
      </p>

      {#if storageError}
        <div class="error-banner storage-alert-banner" role="alert">
          <div class="storage-alert-text">{storageError}</div>
          <div class="storage-alert-actions">
            <button
              type="button"
              class="btn btn-secondary btn-xs"
              onclick={handleExportRawStorage}
            >
              Export what's stored
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-xs"
              onclick={handleConfirmClearStorage}
            >
              Start over
            </button>
          </div>
        </div>
      {/if}

      <div class="tab-nav" role="tablist">
        <button
          type="button"
          class="tab-btn"
          class:is-active={activeTab === "create"}
          onclick={() => (activeTab = "create")}
          role="tab"
          aria-selected={activeTab === "create"}
        >
          Make Preset
        </button>
        <button
          type="button"
          class="tab-btn"
          class:is-active={activeTab === "manage"}
          onclick={() => (activeTab = "manage")}
          role="tab"
          aria-selected={activeTab === "manage"}
        >
          Saved Presets ({savedPresets.length})
        </button>
      </div>
    </div>

    <div class="modal-body">
      {#if activeTab === "create"}
        <!-- Make Preset Section -->
        <div class="tab-content">
          {#if !extractedData && !isExtracting}
            {#if offeredFiles.length > 0}
              <div class="loaded-files-panel" data-testid="already-loaded-control">
                <div class="loaded-files-header">
                  <span class="loaded-files-label">
                    Use a file you've already loaded
                  </span>
                  <HelpTip
                    id="presets-already-loaded"
                    title="Use a loaded file"
                    testId="helptip-btn-already-loaded"
                  >
                    <p>
                      A preset can be made from a Snapmaker Orca project you've loaded, or from the converted output of a file in this session. A converted output carries your settings over Snapmaker's stock profile. Projects from other slicers cannot make a preset until they are converted and tuned in Snapmaker Orca.
                    </p>
                  </HelpTip>
                </div>

                {#if offeredFiles.length === 1}
                  {@const single = offeredFiles[0]}
                  <div class="loaded-files-single">
                    <button
                      type="button"
                      class="btn btn-secondary loaded-file-btn"
                      disabled={single.disabled}
                      onclick={() => !single.disabled && handleFileSelected(single.file)}
                      title={single.disabled ? single.disabledReason : `Use ${single.name}`}
                      data-testid="use-loaded-file-btn"
                    >
                      <span class="loaded-file-name">{single.name}</span>
                      {#if single.disabled}
                        <span class="loaded-file-reason"> — {single.disabledReason}</span>
                      {/if}
                    </button>
                  </div>
                {:else}
                  <div class="loaded-files-batch">
                    {#if offeredFiles.length > 20}
                      <input
                        type="search"
                        class="loaded-files-search"
                        placeholder="Search loaded files..."
                        bind:value={batchFilterQuery}
                        aria-label="Filter loaded files"
                        data-testid="loaded-files-search"
                      />
                    {/if}
                    <select
                      id="loaded-files-select"
                      class="loaded-files-select"
                      aria-label="Use a file you've already loaded"
                      data-testid="loaded-files-select"
                      bind:value={selectedLoadedFileIdx}
                      onchange={(e) => {
                        const target = e.target as HTMLSelectElement;
                        const idx = Number(target.value);
                        if (!isNaN(idx) && offeredFiles[idx] && !offeredFiles[idx].disabled) {
                          handleFileSelected(offeredFiles[idx].file);
                          target.value = "";
                        }
                      }}
                    >
                      <option value="" disabled selected>Choose a loaded file...</option>
                      {#each filteredOfferedFiles as item}
                        <option value={item.originalIndex} disabled={item.disabled}>
                          {item.name}{item.disabled ? ` — ${item.disabledReason}` : (item.isConvertedOutput ? " (Converted)" : "")}
                        </option>
                      {/each}
                    </select>
                  </div>
                {/if}
              </div>
            {/if}

            <div
              class="drop-area"
              class:is-dragover={isDragOver}
              role="presentation"
              ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
              ondragleave={() => (isDragOver = false)}
              ondrop={handleDrop}
            >
              <div class="drop-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>

              <div class="drop-text-group">
                <p class="drop-title">Drop your tuned Snapmaker Orca .3mf project</p>
                <p class="drop-subtitle">
                  Your changed walls, infill, supports and speeds become a reusable preset.
                </p>
              </div>

              <input
                type="file"
                accept=".3mf"
                class="sr-only"
                bind:this={masterFileInput}
                onchange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files.length > 0) {
                    handleFileSelected(target.files[0]);
                  }
                }}
              />

              <button
                type="button"
                class="btn btn-secondary select-file-btn"
                onclick={() => masterFileInput?.click()}
              >
                Choose Master 3MF
              </button>
            </div>
          {/if}

          {#if isExtracting}
            <div class="loading-state">
              <span class="spinner-loader" aria-hidden="true"></span>
              <span>Reading project settings and matching base profile...</span>
            </div>
          {/if}

          {#if extractedData}
            <div class="extracted-review">
              <div class="extracted-summary-card">
                <div class="summary-row">
                  <span class="summary-label">Source File</span>
                  <span class="summary-val">{sourceFileName}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Base Profile</span>
                  <div class="summary-profile-wrap">
                    <span class="summary-val">{getProfileDisplayName(extractedData.preset.base)}</span>
                    <span class="summary-val-id font-mono text-muted">{extractedData.preset.base}</span>
                    {#if extractedData.preset.baseInferred}
                      <span class="badge badge-accent">matched from nozzle and layer height</span>
                    {/if}
                  </div>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Differences from Stock</span>
                  <span class="summary-val font-mono">{extractedData.changes.length} parameter(s)</span>
                </div>

                {#if extractedData.notes.length > 0}
                  <div class="notes-list">
                    {#each extractedData.notes as note}
                      <div class="note-item">
                        <span class="note-bullet">•</span>
                        <span>{note}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              {#if extractedData.changes.length > 0}
                {@const sortedChanges = sortPresetChanges(extractedData.changes, sortColumn, sortDirection)}
                <div class="changes-table-wrapper">
                  {#if sortColumn !== "default"}
                    <div class="table-toolbar">
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs reset-sort-btn"
                        onclick={resetSort}
                        title="Restore default order"
                        data-testid="reset-sort-btn"
                      >
                        Reset sort
                      </button>
                    </div>
                  {/if}
                  <div class="table-container">
                    <table class="changes-table" aria-label="Detected parameter changes">
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            class="th-param"
                            aria-sort={ariaSortValue({ column: sortColumn, direction: sortDirection }, "param")}
                          >
                            <button
                              type="button"
                              class="th-sort-btn"
                              onclick={() => toggleSort("param")}
                              data-testid="sort-param-btn"
                            >
                              <span>Setting Parameter</span>
                              <span class="sort-icon" aria-hidden="true">
                                {#if sortColumn === "param"}
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                {:else}
                                  ↕
                                {/if}
                              </span>
                            </button>
                          </th>
                          <th
                            scope="col"
                            class="th-stock"
                            aria-sort={ariaSortValue({ column: sortColumn, direction: sortDirection }, "stock")}
                          >
                            <button
                              type="button"
                              class="th-sort-btn"
                              onclick={() => toggleSort("stock")}
                              data-testid="sort-stock-btn"
                            >
                              <span>Stock U1 Value</span>
                              <span class="sort-icon" aria-hidden="true">
                                {#if sortColumn === "stock"}
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                {:else}
                                  ↕
                                {/if}
                              </span>
                            </button>
                          </th>
                          <th
                            scope="col"
                            class="th-yours"
                            aria-sort={ariaSortValue({ column: sortColumn, direction: sortDirection }, "yours")}
                          >
                            <button
                              type="button"
                              class="th-sort-btn"
                              onclick={() => toggleSort("yours")}
                              data-testid="sort-yours-btn"
                            >
                              <span>Your Tuned Value</span>
                              <span class="sort-icon" aria-hidden="true">
                                {#if sortColumn === "yours"}
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                {:else}
                                  ↕
                                {/if}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each sortedChanges as change (change.key)}
                          <tr>
                            <td class="param-cell">
                              <span class="param-label">{change.label}</span>
                              <code class="param-key">{change.key}</code>
                              {#if change.aboveStock}
                                <span class="badge badge-warning">Above-Stock</span>
                              {/if}
                            </td>
                            <td class="stock-cell font-mono">{change.stock}</td>
                            <td class="yours-cell font-mono" class:above-stock-text={change.aboveStock}>
                              {change.yours}
                              {#if change.cappedAt !== undefined}
                                <span class="capped-text"> (capped at {change.cappedAt} by the U1)</span>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {:else}
                <div class="no-changes-box">
                  No parameter differences found compared with stock profile.
                </div>
              {/if}

              <div class="save-preset-bar">
                <div class="name-input-group">
                  <label for="preset-name-field" class="name-label">Preset Name:</label>
                  <input
                    id="preset-name-field"
                    type="text"
                    maxlength="40"
                    bind:value={presetNameInput}
                    placeholder="e.g. Rapid PLA 0.20mm"
                    class="name-input"
                  />
                  <span class="char-count">{presetNameInput.length}/40</span>
                </div>

                <div class="save-actions">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick={() => { extractedData = null; extractError = null; resetSort(); }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    bind:this={saveButtonRef}
                    onclick={handleSaveClick}
                  >
                    Save Preset
                  </button>
                </div>
              </div>
            </div>
          {/if}

          {#if extractError}
            <div class="error-banner" role="alert">
              <span>{extractError}</span>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Saved Presets List Section -->
        <div class="tab-content">
          <div class="manage-toolbar">
            <div class="toolbar-title">Saved Custom Presets ({savedPresets.length})</div>
            <div class="toolbar-actions">
              <input
                type="file"
                accept=".json"
                class="sr-only"
                bind:this={importFileInput}
                onchange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files.length > 0) {
                    handleImportFile(target.files[0]);
                  }
                }}
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                bind:this={importButtonRef}
                onclick={() => importFileInput?.click()}
                title="Import presets from JSON file"
              >
                Import JSON
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onclick={handleExport}
                disabled={savedPresets.length === 0}
                title="Download any2orca-presets.json"
              >
                Export JSON
              </button>
            </div>
          </div>

          {#if isImporting}
            <div class="loading-state" role="status" aria-live="polite">
              <span class="spinner-loader" aria-hidden="true"></span>
              <span>Validating and resolving imported presets...</span>
            </div>
          {/if}

          {#if importFeedback}
            <div class="import-feedback-box">
              <div class="feedback-heading">
                Import complete: <strong>{importFeedback.added}</strong> added, <strong>{importFeedback.skipped.length}</strong> skipped.
              </div>
              {#if importFeedback.skipped.length > 0}
                <ul class="feedback-skipped-list">
                  {#each importFeedback.skipped as skip}
                    <li>{skip}</li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}

          {#if savedPresets.length === 0}
            <div class="empty-list-box">
              <p>No presets saved yet.</p>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                onclick={() => (activeTab = "create")}
              >
                Make Your First Preset
              </button>
            </div>
          {:else}
            <div class="presets-list">
              {#each savedPresets as preset (preset.name)}
                <div class="preset-item-card">
                  <div class="preset-item-main">
                    <div class="preset-item-header">
                      <span class="preset-name">{preset.name}</span>
                      {#if aboveStockMap[preset.name.toLowerCase()]}
                        <span class="badge badge-warning">Above-Stock</span>
                      {/if}
                    </div>
                    <div class="preset-meta-row">
                      <span class="preset-meta-base">Base: {getProfileDisplayName(preset.base)} <span class="font-mono text-muted">({preset.base})</span></span>
                      <span class="bullet">•</span>
                      <span>{Object.keys(preset.changes).length} changes</span>
                    </div>
                  </div>

                  <div class="preset-item-actions">
                    {#if deleteConfirmTarget === preset.name}
                      <span class="confirm-text">Delete?</span>
                      <button
                        type="button"
                        class="btn btn-danger btn-xs"
                        onclick={() => handleDeletePreset(preset.name)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs"
                        onclick={() => (deleteConfirmTarget = null)}
                      >
                        Cancel
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm delete-btn"
                        onclick={() => (deleteConfirmTarget = preset.name)}
                        aria-label={`Delete ${preset.name}`}
                      >
                        Delete
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose}>Done</button>
    </div>
  </div>
</div>

<!-- Above-Stock Safety Confirmation Modal -->
{#if showAboveStockModal}
  <div
    class="modal-overlay nested-overlay"
    onclick={(e) => e.target === e.currentTarget && handleCancelAboveStock()}
    role="presentation"
  >
    <div
      class="modal-card confirmation-card"
      role="alertdialog"
      tabindex="-1"
      use:trapFocus={isActive && showAboveStockModal}
      aria-modal="true"
      aria-labelledby="confirm-heading"
      aria-describedby="confirm-disclaimer"
    >
      <div class="modal-body confirm-body">
        <p id="confirm-heading" class="confirm-title-bold">
          {pendingAboveStockChanges.length === 1
            ? "This setting is faster than Snapmaker's stock profile:"
            : "These settings are faster than Snapmaker's stock profile:"}
        </p>

        <div class="above-stock-shortcuts">
          <button type="button" class="btn btn-secondary btn-xs" onclick={handleKeepAll}>Keep all</button>
          <button type="button" class="btn btn-secondary btn-xs" onclick={handleUseStockAll}>Use stock for all</button>
        </div>

        <div class="above-stock-table-wrapper">
          <table class="above-stock-table" aria-label="Above-stock settings choices">
            <thead>
              <tr>
                <th scope="col" class="th-setting">Setting</th>
                <th scope="col" class="th-choice">Choice</th>
              </tr>
            </thead>
            <tbody>
              {#each pendingAboveStockChanges as change (change.key)}
                {@const choice = rowChoices[change.key] ?? "keep"}
                <tr class="above-stock-row">
                  <td class="above-stock-setting-col">
                    <span class="above-stock-text-line">
                      {change.label}: <strong>{change.yours}</strong> (stock {change.stock})
                    </span>
                  </td>
                  <td class="above-stock-choice-col">
                    <fieldset class="row-choice-fieldset">
                      <legend class="sr-only">Choice for {change.label}</legend>
                      <label class="choice-radio-label">
                        <input
                          type="radio"
                          name="choice-{change.key}"
                          value="keep"
                          checked={choice === "keep"}
                          onchange={() => (rowChoices[change.key] = "keep")}
                        />
                        <span>{change.cappedAt !== undefined ? `Keep (capped at ${change.cappedAt} by the U1)` : "Keep mine"}</span>
                      </label>
                      <label class="choice-radio-label">
                        <input
                          type="radio"
                          name="choice-{change.key}"
                          value="stock"
                          checked={choice === "stock"}
                          onchange={() => (rowChoices[change.key] = "stock")}
                        />
                        <span>Use stock</span>
                      </label>
                    </fieldset>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <p id="confirm-disclaimer" class="warning-disclaimer-text">
          The U1's machine limits still apply, but faster isn't safe for every filament or model. Check them with a test print.
        </p>
      </div>

      <div class="modal-footer confirm-footer">
        <button
          type="button"
          class="btn btn-primary"
          aria-label="Save anyway"
          onclick={handleConfirmSaveAnyway}
        >
          Save
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          bind:this={cancelButtonRef}
          onclick={handleCancelAboveStock}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .presets-modal {
    max-width: 760px;
  }

  .nested-overlay {
    z-index: 105;
    animation: none;
  }

  .confirmation-card {
    max-width: 540px;
    background: var(--modal-bg);
    border: 1px solid var(--border-subtle);
    animation: none;
  }

  .confirm-body {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding-top: 1.25rem;
  }

  .confirm-title-bold {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.4;
  }


  .above-stock-shortcuts {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .above-stock-table-wrapper {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    margin-bottom: 0.75rem;
  }

  .above-stock-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .above-stock-table th {
    background: var(--bg-card);
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.725rem;
    text-transform: uppercase;
  }

  .above-stock-table td {
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    vertical-align: middle;
  }

  .th-setting { width: 55%; }
  .th-choice { width: 45%; }

  .row-choice-fieldset {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.65rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .choice-radio-label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.775rem;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .choice-radio-label input[type="radio"] {
    cursor: pointer;
    accent-color: var(--accent);
  }

  .choice-radio-label:hover {
    color: var(--text-primary);
  }

  .above-stock-text-line strong {
    color: var(--warning);
  }

  .capped-text {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .warning-disclaimer-text {
    color: var(--text-secondary);
    font-size: 0.85rem;
    line-height: 1.5;
    margin: 0.25rem 0 0;
  }

  .confirm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .header-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }

  .tab-nav {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
    margin-top: 1rem;
  }

  .tab-btn {
    background: transparent;
    border: none;
    padding: 0.5rem 0.85rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
  }

  .tab-btn:hover:not(.is-active) {
    color: var(--text-primary);
  }

  .tab-btn.is-active {
    color: var(--accent-strong);
    border-bottom-color: var(--accent-strong);
  }

  .loaded-files-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.85rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .loaded-files-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .loaded-files-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .loaded-files-single {
    display: flex;
    align-items: center;
  }

  .loaded-file-btn {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    text-align: left;
    padding: 0.45rem 0.85rem;
    font-size: 0.85rem;
  }

  .loaded-file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
  }

  .loaded-file-reason {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: normal;
  }

  .loaded-files-batch {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .loaded-files-search {
    width: 100%;
    padding: 0.4rem 0.65rem;
    font-size: 0.8rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
  }

  .loaded-files-search:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .loaded-files-select {
    width: 100%;
    padding: 0.45rem 0.75rem;
    font-size: 0.85rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    cursor: pointer;
  }

  .loaded-files-select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .drop-area {
    border: 2px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 2.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    text-align: center;
    background: var(--bg-input);
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .drop-area.is-dragover {
    border-color: var(--accent-strong);
    background: var(--btn-secondary-bg);
  }

  .drop-icon {
    color: var(--accent-strong);
  }

  .drop-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary);
    margin: 0 0 0.35rem 0;
  }

  .drop-subtitle {
    font-size: 0.825rem;
    color: var(--text-secondary);
    max-width: 440px;
    margin: 0;
    line-height: 1.4;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .spinner-loader {
    width: 22px;
    height: 22px;
    border: 2.5px solid var(--border-subtle);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .extracted-summary-card {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.825rem;
  }

  .summary-label {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .summary-profile-wrap {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .summary-val {
    color: var(--text-primary);
    font-weight: 600;
  }

  .notes-list {
    margin-top: 0.35rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.775rem;
    color: var(--text-secondary);
  }

  .note-item {
    display: flex;
    gap: 0.4rem;
  }

  .note-bullet {
    color: var(--accent-strong);
  }

  .table-container {
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: 1rem;
  }

  .changes-table-wrapper {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
  }

  .table-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.4rem;
  }

  .th-sort-btn {
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: inherit;
  }

  .th-sort-btn:hover {
    color: var(--text-primary);
  }

  .th-sort-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .sort-icon {
    font-size: 0.65rem;
    opacity: 0.75;
  }

  .changes-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .changes-table th {
    position: sticky;
    top: 0;
    background: var(--bg-input);
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    z-index: 1;
  }

  .changes-table td {
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }

  .param-cell {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .param-label {
    font-weight: 600;
  }

  .param-key {
    font-size: 0.725rem;
    color: var(--text-muted);
  }

  .above-stock-text {
    color: var(--warning);
    font-weight: 700;
  }

  .badge-warning {
    display: inline-block;
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    color: var(--warning);
    width: fit-content;
  }

  .badge-accent {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    border-radius: var(--radius-sm);
    color: var(--accent-strong);
  }

  .no-changes-box {
    padding: 1.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .save-preset-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.85rem 1rem;
  }

  .name-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 220px;
  }

  .name-label {
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .name-input {
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    padding: 0.45rem 0.65rem;
    font-size: 0.85rem;
    outline: none;
  }

  .name-input:focus {
    border-color: var(--accent);
  }

  .char-count {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .save-actions {
    display: flex;
    gap: 0.5rem;
  }

  .manage-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .toolbar-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .toolbar-actions {
    display: flex;
    gap: 0.45rem;
  }

  .import-feedback-box {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.8rem;
  }

  .feedback-heading {
    color: var(--text-primary);
  }

  .feedback-skipped-list {
    margin: 0.4rem 0 0;
    padding-left: 1.25rem;
    color: var(--danger);
    font-size: 0.75rem;
  }

  .empty-list-box {
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .presets-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 340px;
    overflow-y: auto;
  }

  .preset-item-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
  }

  .preset-item-main {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .preset-item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .preset-name {
    font-weight: 700;
    font-size: 0.88rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preset-meta-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .bullet {
    opacity: 0.5;
  }

  .preset-item-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .confirm-text {
    font-size: 0.75rem;
    color: var(--danger);
    font-weight: 600;
  }

  .delete-btn {
    color: var(--text-muted);
  }

  .delete-btn:hover {
    color: var(--danger);
  }

  .error-banner {
    margin-top: 0.75rem;
    padding: 0.65rem 0.85rem;
    border-radius: var(--radius-sm);
    background: var(--btn-secondary-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 0.8rem;
  }

  .btn-xs {
    padding: 0.2rem 0.5rem;
    font-size: 0.725rem;
  }

  .btn-danger {
    background: var(--danger);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
  }

  .summary-val-id {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-left: 0.35rem;
  }

  .storage-alert-banner {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .storage-alert-text {
    line-height: 1.4;
  }

  .storage-alert-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

</style>
