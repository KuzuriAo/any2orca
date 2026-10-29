<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import AdvancedToolTabs from "./AdvancedToolTabs.svelte";
  import { trapFocus } from "../focusTrap";
  import {
    presetsEngine,
    type DiffResult,
    type DiffGroup,
    type DiffRow,
  } from "../presetsEngine";
  import { valueLayoutNotes } from "any2orca";

  let {
    onClose,
    initialFile = null,
    activeToolTab = "compare",
    onToolTabChange,
  }: {
    onClose: () => void;
    initialFile?: File | null;
    activeToolTab?: "presets" | "compare";
    onToolTabChange?: (tab: "presets" | "compare") => void;
  } = $props();

  let fileA = $state<File | null>(null);
  $effect(() => {
    if (initialFile && !fileA) {
      fileA = initialFile;
    }
  });
  let fileB = $state<File | null>(null);

  let bMode = $state<"stock" | "preset" | "file">("stock");
  let selectedStockProfile = $state<string>("");
  let selectedPresetName = $state<string>("");
  let isMatchingProfile = $state(false);

  let isLoading = $state(false);
  let diffResult = $state<DiffResult | null>(null);
  let diffError = $state<string | null>(null);

  let searchFilter = $state("");
  let differencesOnly = $state(true);
  let attentionOnly = $state(false);
  import { copyTextToClipboard } from "../clipboard";
  let copyFeedback = $state<"copied" | "failed" | null>(null);

  type SortColumn = "default" | "setting" | "status";
  type SortDirection = "asc" | "desc";

  let sortColumn = $state<SortColumn>("default");
  let sortDirection = $state<SortDirection>("asc");

  function toggleSort(col: "setting" | "status") {
    if (sortColumn !== col) {
      sortColumn = col;
      sortDirection = "asc";
    } else if (sortDirection === "asc") {
      sortDirection = "desc";
    } else {
      sortColumn = "default";
      sortDirection = "asc";
    }
  }

  function resetSort() {
    sortColumn = "default";
    sortDirection = "asc";
  }

  const hasAttention = $derived.by(() => {
    if (!diffResult) return false;
    return diffResult.groups.some((g) => g.rows.some((r) => Boolean(r.attention)));
  });

  const ATTENTION_RANK: Record<string, number> = {
    "above-limit": 0,
    "above-stock": 1,
  };

  const STATUS_RANK: Record<DiffRow["status"], number> = {
    changed: 0,
    "only-a": 1,
    "only-b": 2,
    unmatched: 3,
    same: 4,
  };

  let fileAInput = $state<HTMLInputElement | null>(null);
  let fileBInput = $state<HTMLInputElement | null>(null);

  let collapsedSections = $state<Record<string, boolean>>({});

  function toggleSection(sectionKey: string) {
    collapsedSections[sectionKey] = !collapsedSections[sectionKey];
  }




  function isCollapsed(sectionKey: string): boolean {
    return Boolean(collapsedSections[sectionKey]);
  }

  interface SectionGroup {
    title: string;
    rows: DiffRow[];
  }

  interface PageGroup {
    name: string;
    rowsCount: number;
    sections: SectionGroup[];
  }

  interface PreparedGroupData {
    isFlattened: boolean;
    flattenedRows: DiffRow[];
    attentionRows: DiffRow[];
    pages: PageGroup[];
    notOnPageRows: DiffRow[];
  }

  function prepareGroupData(
    group: DiffGroup,
    rows: DiffRow[],
    sortCol: SortColumn
  ): PreparedGroupData {
    const isSettingsGroup = group.group === "print" || group.group === "filament" || group.group === "machine";
    if (sortCol === "status" || !isSettingsGroup) {
      return {
        isFlattened: true,
        flattenedRows: rows,
        attentionRows: [],
        pages: [],
        notOnPageRows: [],
      };
    }

    const attentionRows = rows.filter((r) => Boolean(r.attention));
    const normalRows = rows.filter((r) => !r.attention);

    const pageMap = new Map<string, PageGroup>();
    const notOnPageRows: DiffRow[] = [];

    for (const row of normalRows) {
      if (!row.page) {
        notOnPageRows.push(row);
        continue;
      }

      let pageGroup = pageMap.get(row.page);
      if (!pageGroup) {
        pageGroup = { name: row.page, rowsCount: 0, sections: [] };
        pageMap.set(row.page, pageGroup);
      }
      pageGroup.rowsCount++;

      const sectionTitle = row.section ? `${row.page} > ${row.section}` : row.page;
      let sectionGroup = pageGroup.sections.find((s) => s.title === sectionTitle);
      if (!sectionGroup) {
        sectionGroup = { title: sectionTitle, rows: [] };
        pageGroup.sections.push(sectionGroup);
      }
      sectionGroup.rows.push(row);
    }

    const PAGE_ORDER = ["Quality", "Strength", "Speed", "Support", "Multimaterial", "Others"];
    const pages = Array.from(pageMap.values()).sort((a, b) => {
      const idxA = PAGE_ORDER.indexOf(a.name);
      const idxB = PAGE_ORDER.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      isFlattened: false,
      flattenedRows: [],
      attentionRows,
      pages,
      notOnPageRows,
    };
  }

  function getRowDisplayName(row: DiffRow, inSection: boolean): string {
    if (!inSection) return row.label;
    if (row.label.includes(" > ")) {
      const parts = row.label.split(" > ");
      return parts[parts.length - 1];
    }
    return row.label;
  }

  let stockProfilesList = $state<{ id: string; displayName: string }[]>([]);

  $effect(() => {
    presetsEngine.stockProfiles().then((list) => {
      stockProfilesList = list;
    }).catch(() => {
      stockProfilesList = [];
    });
  });

  $effect(() => {
    const currentFile = fileA;
    if (!currentFile) {
      isMatchingProfile = false;
      return;
    }

    let active = true;
    isMatchingProfile = true;

    presetsEngine
      .matchProfileForFile(currentFile)
      .then((matchedId) => {
        if (!active) return;
        if (matchedId) {
          selectedStockProfile = matchedId;
        } else if (!selectedStockProfile && stockProfilesList.length > 0) {
          selectedStockProfile = stockProfilesList[0].id;
        }
      })
      .catch(() => {
        if (!active) return;
        if (!selectedStockProfile && stockProfilesList.length > 0) {
          selectedStockProfile = stockProfilesList[0].id;
        }
      })
      .finally(() => {
        if (active) {
          isMatchingProfile = false;
        }
      });

    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (!isMatchingProfile && !selectedStockProfile && stockProfilesList.length > 0) {
      selectedStockProfile = stockProfilesList[0].id;
    }
  });

  const savedPresetsList = presetsEngine.listPresets();

  $effect(() => {
    if (savedPresetsList.length > 0 && !selectedPresetName) {
      selectedPresetName = savedPresetsList[0].name;
    }
  });

  let diffSeq = 0;

  // Automatically compute diff whenever selection changes
  $effect(() => {
    const _a = fileA;
    const _bMode = bMode;
    const _stock = selectedStockProfile;
    const _preset = selectedPresetName;
    const _b = fileB;
    const _matching = isMatchingProfile;
    runDiff();
  });

  async function runDiff() {
    if (!fileA) {
      diffResult = null;
      diffError = null;
      isLoading = false;
      return;
    }

    if (bMode === "stock") {
      if (isMatchingProfile || !selectedStockProfile) {
        isLoading = true;
        diffError = null;
        return;
      }
    } else if (bMode === "preset") {
      if (!selectedPresetName && savedPresetsList.length > 0) {
        selectedPresetName = savedPresetsList[0].name;
      }
    } else if (bMode === "file") {
      if (!fileB) {
        diffResult = null;
        diffError = null;
        isLoading = false;
        return;
      }
    }

    let bParam: File | { stock: string } | { preset: string };
    if (bMode === "stock") {
      bParam = { stock: selectedStockProfile };
    } else if (bMode === "preset") {
      bParam = { preset: selectedPresetName || "Default" };
    } else {
      bParam = fileB!;
    }

    const currentSeq = ++diffSeq;
    isLoading = true;
    diffError = null;

    try {
      const result = await presetsEngine.diff(fileA, bParam, { includeUnchanged: true });
      if (currentSeq !== diffSeq) return;
      diffResult = result;
      diffError = null;
    } catch (err: unknown) {
      if (currentSeq !== diffSeq) return;
      const errObj = err as { message?: string };
      diffError = errObj.message || "Failed to calculate settings diff.";
      diffResult = null;
    } finally {
      if (currentSeq === diffSeq) {
        isLoading = false;
      }
    }
  }

  function getGroupTitle(group: DiffGroup): string {
    switch (group.group) {
      case "print":
        return "Print Settings";
      case "filament":
        return group.slot ? `Filament Slot ${group.slot}` : "Filament Settings";
      case "machine":
        return "Machine Settings";
      case "other":
        return "Other Settings";
      default:
        return "General Settings";
    }
  }

  const filteredGroups = $derived.by(() => {
    if (!diffResult) return [];
    const query = searchFilter.trim().toLowerCase();

    const order: Array<DiffGroup["group"]> = ["print", "filament", "machine", "other"];
    const sorted = [...diffResult.groups].sort((a, b) => {
      const idxA = order.indexOf(a.group);
      const idxB = order.indexOf(b.group);
      if (idxA !== idxB) return idxA - idxB;
      return (a.slot || 0) - (b.slot || 0);
    });

    return sorted
      .map((g) => {
        const originalIndex = new Map(g.rows.map((r, i) => [r, i]));
        const rows = g.rows
          .filter((row: DiffRow) => {
            if (attentionOnly && !row.attention) {
              return false;
            }
            if (differencesOnly && row.status === "same") {
              return false;
            }
            if (!query) return true;
            const aText = row.a ?? "(not set)";
            const bText = row.b ?? "(not set)";
            return (
              row.label.toLowerCase().includes(query) ||
              row.key.toLowerCase().includes(query) ||
              aText.toLowerCase().includes(query) ||
              bText.toLowerCase().includes(query)
            );
          })
          .sort((x, y) => {
            if (sortColumn === "setting") {
              const cmp = x.label.localeCompare(y.label);
              if (cmp !== 0) {
                return sortDirection === "asc" ? cmp : -cmp;
              }
              return (originalIndex.get(x) ?? 0) - (originalIndex.get(y) ?? 0);
            }

            if (sortColumn === "status") {
              const rankX = STATUS_RANK[x.status];
              const rankY = STATUS_RANK[y.status];
              if (rankX !== rankY) {
                return sortDirection === "asc" ? rankX - rankY : rankY - rankX;
              }
              return (originalIndex.get(x) ?? 0) - (originalIndex.get(y) ?? 0);
            }

            // Default order: attention first (above-limit then above-stock), then engine order
            const rankX = x.attention ? ATTENTION_RANK[x.attention] : 2;
            const rankY = y.attention ? ATTENTION_RANK[y.attention] : 2;
            if (rankX !== rankY) {
              return rankX - rankY;
            }
            return (originalIndex.get(x) ?? 0) - (originalIndex.get(y) ?? 0);
          });

        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0);
  });

  function handleExportJson() {
    if (!diffResult) return;
    const jsonStr = JSON.stringify(diffResult, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "any2orca-settings-diff.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopyText() {
    if (!diffResult) return;
    let text = `Settings Diff: ${diffResult.aLabel} vs ${diffResult.bLabel}\n\n`;

    for (const group of diffResult.groups) {
      text += `=== ${getGroupTitle(group)} ===\n`;
      for (const row of group.rows) {
        const aVal = row.a !== null ? row.a : "(not set)";
        const bVal = row.b !== null ? row.b : "(not set)";
        text += `  [${getStatusLabel(row.status).toUpperCase()}] ${row.label} [${row.key}]: ${aVal} -> ${bVal}\n`;
      }
      text += "\n";
    }

    const ok = await copyTextToClipboard(text);
    copyFeedback = ok ? "copied" : "failed";
    setTimeout(() => (copyFeedback = null), 2000);
  }

  function getStatusLabel(status: DiffRow["status"]): string {
    switch (status) {
      case "changed":
        return "Changed";
      case "only-a":
        return "Only in source (A)";
      case "only-b":
        return "Only in target (B)";
      case "unmatched":
        return "Not a Snapmaker Orca setting";
      case "same":
        return "Same";
      default:
        return String(status);
    }
  }

  let isActive = $derived(activeToolTab === "compare");

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!isActive) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      onClose();
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
    class="modal-card compare-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="compare-modal-title"
    tabindex="-1"
    use:trapFocus={isActive}
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

      <h2 id="compare-modal-title" class="modal-title">Settings Compare</h2>
      <p class="modal-subtitle">
        Inspect differences between 3MF files, Snapmaker stock profiles, or custom tuned presets.
      </p>

      <!-- Selection Controls -->
      <div class="compare-selectors">
        <div class="selector-col">
          <span class="col-label">Source A (3MF File)</span>
          <div class="file-picker-box">
            <input
              type="file"
              accept=".3mf"
              class="sr-only"
              aria-label="Choose the first 3MF file"
              bind:this={fileAInput}
              onchange={(e) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files.length > 0) {
                  fileA = target.files[0];
                }
              }}
            />
            <button
              type="button"
              class="btn btn-secondary file-select-btn"
              onclick={() => fileAInput?.click()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span class="file-btn-text">{fileA ? fileA.name : "Choose 3MF File"}</span>
            </button>
          </div>
        </div>

        <div class="compare-divider" aria-hidden="true">
          <span>vs</span>
        </div>

        <div class="selector-col">
          <div class="col-header-row">
            <span class="col-label">Target B</span>
            <div class="mode-pills" role="tablist" aria-label="Target B mode">
              <button
                type="button"
                role="tab"
                aria-selected={bMode === "stock"}
                class="mode-pill"
                class:is-active={bMode === "stock"}
                onclick={() => (bMode = "stock")}
              >
                Stock
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bMode === "preset"}
                class="mode-pill"
                class:is-active={bMode === "preset"}
                onclick={() => (bMode = "preset")}
              >
                Preset
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bMode === "file"}
                class="mode-pill"
                class:is-active={bMode === "file"}
                onclick={() => (bMode = "file")}
              >
                File
              </button>
            </div>
          </div>

          {#if bMode === "stock"}
            <select
              bind:value={selectedStockProfile}
              class="compare-select"
              aria-label="Select Snapmaker stock profile to compare"
            >
              {#each stockProfilesList as profile}
                <option value={profile.id}>{profile.displayName}</option>
              {/each}
            </select>
          {:else if bMode === "preset"}
            <select
              bind:value={selectedPresetName}
              class="compare-select"
              aria-label="Select custom preset to compare"
            >
              {#if savedPresetsList.length === 0}
                <option value="">No presets saved</option>
              {/if}
              {#each savedPresetsList as preset}
                <option value={preset.name}>{preset.name}</option>
              {/each}
            </select>
          {:else}
            <div class="file-picker-box">
              <input
                type="file"
                accept=".3mf"
                class="sr-only"
                aria-label="Choose the second 3MF file"
                bind:this={fileBInput}
                onchange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files.length > 0) {
                    fileB = target.files[0];
                  }
                }}
              />
              <button
                type="button"
                class="btn btn-secondary file-select-btn"
                onclick={() => fileBInput?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="file-btn-text">{fileB ? fileB.name : "Choose Second 3MF"}</span>
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="modal-body">
      {#if !fileA}
        <div class="empty-prompt">
          <p>Please select a 3MF file to compare.</p>
        </div>
      {:else if isLoading}
        <div class="loading-box" role="status" aria-live="polite">
          <span class="spinner-loader" aria-hidden="true"></span>
          <span>Computing parameter differences...</span>
        </div>
      {:else if diffError}
        <div class="error-banner" role="alert">
          <span>{diffError}</span>
        </div>
      {:else if diffResult}
        <div class="diff-view">
          <!-- Labels Heading -->
          <div class="diff-summary-card">
            <div class="diff-labels-heading">
              <span class="diff-label-a">{diffResult.aLabel}</span>
              <span class="diff-connector">compared with</span>
              <span class="diff-label-b">{diffResult.bLabel}</span>
            </div>

            <!-- Legend -->
            <div class="legend-row" aria-label="Status legend">
              <span class="legend-title">Legend:</span>
              <span class="legend-item"><span class="badge badge-above-limit">Above U1 limit (capped)</span> Above U1 machine limit</span>
              <span class="legend-item"><span class="badge badge-above-stock">Above stock</span> Above Snapmaker stock</span>
              <span class="legend-item"><span class="badge badge-changed">Changed</span> Setting differs</span>
              <span class="legend-item"><span class="badge badge-only-a">Only in source (A)</span> Only in source (A)</span>
              <span class="legend-item"><span class="badge badge-only-b">Only in target (B)</span> Only in target (B)</span>
              <span class="legend-item"><span class="badge badge-unmatched">Unmatched</span> Not a Snapmaker Orca setting</span>
            </div>
          </div>

          <!-- Filter Toolbar -->
          <div class="diff-toolbar">
            <div class="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="search"
                bind:value={searchFilter}
                placeholder="Search setting name or key..."
                class="search-input"
                aria-label="Filter parameters"
              />
            </div>

            <div class="toolbar-right">
              <label class="toggle-label">
                <input
                  type="checkbox"
                  bind:checked={differencesOnly}
                  class="checkbox-input"
                />
                <span>Differences only</span>
              </label>

              {#if hasAttention}
                <label class="toggle-label">
                  <input
                    type="checkbox"
                    bind:checked={attentionOnly}
                    class="checkbox-input"
                    data-testid="filter-attention-only"
                  />
                  <span>Only values above stock or the U1's limits</span>
                </label>
              {/if}

              {#if sortColumn !== "default"}
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onclick={resetSort}
                  title="Restore default order"
                  data-testid="reset-sort-btn"
                >
                  Reset sort
                </button>
              {/if}

              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onclick={handleExportJson}
                title="Download diff as JSON"
              >
                Export JSON
              </button>

              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onclick={handleCopyText}
                title="Copy plain text to clipboard"
              >
                {copyFeedback === "copied" ? "Copied!" : copyFeedback === "failed" ? "Couldn't copy" : "Copy as text"}
              </button>
            </div>
          </div>

          <!-- Grouped Tables -->
          <div class="tables-scroll-area">
            {#if filteredGroups.length === 0}
              <div class="no-diff-rows">
                No matching settings found for this filter.
              </div>
            {:else}
              {#each filteredGroups as group (group.group + (group.slot || ""))}
                {@const prepared = prepareGroupData(group, group.rows, sortColumn)}
                <div class="group-section">
                  <h3 class="group-title">{getGroupTitle(group)}</h3>
                  {#each valueLayoutNotes(group.rows) as note}
                    <p class="paired-values-note">{note}</p>
                  {/each}
                  <table class="diff-table" aria-label={getGroupTitle(group)}>
                    <thead>
                      <tr>
                        <th scope="col" class="th-param" aria-sort={sortColumn === "setting" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                          <button
                            type="button"
                            class="th-sort-btn"
                            onclick={() => toggleSort("setting")}
                            data-testid="sort-setting-btn"
                          >
                            <span>Setting Parameter</span>
                            <span class="sort-icon" aria-hidden="true">
                              {#if sortColumn === "setting"}
                                {sortDirection === "asc" ? "▲" : "▼"}
                              {:else}
                                ↕
                              {/if}
                            </span>
                          </button>
                        </th>
                        <th scope="col" class="th-val">A: {diffResult.aLabel.slice(0, 24)}</th>
                        <th scope="col" class="th-val">B: {diffResult.bLabel.slice(0, 24)}</th>
                        <th scope="col" class="th-status" aria-sort={sortColumn === "status" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                          <button
                            type="button"
                            class="th-sort-btn"
                            onclick={() => toggleSort("status")}
                            data-testid="sort-status-btn"
                          >
                            <span>Status</span>
                            <span class="sort-icon" aria-hidden="true">
                              {#if sortColumn === "status"}
                                {sortDirection === "asc" ? "▲" : "▼"}
                              {:else}
                                ↕
                              {/if}
                            </span>
                          </button>
                        </th>
                        <th scope="col" class="th-attention">Attention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#if prepared.isFlattened}
                        {#each prepared.flattenedRows as row (row.key)}
                          <tr class="diff-row">
                            <td class="param-cell">
                              <span class="param-label">{row.label}</span>
                              <code class="param-key">{row.key}</code>
                            </td>
                            <td class="val-cell font-mono">{row.a !== null ? row.a : "(not set)"}</td>
                            <td class="val-cell font-mono">{row.b !== null ? row.b : "(not set)"}</td>
                            <td class="status-cell">
                              <span class="badge badge-{row.status}">
                                {getStatusLabel(row.status)}
                              </span>
                            </td>
                            <td class="attention-cell">
                              {#if row.attention === "above-limit"}
                                <span class="badge badge-above-limit">Above U1 limit (capped)</span>
                              {:else if row.attention === "above-stock"}
                                <span class="badge badge-above-stock">Above stock</span>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      {:else}
                        {#if prepared.attentionRows.length > 0}
                          <tr class="subheading-row needs-look-row">
                            <td colspan="5" class="subheading-td needs-look-td">
                              <div class="subheading-inner">
                                <span class="subheading-title">Needs a look</span>
                                <span class="subheading-count">({prepared.attentionRows.length})</span>
                              </div>
                            </td>
                          </tr>
                          {#each prepared.attentionRows as row (row.key)}
                            <tr class="diff-row">
                              <td class="param-cell">
                                <span class="param-label">{row.label}</span>
                                <code class="param-key">{row.key}</code>
                              </td>
                              <td class="val-cell font-mono">{row.a !== null ? row.a : "(not set)"}</td>
                              <td class="val-cell font-mono">{row.b !== null ? row.b : "(not set)"}</td>
                              <td class="status-cell">
                                <span class="badge badge-{row.status}">
                                  {getStatusLabel(row.status)}
                                </span>
                              </td>
                              <td class="attention-cell">
                                {#if row.attention === "above-limit"}
                                  <span class="badge badge-above-limit">Above U1 limit (capped)</span>
                                {:else if row.attention === "above-stock"}
                                  <span class="badge badge-above-stock">Above stock</span>
                                {/if}
                              </td>
                            </tr>
                          {/each}
                        {/if}

                        {#each prepared.pages as page (page.name)}
                          <tr class="subheading-row page-heading-row">
                            <td colspan="5" class="subheading-td page-td">
                              <div class="subheading-inner">
                                <span class="page-title">{page.name}</span>
                                <span class="subheading-count">({page.rowsCount})</span>
                              </div>
                            </td>
                          </tr>
                          {#each page.sections as section (section.title)}
                            {@const sectionKey = `${group.group}-${group.slot || 0}-${section.title}`}
                            <tr class="subheading-row section-heading-row">
                              <td colspan="5" class="subheading-td section-td">
                                <button
                                  type="button"
                                  class="section-toggle-btn"
                                  aria-expanded={!isCollapsed(sectionKey)}
                                  onclick={() => toggleSection(sectionKey)}
                                >
                                  <span class="toggle-icon" aria-hidden="true">{isCollapsed(sectionKey) ? "▶" : "▼"}</span>
                                  <span class="section-title">{section.title}</span>
                                  <span class="subheading-count">({section.rows.length})</span>
                                </button>
                              </td>
                            </tr>
                            {#if !isCollapsed(sectionKey)}
                              {#each section.rows as row (row.key)}
                                <tr class="diff-row">
                                  <td class="param-cell">
                                    <span class="param-label">{getRowDisplayName(row, true)}</span>
                                    <code class="param-key">{row.key}</code>
                                  </td>
                                  <td class="val-cell font-mono">{row.a !== null ? row.a : "(not set)"}</td>
                                  <td class="val-cell font-mono">{row.b !== null ? row.b : "(not set)"}</td>
                                  <td class="status-cell">
                                    <span class="badge badge-{row.status}">
                                      {getStatusLabel(row.status)}
                                    </span>
                                  </td>
                                  <td class="attention-cell">
                                    {#if row.attention === "above-limit"}
                                      <span class="badge badge-above-limit">Above U1 limit (capped)</span>
                                    {:else if row.attention === "above-stock"}
                                      <span class="badge badge-above-stock">Above stock</span>
                                    {/if}
                                  </td>
                                </tr>
                              {/each}
                            {/if}
                          {/each}
                        {/each}

                        {#if prepared.notOnPageRows.length > 0}
                          <tr class="subheading-row not-on-page-row">
                            <td colspan="5" class="subheading-td not-on-page-td">
                              <div class="subheading-inner">
                                <span class="subheading-title">Not on a settings page</span>
                                <span class="subheading-count">({prepared.notOnPageRows.length})</span>
                              </div>
                            </td>
                          </tr>
                          {#each prepared.notOnPageRows as row (row.key)}
                            <tr class="diff-row">
                              <td class="param-cell">
                                <span class="param-label">{row.label}</span>
                                <code class="param-key">{row.key}</code>
                              </td>
                              <td class="val-cell font-mono">{row.a !== null ? row.a : "(not set)"}</td>
                              <td class="val-cell font-mono">{row.b !== null ? row.b : "(not set)"}</td>
                              <td class="status-cell">
                                <span class="badge badge-{row.status}">
                                  {getStatusLabel(row.status)}
                                </span>
                              </td>
                              <td class="attention-cell">
                                {#if row.attention === "above-limit"}
                                  <span class="badge badge-above-limit">Above U1 limit (capped)</span>
                                {:else if row.attention === "above-stock"}
                                  <span class="badge badge-above-stock">Above stock</span>
                                {/if}
                              </td>
                            </tr>
                          {/each}
                        {/if}
                      {/if}
                    </tbody>
                  </table>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose}>Close</button>
    </div>
  </div>
</div>

<style>
  .compare-modal {
    max-width: min(1200px, calc(100vw - 2rem));
    width: 100%;
  }

  .header-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
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

  .compare-selectors {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.85rem 1rem;
    flex-wrap: wrap;
  }

  .selector-col {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 220px;
  }

  .col-label {
    font-size: 0.775rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .col-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .mode-pills {
    display: flex;
    gap: 0.25rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 3px;
  }

  .mode-pill {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.775rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 0.25rem 0.65rem;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-pill:hover:not(.is-active) {
    color: var(--text-primary);
    background: var(--bg-card-hover);
  }

  .mode-pill.is-active {
    background: var(--bg-card);
    color: var(--accent-strong);
    border-bottom-color: var(--accent-strong);
  }

  .file-select-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-start;
    padding: 0.5rem 0.75rem;
    overflow: hidden;
  }

  .file-btn-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.825rem;
  }

  .compare-select {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    padding: 0.5rem 0.75rem;
    font-size: 0.825rem;
    outline: none;
    cursor: pointer;
  }

  .compare-divider {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    padding: 0 0.25rem;
  }

  .empty-prompt {
    padding: 3rem 1.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .loading-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem;
    color: var(--text-secondary);
  }

  .spinner-loader {
    width: 22px;
    height: 22px;
    border: 2.5px solid var(--border-subtle);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .diff-summary-card {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.85rem 1rem;
    margin-bottom: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .diff-labels-heading {
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .diff-label-a,
  .diff-label-b {
    font-weight: 700;
  }

  .diff-connector {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text-secondary);
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.45rem;
  }

  .legend-title {
    font-weight: 600;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.4rem 0.65rem;
    color: var(--text-muted);
    flex: 1;
    min-width: 220px;
  }

  .search-input {
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.825rem;
    outline: none;
    width: 100%;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
  }

  .checkbox-input {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--accent);
  }

  .modal-body {
    max-height: calc(85vh - 220px);
    overflow-y: auto;
    padding: 1rem 1.5rem;
  }

  .tables-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .group-section {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .paired-values-note {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: -0.25rem 0 0.5rem;
    font-style: italic;
  }

  .group-title {
    font-size: 0.8rem;
    background: var(--bg-input);
    padding: 0.5rem 0.85rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .diff-table {
    width: 100%;
    min-width: 800px;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 0.785rem;
    text-align: left;
  }

  .diff-table th {
    background: var(--bg-card);
    padding: 0.5rem 0.85rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.725rem;
    text-transform: uppercase;
  }

  .diff-table td {
    padding: 0.5rem 0.85rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }

  .th-param { width: 30%; }
  .th-val { width: 19%; word-break: break-word; }
  .th-status { width: 16%; text-align: right; }
  .th-attention { width: 16%; text-align: right; }

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
    font-size: 0.725rem;
  }

  .th-sort-btn:hover {
    color: var(--text-primary);
  }

  .th-sort-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .th-status .th-sort-btn {
    margin-left: auto;
  }

  .sort-icon {
    font-size: 0.65rem;
    opacity: 0.75;
  }

  .subheading-row .subheading-td {
    padding: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .subheading-inner {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.85rem;
  }

  .needs-look-row .subheading-td {
    background: var(--btn-secondary-bg);
  }

  .needs-look-row .subheading-title {
    font-weight: 700;
    font-size: 0.775rem;
    color: var(--warning);
  }

  .page-heading-row .subheading-td {
    background: var(--bg-input);
  }

  .page-title {
    font-weight: 700;
    font-size: 0.75rem;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .section-heading-row .subheading-td {
    background: var(--bg-card);
  }

  .section-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.85rem;
    background: transparent;
    border: none;
    font: inherit;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .section-toggle-btn:hover {
    background: var(--btn-secondary-bg);
  }

  .section-toggle-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .toggle-icon {
    font-size: 0.65rem;
    color: var(--text-muted);
    width: 0.85rem;
    display: inline-block;
  }

  .section-title {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .subheading-title {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .subheading-count {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: normal;
  }

  .not-on-page-row .subheading-td {
    background: var(--bg-input);
  }

  .param-cell {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .val-cell {
    word-break: break-word;
  }

  .status-cell,
  .attention-cell {
    text-align: right;
    white-space: nowrap;
  }

  .param-label {
    font-weight: 600;
  }

  .param-key {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .badge-changed {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-only-a {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--accent-strong);
    color: var(--accent-strong);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-only-b {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--success);
    color: var(--success);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-same {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-unmatched {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-above-limit {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .badge-above-stock {
    font-size: 0.675rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    display: inline-block;
  }

  .no-diff-rows {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--btn-secondary-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 0.8rem;
  }



  @media (max-width: 640px) {
    .compare-selectors {
      flex-direction: column;
      align-items: stretch;
    }
    .selector-col {
      min-width: unset;
      width: 100%;
    }
    .compare-divider {
      text-align: center;
      padding: 0.25rem 0;
    }
    .diff-toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .toolbar-right {
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }
</style>
