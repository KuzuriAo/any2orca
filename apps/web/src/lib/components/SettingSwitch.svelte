<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  One on/off setting in the side panel: icon, label and (?) help on the left, a switch on the right.
  Liber High Flow, hardened steel nozzles and the version note all use it, so they look and behave alike.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    testId,
    label,
    checked,
    disabled = false,
    compact = false,
    onchange,
    icon,
    help,
    hint,
    children,
  }: {
    /** The switch's element id; the label is `${id}-label`. */
    id: string;
    testId: string;
    label: string;
    checked: boolean;
    disabled?: boolean;
    compact?: boolean;
    onchange: (next: boolean) => void;
    /** A 16px decorative icon (aria-hidden). */
    icon: Snippet;
    /** The (?) HelpTip next to the label. */
    help?: Snippet;
    /** A line under the label, for example why the switch is disabled. */
    hint?: Snippet;
    /** Shown under the row, for example the High Flow toolhead picker. */
    children?: Snippet;
  } = $props();
</script>

<div class="setting-switch" class:is-compact={compact} class:is-disabled={disabled}>
  <div class="toggle-row">
    <div class="label-col">
      <div class="label-wrapper">
        <span class="setting-icon">{@render icon()}</span>
        <label id={`${id}-label`} for={id} class="switch-label">{label}</label>
        {@render help?.()}
      </div>
      {@render hint?.()}
    </div>

    <button
      {id}
      data-testid={testId}
      type="button"
      role="switch"
      aria-labelledby={`${id}-label`}
      aria-checked={checked}
      {disabled}
      onclick={() => { if (!disabled) onchange(!checked); }}
      class="switch-btn"
      class:is-active={checked}
    >
      <span class="switch-slider"></span>
    </button>
  </div>

  {@render children?.()}
</div>

<style>
  .setting-switch {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    transition: all 0.2s ease;
  }

  .setting-switch.is-disabled {
    opacity: 0.72;
  }

  .setting-switch.is-compact {
    padding: 0.75rem 0.9rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 32px;
  }

  .label-col {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .label-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .setting-icon {
    display: inline-flex;
    align-items: center;
    color: var(--accent-strong);
    flex-shrink: 0;
  }

  .switch-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    cursor: pointer;
    line-height: 1.35;
  }

  .is-compact .switch-label {
    font-size: 0.82rem;
  }

  .is-disabled .switch-label {
    cursor: not-allowed;
  }

  .switch-btn {
    position: relative;
    width: 44px;
    height: 24px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    cursor: pointer;
    flex-shrink: 0;
    padding: 2px;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .switch-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .switch-btn.is-active {
    background: var(--accent);
    border-color: var(--accent-strong);
    box-shadow: 0 0 12px var(--btn-primary-glow);
  }

  .switch-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .switch-slider {
    display: block;
    width: 18px;
    height: 18px;
    background: var(--text-primary);
    border-radius: 50%;
    box-shadow: var(--card-shadow);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateX(0);
  }

  .switch-btn.is-active .switch-slider {
    transform: translateX(20px);
  }

  @media (max-width: 640px) {
    .switch-label {
      font-size: 0.82rem;
    }
  }
</style>
