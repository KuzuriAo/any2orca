<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { isOfficialBuild } from "../faq";
  import { trapFocus } from "../focusTrap";
  import { OFFICIAL_ANALYTICS_SENTENCE } from "../faq";
  import { onMount } from "svelte";

  let { onClose }: { onClose: () => void } = $props();
  const isOfficial = isOfficialBuild();
  let openerElement: HTMLElement | null = null;

  onMount(() => {
    openerElement = (document.activeElement as HTMLElement) || null;
  });

  function handleClose() {
    onClose();
    setTimeout(() => {
      openerElement?.focus();
    }, 10);
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div
  class="modal-overlay"
  onclick={(e) => e.target === e.currentTarget && handleClose()}
  role="presentation"
>
  <div
    class="modal-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="privacy-modal-title"
    tabindex="-1"
    use:trapFocus={true}
  >
    <div class="modal-header">
      <div class="header-badge-row">
        <span class="badge badge-emerald">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
          Runs in your browser
        </span>
        <button class="close-btn" onclick={handleClose} aria-label="Close modal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <h2 id="privacy-modal-title" class="modal-title">Privacy Guarantee</h2>
      <p class="modal-subtitle">Your files never leave your device. The entire conversion runs locally in your browser.</p>
    </div>

    <div class="modal-body">
      <div class="comparison-grid">
        <div class="comparison-box box-danger">
          <div class="box-title">
            <span class="dot dot-danger"></span>
            Traditional Online Converters
          </div>
          <ul class="comparison-list">
            <li>Uploads your whole <code>.3mf</code> file to a server.</li>
            <li>Your model sits on someone else's computer while it converts.</li>
          </ul>
        </div>

        <div class="comparison-box box-success">
          <div class="box-title">
            <span class="dot dot-success"></span>
            any2orca (Runs in your browser)
          </div>
          <ul class="comparison-list">
            <li><strong>Your files never leave your device.</strong></li>
            <li>Unpacks, parses, and aligns coordinates entirely in memory on your machine.</li>
            <li>Profile translation and clearance checks happen client-side in JavaScript.</li>
            <li>Re-stitches the output <code>.3mf</code> locally, ready to download.</li>
          </ul>
        </div>
      </div>

      <div class="devtools-card">
        <div class="devtools-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <span>How to Verify in Your Browser DevTools:</span>
        </div>
        <ol class="devtools-steps">
          <li>Press <kbd>F12</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> / <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>I</kbd> (macOS) to open DevTools.</li>
          <li>Click the <strong>Network</strong> tab.</li>
          <li>Convert a file and inspect the network activity.</li>
          <li>
            You will likely see one or two requests for the app's own code loaded from this same site (such as a profile data file), which is normal, same as loading a stylesheet.{#if isOfficial} {OFFICIAL_ANALYTICS_SENTENCE}{/if}
          </li>
          <li>Confirm that <strong>no request carries your file</strong>; all conversion work occurs entirely within your browser tab.</li>
        </ol>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-primary" onclick={handleClose}>Got It</button>
    </div>
  </div>
</div>

<style>
  .modal-card {
    background: var(--modal-bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-modal);
    width: 100%;
    max-width: 680px;
    box-shadow: var(--shadow-floating);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .modal-header {
    padding: 1.75rem 1.75rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    display: flex;
    transition: color 0.15s ease;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  .modal-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: var(--letter-spacing-heading);
  }

  .modal-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .modal-body {
    padding: 1.5rem 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-height: 70vh;
    overflow-y: auto;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 600px) {
    .comparison-grid {
      grid-template-columns: 1fr;
    }
  }

  .comparison-box {
    padding: 1.25rem;
    border-radius: var(--radius-md);
    font-size: 0.825rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
  }

  .box-danger {
    border-color: var(--danger);
  }

  .box-success {
    border-color: var(--success);
  }

  .box-title {
    font-weight: 700;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot-danger { background: var(--danger); }
  .dot-success { background: var(--success); }

  .comparison-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text-secondary);
  }

  .comparison-list li {
    position: relative;
    padding-left: 1rem;
    line-height: 1.45;
  }

  .comparison-list li::before {
    content: "•";
    position: absolute;
    left: 0;
  }

  .box-success .comparison-list li {
    color: var(--text-secondary);
  }

  .box-success .comparison-list li strong {
    color: var(--text-primary);
  }

  code {
    background: var(--bg-input);
    padding: 0.15rem 0.35rem;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.775rem;
    color: var(--text-primary);
  }

  .devtools-card {
    background: var(--badge-accent-bg);
    border: 1px solid var(--badge-accent-border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
  }

  .devtools-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--accent-strong);
    margin-bottom: 0.6rem;
  }

  .devtools-steps {
    font-size: 0.825rem;
    color: var(--text-secondary);
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    line-height: 1.45;
  }

  kbd {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.1rem 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.725rem;
    color: var(--text-primary);
  }

  .modal-footer {
    padding: 1rem 1.75rem 1.5rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    justify-content: flex-end;
  }
</style>