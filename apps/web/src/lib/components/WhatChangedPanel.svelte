<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import {
    formatWhatChanged,
    valueLayoutNotes,
    type WhatChanged,
    type ChangeGroup,
    type ChangeItem,
    type SettingsDiff,
  } from "any2orca";
  import { saveBlobWithPicker } from "../download";

  let {
    data = null,
    outputFilename = "converted_U1.3mf",
    onReconvert,
  }: {
    data?: WhatChanged | null;
    outputFilename?: string | null;
    onReconvert?: (aboveStock: { keep: string[]; stock: string[] }) => void | Promise<void>;
  } = $props();

  let isOpen = $state(false);
  let showAllDiffs = $state(false);
  import { copyTextToClipboard } from "../clipboard";
  let copyFeedback = $state<"copied" | "failed" | null>(null);
  let isReconverting = $state(false);



  // Track toggled switches for items with alternative.
  // A key is true if its switch has been flipped from the current conversion.
  let switchedKeys = $state<Record<string, boolean>>({});

  // Reset switched keys when data updates from a conversion.
  $effect(() => {
    if (data) {
      switchedKeys = {};
    }
  });

  let filterToAlternatives = $state(false);

  const alternativeCount = $derived.by(() => {
    if (!data?.groups) return 0;
    return data.groups.reduce((acc, g) => {
      return acc + g.items.filter((item) => Boolean(item.alternative)).length;
    }, 0);
  });

  const displayedGroups = $derived.by(() => {
    if (!data?.groups) return [];
    if (!filterToAlternatives) return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => Boolean(item.alternative)),
      }))
      .filter((g) => g.items.length > 0);
  });

  // Track expanded values (rowId -> boolean)
  let expandedValues = $state<Record<string, boolean>>({});

  function toggleExpand(id: string) {
    expandedValues[id] = !expandedValues[id];
  }

  const profileLine = $derived.by(() => {
    if (!data?.profile) return "";
    const howMap: Record<string, string> = {
      matched: "matched to the file",
      you: "chosen by you",
      preset: "from your preset",
    };
    const how = howMap[data.profile.chosenBy] ?? "matched to the file";
    return `Converted with ${data.profile.displayName} (${how})`;
  });

  const hasPendingSwitchChanges = $derived.by(() => {
    return Object.values(switchedKeys).some(Boolean);
  });

  function isItemSwitched(key: string): boolean {
    return Boolean(switchedKeys[key]);
  }

  function toggleItemSwitch(key: string) {
    switchedKeys[key] = !switchedKeys[key];
  }

  function calculateChoices(): { keep: string[]; stock: string[] } {
    if (!data) return { keep: [], stock: [] };

    const keepKeys: string[] = [];
    const stockKeys: string[] = [];

    for (const group of data.groups) {
      for (const item of group.items) {
        if (!item.key || !item.alternative) continue;
        const switched = Boolean(switchedKeys[item.key]);

        if (item.key === "filament_max_volumetric_speed") {
          if (switched && item.alternative === "keep") {
            keepKeys.push(item.key);
          } else if (!switched && group.reason === "yours" && item.alternative === "stock") {
            keepKeys.push(item.key);
          }
          // filament_max_volumetric_speed is never added to stockKeys
        } else {
          if (switched) {
            if (item.alternative === "keep") keepKeys.push(item.key);
            else if (item.alternative === "stock") stockKeys.push(item.key);
          } else if (group.reason === "yours") {
            if (item.alternative === "keep") stockKeys.push(item.key);
            else if (item.alternative === "stock") keepKeys.push(item.key);
          }
        }
      }
    }

    return {
      keep: [...new Set(keepKeys)].sort(),
      stock: [...new Set(stockKeys)].sort(),
    };
  }

  async function handleApplyChoices() {
    if (!onReconvert) return;
    const choices = calculateChoices();
    isReconverting = true;
    try {
      await onReconvert(choices);
    } finally {
      isReconverting = false;
    }
  }



  function handleExportJson() {
    if (!data) return;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const baseName = (outputFilename || "converted_U1.3mf").replace(/\.3mf$/i, "");
    const downloadName = `${baseName}.what-changed.json`;
    saveBlobWithPicker(blob, downloadName, "application/json");
  }

  async function handleCopyText() {
    if (!data) return;
    const text = formatWhatChanged(data);
    const ok = await copyTextToClipboard(text);
    copyFeedback = ok ? "copied" : "failed";
    setTimeout(() => {
      copyFeedback = null;
    }, 2000);
  }

  
  import type { DiffGroup } from "any2orca";

  function getDiffGroupTitle(group: DiffGroup): string {
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

  const diffSummary = $derived.by(() => {
    if (!data?.diff) return { changed: 0, onlyA: 0, onlyB: 0, same: 0 };
    let changed = 0;
    let onlyA = 0;
    let onlyB = 0;
    let same = 0;
    for (const g of data.diff.groups) {
      for (const r of g.rows) {
        if (r.status === "changed") changed++;
        else if (r.status === "only-a") onlyA++;
        else if (r.status === "only-b") onlyB++;
        else if (r.status === "same") same++;
      }
    }
    return { changed, onlyA, onlyB, same };
  });

  function isLongValue(val: string | null): boolean {
    if (!val) return false;
    return val.length > 50 || val.includes("\n");
  }

  function formatShortValue(val: string | null): string {
    if (val === null) return "(not set)";
    if (val.includes("\n")) {
      const lines = val.split("\n");
      return `(${lines.length} lines of G-code)`;
    }
    const flat = val.replace(/\s+/g, " ");
    return flat.length > 50 ? `${flat.slice(0, 47)}...` : flat;
  }
</script>

{#if data}
  <div class="what-changed-container">
    <button
      type="button"
      class="what-changed-trigger"
      data-testid="what-changed-trigger"
      onclick={() => (isOpen = !isOpen)}
      aria-expanded={isOpen}
      aria-controls="what-changed-content"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <span>What changed?</span>
      <svg
        class="chevron-icon"
        class:is-rotated={isOpen}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    {#if isOpen}
      <div id="what-changed-content" class="what-changed-panel glass-card" data-testid="what-changed-panel">
        <div class="panel-header">
          <div class="panel-title-group">
            <h4 class="panel-title">Conversion Adjustments</h4>
            <span class="panel-profile-line" data-testid="what-changed-profile">{profileLine}</span>
          </div>

          <div class="panel-controls">
            <button
              type="button"
              class="btn btn-secondary btn-xs"
              class:is-active-btn={showAllDiffs}
              onclick={() => (showAllDiffs = !showAllDiffs)}
              title="Toggle full settings differences"
              data-testid="toggle-all-diffs"
            >
              {showAllDiffs ? "Grouped view" : "All differences"}
            </button>

            <button
              type="button"
              class="btn btn-secondary btn-xs"
              onclick={handleExportJson}
              title="Download what changed as JSON"
              data-testid="export-json-button"
            >
              Export JSON
            </button>

            <button
              type="button"
              class="btn btn-secondary btn-xs"
              onclick={handleCopyText}
              title="Copy details as plain text"
              data-testid="copy-text-button"
            >
              {copyFeedback === "copied" ? "Copied!" : copyFeedback === "failed" ? "Couldn't copy" : "Copy as text"}
            </button>
          </div>
        </div>

        {#if alternativeCount > 0}
          <div class="alternatives-summary-bar" data-testid="alternatives-summary">
            <span class="alternatives-summary-text">
              {alternativeCount} {alternativeCount === 1 ? "value" : "values"} above Snapmaker's stock can be chosen differently
            </span>
            <button
              type="button"
              class="btn btn-secondary btn-xs alternatives-filter-btn"
              onclick={() => {
                filterToAlternatives = !filterToAlternatives;
                if (filterToAlternatives && showAllDiffs) {
                  showAllDiffs = false;
                }
              }}
              data-testid="toggle-alternatives-filter"
            >
              {filterToAlternatives ? "Show all" : "Show them"}
            </button>
          </div>
        {/if}

        {#if hasPendingSwitchChanges}
          <div class="apply-bar" data-testid="apply-bar">
            <span class="apply-notice">You have unapplied setting choices.</span>
            <button
              type="button"
              class="btn btn-primary btn-xs apply-btn"
              disabled={isReconverting}
              onclick={handleApplyChoices}
              data-testid="apply-reconvert-button"
            >
              {isReconverting ? "Converting..." : "Apply and convert again"}
            </button>
          </div>
        {/if}

        {#if showAllDiffs}
          <!-- All differences full comparison -->
          <div class="all-diffs-view" data-testid="all-diffs-view">
            {#if data.diff}
              <div class="diff-summary-row">
                <span class="diff-summary-item"><strong>{diffSummary.changed}</strong> changed</span>
                <span class="diff-summary-item"><strong>{diffSummary.onlyA}</strong> original only</span>
                <span class="diff-summary-item"><strong>{diffSummary.onlyB}</strong> U1 only</span>
                <span class="diff-summary-item"><strong>{diffSummary.same}</strong> identical</span>
              </div>

              <div class="diff-groups-container">
                {#each data.diff.groups as diffGroup, groupIdx (`${diffGroup.group}-${diffGroup.slot ?? groupIdx}`)}
                  {@const groupTitle = getDiffGroupTitle(diffGroup)}
                  <section class="diff-group-section" aria-labelledby="diff-heading-${diffGroup.group}-${diffGroup.slot ?? groupIdx}">
                    <h5 id="diff-heading-${diffGroup.group}-${diffGroup.slot ?? groupIdx}" class="diff-group-title">{groupTitle}</h5>
                    {#each valueLayoutNotes(diffGroup.rows) as note}
                      <p class="paired-values-note">{note}</p>
                    {/each}
                    <div class="table-responsive">
                      <table class="diff-table">
                        <thead>
                          <tr>
                            <th scope="col" class="th-param">Setting</th>
                            <th scope="col" class="th-val">{data.diff.aLabel}</th>
                            <th scope="col" class="th-val">{data.diff.bLabel}</th>
                            <th scope="col" class="th-status">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each diffGroup.rows as row (row.key)}
                            <tr>
                              <td class="param-cell">
                                <span class="param-label">{row.label}</span>
                                {#if row.key !== row.label}
                                  <code class="param-key font-mono">{row.key}</code>
                                {/if}
                              </td>
                              <td class="val-cell font-mono">
                                {row.a ?? "(not set)"}
                              </td>
                              <td class="val-cell font-mono">
                                {row.b ?? "(not set)"}
                              </td>
                              <td class="status-cell">
                                {#if row.status === "changed"}
                                  <span class="status-badge badge-changed">Changed</span>
                                {:else if row.status === "only-a"}
                                  <span class="status-badge badge-only-a">Original only</span>
                                {:else if row.status === "only-b"}
                                  <span class="status-badge badge-only-b">U1 only</span>
                                {:else if row.status === "same"}
                                  <span class="status-badge badge-same">Same</span>
                                {:else}
                                  <span class="status-badge badge-unmatched">Unmatched</span>
                                {/if}
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </section>
                {/each}
              </div>
            {:else}
              <div class="diff-missing-box">
                <p class="diff-missing-text">Full settings differences were not included in this conversion.</p>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  onclick={handleApplyChoices}
                >
                  Convert again with all differences
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Grouped view in engine order -->
          <div class="groups-list">
            {#each displayedGroups as group (group.reason)}
              <section class="group-section" aria-labelledby="group-heading-{group.reason}" data-testid="group-{group.reason}">
                <div class="group-header">
                  <span class="group-reason-badge badge-{group.reason}">{group.reason}</span>
                  <h5 id="group-heading-{group.reason}" class="group-title">
                    {group.title} <span class="group-count">({group.items.length})</span>
                  </h5>
                </div>
                <p class="group-description">{group.description}</p>
                {#each valueLayoutNotes(group.items) as note}
                  <p class="paired-values-note">{note}</p>
                {/each}

                <div class="table-responsive">
                  <table class="items-table" aria-label="{group.title} items">
                    <thead>
                      <tr>
                        <th scope="col" class="col-setting">Setting</th>
                        <th scope="col" class="col-before">Before</th>
                        <th scope="col" class="col-after">After</th>
                        <th scope="col" class="col-choice"><span class="sr-only">Choice</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each group.items as item, itemIdx (`${group.reason}-${item.key ?? itemIdx}`)}
                        {@const rowId = `${group.reason}-${item.key ?? itemIdx}`}
                        {#if item.before === null && item.after === null}
                          <!-- Sentence item without arrows -->
                          <tr class="sentence-row">
                            <td colspan="4" class="sentence-cell">
                              <span class="sentence-text">{item.label}</span>
                              {#if item.note}
                                <span class="item-note">({item.note})</span>
                              {/if}
                            </td>
                          </tr>
                        {:else}
                          <!-- Standard setting item -->
                          <tr class="item-row">
                            <td class="cell-setting">
                              <div class="setting-col-inner">
                                <span class="item-label">{item.label}</span>
                                {#if item.key && item.key !== item.label}
                                  <code class="item-key font-mono">{item.key}</code>
                                {/if}
                                {#if item.note}
                                  <span class="item-note">({item.note})</span>
                                {/if}
                              </div>
                            </td>
                            <td class="cell-val cell-before font-mono">
                              {#if isLongValue(item.before)}
                                <div class="val-expand-wrapper">
                                  <span>{formatShortValue(item.before)}</span>
                                  <button
                                    type="button"
                                    class="expand-btn"
                                    onclick={() => toggleExpand(`${rowId}-before`)}
                                  >
                                    {expandedValues[`${rowId}-before`] ? "collapse" : "expand"}
                                  </button>
                                  {#if expandedValues[`${rowId}-before`]}
                                    <pre class="val-full font-mono">{item.before}</pre>
                                  {/if}
                                </div>
                              {:else}
                                <span class={item.before === null ? "val-not-set" : ""}>
                                  {item.before === null ? "(not set)" : item.before}
                                </span>
                              {/if}
                            </td>
                            <td class="cell-val cell-after font-mono">
                              {#if isLongValue(item.after)}
                                <div class="val-expand-wrapper">
                                  <span>{formatShortValue(item.after)}</span>
                                  <button
                                    type="button"
                                    class="expand-btn"
                                    onclick={() => toggleExpand(`${rowId}-after`)}
                                  >
                                    {expandedValues[`${rowId}-after`] ? "collapse" : "expand"}
                                  </button>
                                  {#if expandedValues[`${rowId}-after`]}
                                    <pre class="val-full font-mono">{item.after}</pre>
                                  {/if}
                                </div>
                              {:else}
                                <span class={item.after === null ? "val-not-set" : ""}>
                                  {item.after === null ? "(not set)" : item.after}
                                </span>
                              {/if}
                            </td>
                            <td class="cell-choice">
                              {#if item.alternative && item.key}
                                <label class="switch-control" data-testid="switch-{item.key}">
                                  <input
                                    type="checkbox"
                                    role="switch"
                                    class="switch-checkbox"
                                    checked={isItemSwitched(item.key)}
                                    onchange={() => toggleItemSwitch(item.key!)}
                                  />
                                  <span class="switch-label">
                                    {item.alternative === "stock"
                                      ? "Use Snapmaker's stock value"
                                      : "Keep the creator's value"}
                                  </span>
                                </label>
                              {/if}
                            </td>
                          </tr>
                        {/if}
                      {/each}
                    </tbody>
                  </table>
                </div>
              </section>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .what-changed-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 0.5rem;
  }

  .what-changed-trigger {
    background: transparent;
    border: none;
    color: var(--accent-strong);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .what-changed-trigger:hover {
    color: var(--text-primary);
    filter: brightness(1.2);
  }

  .chevron-icon {
    transition: transform 0.2s ease;
  }

  .chevron-icon.is-rotated {
    transform: rotate(180deg);
  }

  .what-changed-panel {
    width: 100%;
    margin-top: 0.75rem;
    padding: 1rem 1.25rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0.75rem;
  }

  .panel-title-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .panel-title {
    font-size: 0.925rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .panel-profile-line {
    font-size: 0.775rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .panel-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .is-active-btn {
    background: var(--btn-primary-bg);
    color: var(--text-on-accent);
    border-color: var(--accent-strong);
  }

  .alternatives-summary-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.85rem;
    margin-bottom: 0.85rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
  }

  .alternatives-summary-text {
    color: var(--text-primary);
    font-weight: 500;
  }

  .alternatives-filter-btn {
    white-space: nowrap;
    font-size: 0.725rem;
    padding: 0.2rem 0.5rem;
  }

  .apply-bar {
    background: var(--bg-input);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .apply-notice {
    font-size: 0.775rem;
    font-weight: 600;
    color: var(--accent-strong);
  }

  .apply-btn {
    padding: 0.25rem 0.65rem;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  /* Groups list */
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .group-section {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .group-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .group-count {
    color: var(--text-muted);
    font-weight: 500;
  }

  .paired-values-note {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: -0.25rem 0 0.5rem;
    font-style: italic;
  }

  .group-description {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.35;
  }

  .group-reason-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.1rem 0.35rem;
    border-radius: var(--radius-sm);
    letter-spacing: 0.03em;
  }

  .badge-creator {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--accent);
    color: var(--accent-strong);
  }

  .badge-stock {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .badge-capped {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
  }

  .badge-firmware {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--success);
    color: var(--success);
  }

  .badge-layout {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--accent-strong);
    color: var(--accent-strong);
  }

  .badge-yours {
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    color: var(--accent-strong);
  }

  .table-responsive {
    width: 100%;
    overflow-x: auto;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.775rem;
    text-align: left;
  }

  .items-table th {
    background: var(--bg-card);
    padding: 0.4rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .items-table td {
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }

  .col-setting { width: 38%; }
  .col-before { width: 20%; }
  .col-after { width: 20%; }
  .col-choice { width: 22%; text-align: right; }

  .sentence-row td {
    padding: 0.5rem 0.65rem;
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    font-size: 0.775rem;
    color: var(--text-primary);
  }

  .sentence-text {
    font-weight: 500;
  }

  .setting-col-inner {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .item-label {
    color: var(--text-primary);
    font-weight: 600;
  }

  .item-key {
    font-size: 0.685rem;
    color: var(--text-muted);
  }

  .item-note {
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .cell-before {
    color: var(--text-muted);
    font-size: 0.75rem;
    word-break: break-word;
  }

  .cell-after {
    color: var(--accent-strong);
    font-weight: 600;
    font-size: 0.75rem;
    word-break: break-word;
  }

  .val-not-set {
    color: var(--text-muted);
    font-style: italic;
  }

  .val-expand-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .expand-btn {
    background: transparent;
    border: none;
    color: var(--accent-strong);
    font-size: 0.675rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    align-self: flex-start;
  }

  .val-full {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.35rem 0.5rem;
    font-size: 0.675rem;
    white-space: pre-wrap;
    max-height: 150px;
    overflow-y: auto;
    margin: 0.25rem 0 0 0;
  }

  /* Switch control */
  .switch-control {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    user-select: none;
  }

  .switch-checkbox {
    cursor: pointer;
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
  }

  .switch-label {
    font-size: 0.725rem;
    color: var(--text-secondary);
    line-height: 1.25;
    text-align: left;
  }

  .switch-control:hover .switch-label {
    color: var(--text-primary);
  }

  /* All Diffs Table */
  .all-diffs-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .diff-summary-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-input);
    padding: 0.45rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }

  .diff-summary-item strong {
    color: var(--text-primary);
  }

  .diff-groups-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .diff-group-section {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .diff-group-title {
    background: var(--bg-input);
    padding: 0.45rem 0.75rem;
    font-size: 0.775rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .diff-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 0.75rem;
    text-align: left;
  }

  .diff-table th {
    background: var(--bg-card);
    padding: 0.4rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.675rem;
    text-transform: uppercase;
  }

  .diff-table td {
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .th-param { width: 36%; }
  .th-val { width: 27%; }
  .th-status { width: 10%; text-align: right; }

  .param-cell {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .param-label {
    font-weight: 600;
    color: var(--text-primary);
  }

  .param-key {
    font-size: 0.675rem;
    color: var(--text-muted);
  }

  .val-cell {
    word-break: break-word;
    font-size: 0.725rem;
    color: var(--text-secondary);
  }

  .status-cell {
    text-align: right;
  }

  .status-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.1rem 0.35rem;
    border-radius: var(--radius-sm);
  }

  .badge-changed {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
  }

  .badge-only-a {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--accent-strong);
    color: var(--accent-strong);
  }

  .badge-only-b {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--success);
    color: var(--success);
  }

  .badge-same {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
  }

  .badge-unmatched {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
  }

  .diff-missing-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .diff-missing-text {
    font-size: 0.825rem;
    color: var(--text-muted);
    margin: 0;
  }

  .btn-xs {
    padding: 0.2rem 0.5rem;
    font-size: 0.725rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
