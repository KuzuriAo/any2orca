<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { ConversionState } from "../types";
  import type { Theme } from "../theme";
  import Shell from "./Shell.svelte";
  import MigrationNotice from "./MigrationNotice.svelte";
  import Stage from "./Stage.svelte";
  import Inspector from "./Inspector.svelte";
  import ActionBar from "./ActionBar.svelte";
  import BeyondWebApp from "./BeyondWebApp.svelte";
  import FaqSection from "./FaqSection.svelte";
  import Footer from "./Footer.svelte";
  import { isSectionHidden } from "../hiddenSections";

  let {
    convState,
    theme = "dark",
    batchFiles = null,
    onToggleTheme,
    onFileSelected,
    onBatchFilesSelected,
    onIncomingFiles,
    onConvert,
    onClearBatch,
    onSelectProfile,
    onSelectComplianceMode,
    onDownload,
    onReconvert,
    onOpenPrivacy,
    onOpenPartnerSelector,
    pendingManifest = null,
    onConfirmManifest,
    onCancelManifest,
    onClearFile,
    onSelectPreset = () => {},
    onOpenPresets = () => {},
    onOpenCompare = () => {},
    onOpenAdvanced = () => {},
    showB2oNotice = false,
    onDismissB2oNotice = () => {},
  }: {
    convState: ConversionState;
    theme?: Theme;
    batchFiles?: File[] | null;
    onToggleTheme: () => void;
    onFileSelected: (file: File) => void;
    onBatchFilesSelected: (files: File[]) => void;
    onIncomingFiles: (files: File[]) => void;
    onConvert: () => void;
    onClearBatch: () => void;
    onSelectProfile: (profileId: string) => void;
    onSelectComplianceMode: (mode: "generic" | "snapmaker" | null) => void;
    onDownload: () => void;
    onReconvert?: (aboveStock: { keep: string[]; stock: string[] }) => void | Promise<void>;
    onOpenPrivacy: () => void;
    onOpenPartnerSelector: () => void;
    pendingManifest?: { files: { name: string; url: string }[]; hosts: string[] } | null;
    onConfirmManifest?: () => void;
    onCancelManifest?: () => void;
    onClearFile?: () => void;
    onSelectPreset?: (presetName: string | null) => void;
    onOpenPresets?: () => void;
    onOpenCompare?: () => void;
    onOpenAdvanced?: () => void;
    showB2oNotice?: boolean;
    onDismissB2oNotice?: () => void;
  } = $props();

  let fileInputRef: HTMLInputElement | undefined = $state();
  let isDragging = $state(false);

  let isProcessing = $derived(
    convState.stage === "reading" ||
    convState.stage === "parsing" ||
    convState.stage === "converting" ||
    convState.stage === "stitching"
  );

  function triggerFilePicker() {
    fileInputRef?.click();
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const allFiles = Array.from(input.files);
      const validFiles = allFiles.filter((f) =>
        f.name.toLowerCase().endsWith(".3mf") || f.name.toLowerCase().endsWith(".zip")
      );
      if (validFiles.length > 1) {
        onBatchFilesSelected(validFiles);
      } else if (validFiles.length === 1) {
        onIncomingFiles(validFiles);
      } else {
        onIncomingFiles(allFiles);
      }
      input.value = "";
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!isProcessing) isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (isProcessing) return;

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onIncomingFiles(Array.from(e.dataTransfer.files));
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="app-workspace"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <a
    href="#converter"
    class="skip-link"
    onclick={(e) => {
      e.preventDefault();
      const el = document.getElementById("converter");
      if (el) {
        el.focus();
        el.scrollIntoView?.({ block: "start" });
      }
    }}
  >
    Skip to the converter
  </a>

  <input
    bind:this={fileInputRef}
    data-testid="file-input"
    type="file"
    accept=".3mf,.zip"
    multiple
    style="display: none;"
    aria-hidden="true"
    tabindex="-1"
    onchange={handleFileInputChange}
  />

  <Shell
    theme={theme}
    onToggleTheme={onToggleTheme}
    metadata={convState.metadata}
    referrer={convState.referrer}
    onOpenPrivacy={onOpenPrivacy}
    onOpenPartnerSelector={onOpenPartnerSelector}
    onClearFile={onClearFile}
    onOpenAdvanced={onOpenAdvanced}
  />

  <main class="workspace-main">
    {#if showB2oNotice}
      <MigrationNotice onDismiss={onDismissB2oNotice} />
    {/if}
    <section id="converter" class="converter-region" tabindex="-1" aria-label="3MF Converter">
    {#if convState.metadata && (!batchFiles || batchFiles.length === 0)}
      <!-- Project Loaded: Stage + Inspector Two-Column View -->
      <div class="workspace-grid">
        <div class="grid-stage">
          <Stage
            convState={convState}
            isDragging={isDragging}
            batchFiles={batchFiles}
            pendingManifest={pendingManifest}
            triggerFilePicker={triggerFilePicker}
            onClearBatch={onClearBatch}
            onOpenPrivacy={onOpenPrivacy}
            onConfirmManifest={onConfirmManifest}
            onCancelManifest={onCancelManifest}
            onOpenPresetsManager={onOpenPresets}
          />
          <ActionBar
            convState={convState}
            onConvert={onConvert}
            onDownload={onDownload}
            onReconvert={onReconvert}
          />
        </div>
        <div class="grid-inspector">
          <Inspector
            convState={convState}
            onConvertAnother={triggerFilePicker}
            onSelectProfile={onSelectProfile}
            onSelectComplianceMode={onSelectComplianceMode}
            onClearFile={onClearFile}
            onSelectPreset={onSelectPreset}
            onOpenPresetsManager={onOpenPresets}
          />
        </div>
      </div>
    {:else}
      <!-- Empty State, Batch Queue, or Manifest Confirm -->
      <div class="workspace-single">
        <Stage
          convState={convState}
          isDragging={isDragging}
          batchFiles={batchFiles}
          pendingManifest={pendingManifest}
          triggerFilePicker={triggerFilePicker}
          onClearBatch={onClearBatch}
          onOpenPrivacy={onOpenPrivacy}
          onConfirmManifest={onConfirmManifest}
          onCancelManifest={onCancelManifest}
          onOpenPresetsManager={onOpenPresets}
        />
      </div>
    {/if}
    </section>

    <div class="secondary-content">
      {#if !isSectionHidden("beyond")}
        <BeyondWebApp onOpenPartnerSelector={onOpenPartnerSelector} />
      {/if}
      {#if !isSectionHidden("faq")}
        <FaqSection />
      {/if}
      <Footer onOpenPresets={onOpenPresets} onOpenCompare={onOpenCompare} />
    </div>
  </main>

</div>

<style>
  .app-workspace {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-main);
    color: var(--text-primary);
    overflow-x: hidden;
  }

  .workspace-main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 5.5rem 1.5rem 3.5rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    flex: 1;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .grid-stage {
    min-width: 0;
  }

  .grid-inspector {
    min-width: 0;
  }

  .workspace-single {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
  }

  .secondary-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
    max-width: 1080px;
    margin: 1.5rem auto 0;
  }

  @media (max-width: 900px) {
    .workspace-grid {
      grid-template-columns: 1fr;
    }
    .workspace-main {
      padding: 5rem 1rem 3rem;
      gap: 1.5rem;
    }
  }

  @media (max-width: 640px) {
    .workspace-main {
      padding: 4.5rem 0.75rem 2.5rem;
    }
  }
  .skip-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    transition: none;
  }

  .skip-link:focus,
  .skip-link:focus-visible {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    width: auto;
    height: auto;
    padding: 0.65rem 1.25rem;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
    background: var(--bg-popover);
    background-color: var(--bg-popover);
    color: var(--text-primary);
    border: 2px solid var(--accent);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-floating);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    line-height: 1.2;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    transition: none;
  }

  .converter-region {
    width: 100%;
    outline: none;
  }
</style>
