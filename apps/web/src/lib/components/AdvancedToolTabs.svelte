<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  let {
    activeTab = "presets",
    onTabChange,
  }: {
    activeTab: "presets" | "compare";
    onTabChange?: (tab: "presets" | "compare") => void;
  } = $props();
</script>

{#if onTabChange}
  <div class="advanced-tool-tabs" role="tablist" aria-label="Advanced Tools">
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "presets"}
      class="advanced-tool-tab"
      class:is-active={activeTab === "presets"}
      onclick={() => onTabChange("presets")}
    >
      Presets
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "compare"}
      class="advanced-tool-tab"
      class:is-active={activeTab === "compare"}
      onclick={() => onTabChange("compare")}
    >
      Compare Settings
    </button>
  </div>
{/if}

<style>
  .advanced-tool-tabs {
    display: flex;
    gap: 0.35rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 3px;
    margin-bottom: 0.85rem;
    width: fit-content;
  }

  .advanced-tool-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .advanced-tool-tab:hover:not(.is-active) {
    color: var(--text-primary);
    background: var(--bg-card-hover);
  }

  .advanced-tool-tab.is-active {
    background: var(--bg-card);
    color: var(--accent-strong);
    border-bottom-color: var(--accent-strong);
  }
</style>
