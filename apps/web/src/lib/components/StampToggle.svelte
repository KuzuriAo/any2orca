<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { stampStore } from "../stampState.svelte";
  import HelpTip from "./HelpTip.svelte";
  import SettingSwitch from "./SettingSwitch.svelte";

  let {
    compact = true,
  }: {
    compact?: boolean;
  } = $props();
</script>

<SettingSwitch
  id="stamp-toggle"
  testId="stamp-toggle"
  label="Version note"
  checked={stampStore.enabled}
  {compact}
  onchange={(next) => stampStore.setEnabled(next)}
>
  {#snippet icon()}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="8" y1="13" x2="16" y2="13"></line>
      <line x1="8" y1="17" x2="13" y2="17"></line>
    </svg>
  {/snippet}
  {#snippet help()}
    <HelpTip
      id="stamp"
      title="Version note"
      testId="helptip-btn-stamp"
    >
      <p>
        A small note saying which any2orca version and settings made the file. Paste it into a bug report to show how it was made, without sharing your model. It holds nothing about you or your model.
      </p>
      <a
        href="https://github.com/KuzuriAo/any2orca/blob/main/docs/output-stamp.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        What's in it?
      </a>
    </HelpTip>
  {/snippet}
</SettingSwitch>
