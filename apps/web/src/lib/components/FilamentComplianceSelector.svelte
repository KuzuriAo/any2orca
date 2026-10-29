<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import HelpTip from "./HelpTip.svelte";

  type ComplianceMode = "generic" | "snapmaker" | null;

  let {
    mode = null,
    onChange,
    fallbackNotice = null,
    unchangedNotice = null,
    compact = false,
  }: {
    mode: ComplianceMode;
    onChange: (mode: ComplianceMode) => void;
    fallbackNotice?: string[] | null;
    unchangedNotice?: string[] | null;
    compact?: boolean;
  } = $props();

  interface Option {
    id: string;
    value: ComplianceMode;
    label: string;
    description: string;
    tooltip: string;
    badge?: string;
  }

  const options: Option[] = [
    {
      id: "original",
      value: null,
      label: "Original",
      description: "Keep original vendor filament names (Bambu, Creality, Anycubic).",
      tooltip: "Keeps the filament names from the file.",
    },
    {
      id: "generic",
      value: "generic",
      label: "Generic",
      description: "Relabel to Generic PLA/PETG presets for universal slicer compatibility.",
      tooltip: "Relabels filament preset names to Generic or Snapmaker presets for Snapmaker Space publishing and universal slicer compatibility.",
      badge: "Universal",
    },
    {
      id: "snapmaker",
      value: "snapmaker",
      label: "Snapmaker",
      description: "Relabel to Snapmaker PLA/ABS for Snapmaker Space publishing.",
      tooltip: "Relabels filament preset names to Generic or Snapmaker presets for Snapmaker Space publishing and universal slicer compatibility.",
      badge: "Snapmaker Space",
    },
  ];

  let selectedId = $derived.by(() => {
    if (mode === "generic") return "generic";
    if (mode === "snapmaker") return "snapmaker";
    return "original";
  });
</script>

<div class="compliance-wrapper" class:is-compact={compact} class:has-override={mode !== null}>
  <div class="compliance-header">
    <div class="title-group">
      <span class="compliance-title">Filament</span>
      <HelpTip
        id="filament"
        title="Filament"
        testId="helptip-btn-filament"
      >
        <p>
          Only the filament's name and brand can change here; temperatures, flow and retraction always stay as the creator set them. Original keeps the names from the file (Snapmaker Orca lists them as custom filaments, which is fine). Generic and Snapmaker relabel them to presets Snapmaker Orca ships, for uploads to Snapmaker Space.
        </p>
      </HelpTip>
    </div>
    {#if mode === "generic"}
      <span class="badge badge-subtle badge-universal">Universal</span>
    {:else if mode === "snapmaker"}
      <span class="badge badge-subtle badge-snapmaker">Snapmaker Space</span>
    {/if}
  </div>

  <div class="segment-group" role="radiogroup" aria-label="Filament brand preset compliance">
    {#each options as opt (opt.id)}
      {@const isActive = selectedId === opt.id}
      <button
        type="button"
        data-testid={opt.id === "generic" ? "filament-mode-generic" : opt.id === "snapmaker" ? "filament-mode-snapmaker" : "filament-mode-original"}
        class="segment-btn"
        class:is-active={isActive}
        onclick={() => onChange(opt.value)}
        role="radio"
        aria-checked={isActive}
        title={opt.tooltip}
      >
        <div class="segment-label-row">
          <span class="segment-radio-dot"></span>
          <span class="segment-label">{opt.label}</span>
          {#if opt.badge && !compact}
            <span class="mini-tag">{opt.badge}</span>
          {/if}
        </div>
        {#if !compact}
          <span class="segment-desc">{opt.description}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if (fallbackNotice && fallbackNotice.length > 0) || (unchangedNotice && unchangedNotice.length > 0)}
    <div class="fallback-alert" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div class="fallback-alert-content">
        {#if fallbackNotice && fallbackNotice.length > 0}
          <div>
            Snapmaker makes no preset for <strong>{fallbackNotice.join(", ")}</strong> at this nozzle size, so it uses Generic.
          </div>
        {/if}
        {#if unchangedNotice && unchangedNotice.length > 0}
          <div>
            No Snapmaker or Generic preset fits <strong>{unchangedNotice.join(", ")}</strong> at this nozzle size, so its name stays as the creator had it.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .compliance-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.95rem 1.15rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .compliance-wrapper.has-override {
    border-color: var(--accent);
    box-shadow: 0 4px 18px -4px var(--btn-primary-glow);
  }

  .compliance-wrapper.is-compact {
    padding: 0.65rem 0.85rem;
    gap: 0.5rem;
  }

  .compliance-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: nowrap;
    width: 100%;
  }

  .title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .compliance-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .badge-subtle {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.18rem 0.55rem;
    border-radius: var(--radius-sm);
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.01em;
  }

  .badge-subtle.badge-universal {
    background: var(--success-glow);
    color: var(--success);
    border-color: var(--success-glow);
  }

  .segment-group {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .is-compact .segment-group {
    gap: 0.35rem;
  }

  @media (max-width: 720px) {
    .segment-group {
      grid-template-columns: 1fr;
    }
  }

  .segment-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.65rem 0.85rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    color: var(--text-secondary);
  }

  .is-compact .segment-btn {
    padding: 0.45rem 0.4rem;
    align-items: center;
  }

  .segment-btn:hover {
    border-color: var(--border-focus);
  }

  .segment-btn.is-active {
    border-color: var(--accent);
    background: var(--badge-accent-bg);
    box-shadow: 0 0 12px -2px var(--btn-primary-glow);
  }

  .segment-label-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
  }

  .is-compact .segment-label-row {
    justify-content: center;
    gap: 0.35rem;
  }

  .segment-radio-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--text-muted);
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .is-compact .segment-radio-dot {
    width: 7px;
    height: 7px;
    border-width: 1.5px;
  }

  .segment-btn.is-active .segment-radio-dot {
    border-color: var(--accent-strong);
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
  }

  .segment-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
    flex: 1;
    white-space: nowrap;
  }

  .is-compact .segment-label {
    font-size: 0.78rem;
    font-weight: 600;
    flex: 0 1 auto;
    text-align: center;
  }

  .mini-tag {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
  }

  .segment-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.35;
    padding-left: 1.05rem;
  }

  .fallback-alert {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.55rem 0.85rem;
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    border: 1px solid var(--warning);
    color: var(--warning);
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .fallback-alert svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .fallback-alert-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fallback-alert strong {
    color: var(--text-primary);
  }
</style>
