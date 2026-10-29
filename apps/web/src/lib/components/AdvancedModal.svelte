<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import PresetsManagerModal from "./PresetsManagerModal.svelte";
  import CompareModal from "./CompareModal.svelte";

  let {
    initialTab = "presets",
    initialFile = null,
    onClose,
    onPresetSaved,
  }: {
    initialTab?: "presets" | "compare";
    initialFile?: File | null;
    onClose: () => void;
    onPresetSaved?: (presetName: string) => void;
  } = $props();

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

  let activeTab = $state<"presets" | "compare">("presets");
  $effect.pre(() => {
    activeTab = initialTab;
  });
</script>

<div class="advanced-modal-wrapper">
  <div class="advanced-pane" class:is-hidden={activeTab !== "presets"} hidden={activeTab !== "presets"}>
    <PresetsManagerModal
      activeToolTab={activeTab}
      onToolTabChange={(t) => (activeTab = t)}
      onClose={handleClose}
      onPresetSaved={onPresetSaved}
    />
  </div>
  <div class="advanced-pane" class:is-hidden={activeTab !== "compare"} hidden={activeTab !== "compare"}>
    <CompareModal
      activeToolTab={activeTab}
      onToolTabChange={(t) => (activeTab = t)}
      initialFile={initialFile}
      onClose={handleClose}
    />
  </div>
</div>

<style>
  .advanced-modal-wrapper {
    display: contents;
  }

  .advanced-pane {
    display: contents;
  }

  .advanced-pane[hidden],
  .advanced-pane.is-hidden {
    display: none !important;
  }
</style>
