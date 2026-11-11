<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { hardenedNozzleStore } from "../hardenedNozzleState.svelte";
  import HelpTip from "./HelpTip.svelte";
  import { HARDENED_NOZZLE_HELP } from "../optionHelp";
  import SettingSwitch from "./SettingSwitch.svelte";

  let {
    compact = true,
  }: {
    compact?: boolean;
  } = $props();
</script>

<SettingSwitch
  id="hardened-nozzle-toggle"
  testId="hardened-nozzle-toggle"
  label="Hardened steel nozzles"
  checked={hardenedNozzleStore.enabled}
  {compact}
  onchange={(next) => hardenedNozzleStore.setEnabled(next)}
>
  {#snippet icon()}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  {/snippet}
  {#snippet help()}
    <HelpTip
      id="hardened-steel"
      title="Hardened steel nozzles"
      testId="helptip-btn-hardened-steel"
    >
      <p>{HARDENED_NOZZLE_HELP} <a href="/faq#hardened-steel-nozzles">More in the FAQ</a></p>
    </HelpTip>
  {/snippet}
</SettingSwitch>
