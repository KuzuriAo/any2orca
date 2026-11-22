<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { copyTextToClipboard } from "../clipboard";

  let { report, testid = "copy-report" }: { report: string; testid?: string } = $props();

  let status = $state<"copied" | "failed" | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    status = (await copyTextToClipboard(report)) ? "copied" : "failed";
    clearTimeout(timer);
    // The text stays on screen when it couldn't be copied, so it can be selected by hand.
    if (status === "copied") timer = setTimeout(() => (status = null), 4000);
  }
</script>

<span class="copy-report">
  <button
    type="button"
    class="copy-report-btn"
    data-testid={testid}
    onclick={copy}
    title="Copies a text summary for a bug report. It holds no file name, object names or paths, and nothing is sent anywhere."
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>Copy report</span>
  </button>
  <span class="copy-report-status" role="status" data-testid="{testid}-status">
    {#if status === "copied"}Copied. Paste it into the bug report.{:else if status === "failed"}Couldn't copy. Select the text below instead.{/if}
  </span>
  {#if status === "failed"}
    <textarea class="copy-report-text" readonly rows="8" aria-label="Problem report" data-testid="{testid}-text" value={report}></textarea>
  {/if}
</span>

<style>
  .copy-report {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
  }

  .copy-report-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--accent-strong);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .copy-report-btn:hover {
    color: var(--text-primary);
  }

  .copy-report-btn:focus-visible {
    outline: 2px solid var(--accent-strong);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .copy-report-status {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .copy-report-text {
    flex-basis: 100%;
    width: 100%;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.5rem;
    resize: vertical;
  }
</style>
