<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { hardenedNozzleStore } from "../hardenedNozzleState.svelte";
  import HelpTip from "./HelpTip.svelte";

  let {
    compact = true,
  }: {
    compact?: boolean;
  } = $props();
</script>

<div class="hardened-nozzle-card" class:is-compact={compact}>
  <div class="hardened-control-row">
    <label for="hardened-nozzle-toggle" class="hardened-label-row">
      <input
        type="checkbox"
        id="hardened-nozzle-toggle"
        data-testid="hardened-nozzle-toggle"
        checked={hardenedNozzleStore.enabled}
        onchange={(e) => hardenedNozzleStore.setEnabled(e.currentTarget.checked)}
        class="hardened-checkbox"
      />
      <span class="hardened-label-text">My nozzles are hardened steel</span>
    </label>
    <HelpTip
      id="hardened-steel"
      title="My nozzles are hardened steel"
      testId="helptip-btn-hardened-steel"
    >
      <p>
        The stock U1 0.4 nozzle is stainless steel. Tick this if you fitted hardened steel nozzles, so Snapmaker Orca warns about abrasive filaments correctly.
      </p>
    </HelpTip>
  </div>
</div>

<style>
  .hardened-nozzle-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.95rem 1.15rem;
    display: flex;
    flex-direction: column;
    transition: all 0.2s ease;
  }

  .hardened-nozzle-card.is-compact {
    padding: 0.65rem 0.85rem;
  }

  .hardened-control-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .hardened-label-row {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 44px;
    cursor: pointer;
    user-select: none;
  }

  .hardened-checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--accent);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .hardened-checkbox:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .hardened-label-text {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
  }

  .is-compact .hardened-label-text {
    font-size: 0.82rem;
  }
</style>
