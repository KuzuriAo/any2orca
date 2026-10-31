<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { LARGE_PROJECT_BYTES, type Shifts, type Inspection, type WhatChanged, type ProfileCatalog } from "any2orca";
  import { zipSync } from "fflate";
  import { onDestroy, untrack } from "svelte";
  import { getConverter, isHighFlowSupported, isHardenedNozzleSupported, fetchProfileCatalog, type WorkerProject } from "../api";
  import { extractFileMetadata, sanitizeWarnings, largeProjectNote } from "../metadata";
  import { highFlowStore } from "../highFlowState.svelte";
  import { stampStore } from "../stampState.svelte";
  import { yieldToMain } from "../async";
  import { saveBlobWithPicker } from "../download";
  import type { FileMetadata } from "../types";
  import ProfilePicker from "./ProfilePicker.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import WhatChangedPanel from "./WhatChangedPanel.svelte";
  import { presetsEngine } from "../presetsEngine";
  import FilamentSwatches from "./FilamentSwatches.svelte";
  import FilamentComplianceSelector from "./FilamentComplianceSelector.svelte";
  import HighFlowHotendToggle from "./HighFlowHotendToggle.svelte";
  import HardenedNozzleToggle from "./HardenedNozzleToggle.svelte";
  import SnapmakerOrcaVersionSelector from "./SnapmakerOrcaVersionSelector.svelte";
  import { snapmakerOrcaReleaseStore } from "../snapmakerOrcaReleaseState.svelte";
  import { hardenedNozzleStore } from "../hardenedNozzleState.svelte";
  import StampToggle from "./StampToggle.svelte";
  import PlateVisualizer from "./PlateVisualizer.svelte";
  import { buildBatchLoadedFiles, type LoadedProjectFile } from "../presetLoadedFiles";
  import { loadedFilesStore } from "../loadedFilesState.svelte";

  interface BatchItem {
    id: string;
    file: File;
    inspection: Inspection;
    project?: WorkerProject;
    metadata: FileMetadata;
    selectedProfileId: string | null;
    matchedProfile: { profileId: string; nozzleDiameter: string; exact: boolean } | null;
    filamentComplianceMode: "generic" | "snapmaker" | null;
    filamentComplianceFallback: string[] | null;
    filamentComplianceUnchanged: string[] | null;
    response: { shifts: Shifts } | null;
    warnings: string[];
    status: "staged" | "converting" | "stitching" | "complete" | "error";
    convertedBytes: Uint8Array | null;
    outputFilename: string;
    errorMessage: string | null;
    selectedPresetName?: string | null;
    whatChanged?: WhatChanged | null;
    aboveStockChoices?: { keep: string[]; stock: string[] } | null;
    /** The settings its converted file was made with (see itemSettings). */
    convertedWith?: string | null;
    expanded: boolean;
  }

  let {
    initialFiles,
    onClearBatch,
    onOpenPresetsManager = () => {},
    onUpdateLoadedFiles,
  }: {
    initialFiles: File[];
    onClearBatch: () => void;
    onOpenPresetsManager?: () => void;
    onUpdateLoadedFiles?: (files: LoadedProjectFile[]) => void;
  } = $props();

  let items = $state<BatchItem[]>([]);

  $effect(() => {
    const files = buildBatchLoadedFiles(items);
    loadedFilesStore.setFiles(files);
    if (onUpdateLoadedFiles) {
      onUpdateLoadedFiles(files);
    }
  });
  let isParsingInitial = $state(true);
  let isBatchRunning = $state(false);
  let catalog = $state<ProfileCatalog | null>(null);

  $effect(() => {
    fetchProfileCatalog(snapmakerOrcaReleaseStore.version).then((cat) => {
      catalog = cat;
    }).catch(() => {});
  });
  let batchCompleted = $state(false);
  let batchProgress = $state({ current: 0, total: 0 });
  let batchZipBlob = $state<Blob | null>(null);
  let batchZipUrl = $state<string | null>(null);
  let batchZipSize = $state<number>(0);
  let batchZipFilename = $state<string>("any2orca-batch.zip");
  let fileInputRef: HTMLInputElement;
  let globalComplianceMode = $state<"generic" | "snapmaker" | null>(null);
  let globalPresetName = $state<string | null>(null);

  function handleSetGlobalPreset(presetName: string | null) {
    globalPresetName = presetName;
    for (const item of items) {
      item.selectedPresetName = presetName;
    }
  }

  let presetAboveStockMap = $state<Record<string, boolean>>({});

  $effect(() => {
    const list = presetsEngine.listPresets();
    for (const p of list) {
      presetsEngine.isAboveStock(p).then((above) => {
        presetAboveStockMap[p.name.toLowerCase()] = above;
      });
    }
  });

  function isPresetAboveStock(name: string | null): boolean {
    if (!name) return false;
    return Boolean(presetAboveStockMap[name.toLowerCase()]);
  }

  function handleSetGlobalCompliance(mode: "generic" | "snapmaker" | null) {
    globalComplianceMode = mode;
    items = items.map((it) => ({ ...it, filamentComplianceMode: mode }));
  }

  const isBatchHighFlowSupported = $derived.by(() => {
    if (items.length === 0) return true;
    return items.some((it) => isHighFlowSupported(it.metadata?.nozzleDiameter));
  });

  const isBatchHardenedSupported = $derived.by(() => {
    if (items.length === 0) return true;
    return items.some((it) => {
      const dia = it.matchedProfile?.nozzleDiameter || it.metadata?.nozzleDiameter || "0.4";
      return isHardenedNozzleSupported(dia);
    });
  });

  // Initialize and parse staged files on mount
  $effect(() => {
    initBatch(initialFiles);
  });

  async function initBatch(files: File[]) {
    isParsingInitial = true;

    const parsedItems: BatchItem[] = [];
    let itemIndex = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await yieldToMain();
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        await yieldToMain();

        const bundle = await getConverter().unwrapBundle(bytes);
        if (bundle && bundle.length > 0) {
          for (const entry of bundle) {
            const entryFile = new File([entry.bytes as unknown as BlobPart], entry.name, { type: "application/octet-stream" });
            const { project, inspection } = await getConverter().open(entry.bytes, { transfer: true });
            const metadata = extractFileMetadata(entryFile, inspection);

            let matchedProfile: BatchItem["matchedProfile"] = null;
            try {
              const choice = await project.matchProfile(snapmakerOrcaReleaseStore.option);
              matchedProfile = {
                profileId: choice.profileMatch.profileId,
                nozzleDiameter: choice.profileMatch.nozzleDiameter,
                exact: choice.profileMatch.exact,
              };
            } catch {
              // best-effort
            }

            parsedItems.push({
              id: `batch-${itemIndex++}-${Date.now()}`,
              file: entryFile,
              inspection,
              project,
              metadata,
              selectedProfileId: null,
              matchedProfile,
              filamentComplianceMode: null,
              filamentComplianceFallback: null,
              filamentComplianceUnchanged: null,
              response: null,
              warnings: (() => {
                let w = sanitizeWarnings([...(inspection.warnings || [])], inspection.unpackedBytes);
                if (inspection.unpackedBytes && inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
                  const note = largeProjectNote(inspection.unpackedBytes);
                  if (!w.includes(note)) w = [note, ...w];
                }
                return w;
              })(),
              status: "staged",
              convertedBytes: null,
              outputFilename: entry.name.replace(/\.3mf$/i, "_U1.3mf"),
              errorMessage: null,
              expanded: parsedItems.length === 0,
            });
          }
        } else {
          const { project, inspection } = await getConverter().open(bytes, { transfer: true });
          const metadata = extractFileMetadata(file, inspection);

          let matchedProfile: BatchItem["matchedProfile"] = null;
          try {
            const choice = await project.matchProfile(snapmakerOrcaReleaseStore.option);
            matchedProfile = {
              profileId: choice.profileMatch.profileId,
              nozzleDiameter: choice.profileMatch.nozzleDiameter,
              exact: choice.profileMatch.exact,
            };
          } catch {
            // best-effort
          }

          parsedItems.push({
            id: `batch-${itemIndex++}-${Date.now()}`,
            file,
            inspection,
            project,
            metadata,
            selectedProfileId: null,
            matchedProfile,
            filamentComplianceMode: null,
            filamentComplianceFallback: null,
            filamentComplianceUnchanged: null,
            response: null,
            warnings: (() => {
                let w = sanitizeWarnings([...(inspection.warnings || [])], inspection.unpackedBytes);
                if (inspection.unpackedBytes && inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
                  const note = largeProjectNote(inspection.unpackedBytes);
                  if (!w.includes(note)) w = [note, ...w];
                }
                return w;
              })(),
            status: "staged",
            convertedBytes: null,
            outputFilename: file.name.replace(/\.3mf$/i, "_U1.3mf"),
            errorMessage: null,
            expanded: parsedItems.length === 0,
          });
        }
      } catch {
        // Skip invalid files
      }
    }

    items = parsedItems;
    isParsingInitial = false;
  }

  async function handleAddFiles(newFiles: FileList | null) {
    if (!newFiles || newFiles.length === 0) return;
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      await yieldToMain();
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        await yieldToMain();

        const bundle = await getConverter().unwrapBundle(bytes);
        if (bundle && bundle.length > 0) {
          for (const entry of bundle) {
            const entryFile = new File([entry.bytes as unknown as BlobPart], entry.name, { type: "application/octet-stream" });
            const { project, inspection } = await getConverter().open(entry.bytes, { transfer: true });
            const metadata = extractFileMetadata(entryFile, inspection);

            let matchedProfile: BatchItem["matchedProfile"] = null;
            try {
              const choice = await project.matchProfile(snapmakerOrcaReleaseStore.option);
              matchedProfile = {
                profileId: choice.profileMatch.profileId,
                nozzleDiameter: choice.profileMatch.nozzleDiameter,
                exact: choice.profileMatch.exact,
              };
            } catch {
              // best-effort
            }

            items.push({
              id: `batch-${items.length}-${Date.now()}`,
              file: entryFile,
              inspection,
              project,
              metadata,
              selectedProfileId: null,
              matchedProfile,
              filamentComplianceMode: null,
              filamentComplianceFallback: null,
              filamentComplianceUnchanged: null,
              response: null,
              warnings: (() => {
                let w = sanitizeWarnings([...(inspection.warnings || [])], inspection.unpackedBytes);
                if (inspection.unpackedBytes && inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
                  const note = largeProjectNote(inspection.unpackedBytes);
                  if (!w.includes(note)) w = [note, ...w];
                }
                return w;
              })(),
              status: "staged",
              convertedBytes: null,
              outputFilename: entry.name.replace(/\.3mf$/i, "_U1.3mf"),
              errorMessage: null,
              expanded: false,
            });
          }
        } else {
          const { project, inspection } = await getConverter().open(bytes, { transfer: true });
          const metadata = extractFileMetadata(file, inspection);

          let matchedProfile: BatchItem["matchedProfile"] = null;
          try {
            const choice = await project.matchProfile(snapmakerOrcaReleaseStore.option);
            matchedProfile = {
              profileId: choice.profileMatch.profileId,
              nozzleDiameter: choice.profileMatch.nozzleDiameter,
              exact: choice.profileMatch.exact,
            };
          } catch {
            // best-effort
          }

          items.push({
            id: `batch-${items.length}-${Date.now()}`,
            file,
            inspection,
            project,
            metadata,
            selectedProfileId: null,
            matchedProfile,
            filamentComplianceMode: null,
            filamentComplianceFallback: null,
            filamentComplianceUnchanged: null,
            response: null,
            warnings: (() => {
                let w = sanitizeWarnings([...(inspection.warnings || [])], inspection.unpackedBytes);
                if (inspection.unpackedBytes && inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
                  const note = largeProjectNote(inspection.unpackedBytes);
                  if (!w.includes(note)) w = [note, ...w];
                }
                return w;
              })(),
            status: "staged",
            convertedBytes: null,
            outputFilename: file.name.replace(/\.3mf$/i, "_U1.3mf"),
            errorMessage: null,
            expanded: false,
          });
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  function handleRemoveItem(id: string) {
    const item = items.find((it) => it.id === id);
    if (item?.project) {
      void item.project.close();
    }
    items = items.filter((item) => item.id !== id);
    if (items.length === 0) {
      handleClearAll();
    }
  }

  function handleClearAll() {
    for (const item of items) {
      if (item.project) {
        void item.project.close();
      }
    }
    loadedFilesStore.clear();
    onClearBatch();
  }

  onDestroy(() => {
    for (const item of items) {
      if (item.project) {
        void item.project.close();
      }
    }
  });

  function toggleExpand(id: string) {
    items = items.map((item) =>
      item.id === id ? { ...item, expanded: !item.expanded } : item
    );
  }

  /**
   * Every setting that changes this file's conversion, as one comparable
   * value: the global ones and the file's own. A converted file whose
   * settings change converts again, so the zip always matches what's shown.
   */
  function itemSettings(item: BatchItem): string {
    return JSON.stringify([
      snapmakerOrcaReleaseStore.version,
      item.selectedProfileId,
      item.selectedPresetName ?? globalPresetName,
      hardenedNozzleStore.enabled,
      highFlowStore.installed,
      highFlowStore.toolheads,
      item.filamentComplianceMode,
      stampStore.enabled,
    ]);
  }

  let isRefreshing = $state(false);

  $effect(() => {
    const stale = items.filter((item) => item.status === "complete" && item.convertedWith != null && itemSettings(item) !== item.convertedWith);
    // Also runs when a run or a refresh finishes, so a change made meanwhile is caught then.
    if (!batchCompleted || isBatchRunning || isRefreshing || stale.length === 0) return;
    untrack(() => void refreshStale(stale));
  });

  /** Converts again the files whose settings changed since they were converted, then rebuilds the zip once. */
  async function refreshStale(stale: BatchItem[]) {
    isRefreshing = true;
    try {
      for (const item of stale) await reconvertBatchItem(item, { rebuildZip: false });
      await rebuildBatchZip();
    } finally {
      isRefreshing = false;
    }
  }

  async function startBatchConversion() {
    if (items.length === 0 || isBatchRunning) return;
    isBatchRunning = true;
    batchCompleted = false;
    batchProgress = { current: 0, total: items.length };

    await processBatchQueue();
  }

  async function processBatchQueue() {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === "complete") continue;

      item.status = "converting";
      item.errorMessage = null;
      const settings = itemSettings(item);
      await yieldToMain();

      try {
        const fileDiameter =
          item.matchedProfile?.nozzleDiameter ||
          item.metadata?.nozzleDiameter ||
          "0.4";
        const sendHighFlow = isHighFlowSupported(fileDiameter) && highFlowStore.enabled
          ? [...highFlowStore.toolheads]
          : undefined;
        const explicitProfileId =
          item.selectedProfileId && item.selectedProfileId !== item.matchedProfile?.profileId
            ? item.selectedProfileId
            : undefined;

        if (!item.project) {
          throw new Error("File project is no longer open in worker.");
        }

        const itemPresetName = item.selectedPresetName ?? globalPresetName;
        const activePresetObj = itemPresetName
          ? presetsEngine.listPresets().find((p) => p.name.toLowerCase() === itemPresetName.toLowerCase())
          : null;

        const result = await item.project.convert({
          ...(activePresetObj ? { preset: JSON.parse(JSON.stringify(activePresetObj)) } : { profileId: explicitProfileId }),
          ...snapmakerOrcaReleaseStore.option,
          filamentComplianceMode: item.filamentComplianceMode || undefined,
          highFlowHotends: sendHighFlow,
          hardenedNozzles: hardenedNozzleStore.enabled ? true : undefined,
          stamp: stampStore.enabled ? undefined : false,
          explain: true,
          aboveStock: item.aboveStockChoices ? { keep: [...item.aboveStockChoices.keep], stock: [...item.aboveStockChoices.stock] } : undefined,
          onProgress: (stage: string) => {
            item.status = stage === "writing" ? "stitching" : "converting";
          },
        });

        item.whatChanged = result.report.whatChanged ?? null;
        item.filamentComplianceFallback = result.report.filamentComplianceFallback ?? null;
        item.filamentComplianceUnchanged = result.report.filamentComplianceUnchanged ?? null;
        const combinedBatchWarnings = [
          ...result.report.warnings,
          ...(result.report.preset?.notes ?? []),
        ];
        let cleanedBatchWarnings = sanitizeWarnings(combinedBatchWarnings, item.inspection?.unpackedBytes);
        if (item.inspection?.unpackedBytes && item.inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
          const note = largeProjectNote(item.inspection.unpackedBytes);
          if (!cleanedBatchWarnings.includes(note)) {
            cleanedBatchWarnings = [note, ...cleanedBatchWarnings];
          }
        }
        item.warnings = cleanedBatchWarnings;
        if (result.report.profileMatch) {
          item.matchedProfile = {
            profileId: result.report.profileMatch.profileId,
            nozzleDiameter: result.report.profileMatch.nozzleDiameter,
            exact: result.report.profileMatch.exact,
          };
        }

        item.response = {
          shifts: result.report.shifts,
        };

        item.convertedBytes = result.output;
        item.convertedWith = settings;
        item.status = "complete";
        await yieldToMain();
      } catch (err: any) {
        item.status = "error";
        item.errorMessage = err?.message || "Failed to convert file.";
      }

      batchProgress.current = i + 1;
    }

    isBatchRunning = false;
    batchCompleted = true;

    // Create final any2orca-batch-<timestamp>.zip containing all converted files
    const zipFiles: Record<string, Uint8Array> = {};
    for (const item of items) {
      if (item.status === "complete" && item.convertedBytes) {
        zipFiles[item.outputFilename] = item.convertedBytes;
      }
    }

    if (Object.keys(zipFiles).length > 0) {
      await yieldToMain();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      const secs = String(now.getSeconds()).padStart(2, "0");
      batchZipFilename = `any2orca-batch-${year}-${month}-${day}_${hours}${mins}${secs}.zip`;

      const zipped = zipSync(zipFiles, { level: 0 }); // 3MF is already compressed
      const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
      batchZipBlob = blob;
      if (batchZipUrl) URL.revokeObjectURL(batchZipUrl);
      batchZipUrl = URL.createObjectURL(blob);
      batchZipSize = blob.size;
    }

    isBatchRunning = false;
    batchCompleted = true;
  }

  
  async function rebuildBatchZip() {
    const zipFiles: Record<string, Uint8Array> = {};
    for (const item of items) {
      if (item.status === "complete" && item.convertedBytes) {
        zipFiles[item.outputFilename] = item.convertedBytes;
      }
    }

    if (Object.keys(zipFiles).length > 0) {
      await yieldToMain();
      if (!batchZipFilename) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hours = String(now.getHours()).padStart(2, "0");
        const mins = String(now.getMinutes()).padStart(2, "0");
        const secs = String(now.getSeconds()).padStart(2, "0");
        batchZipFilename = `any2orca-batch-${year}-${month}-${day}_${hours}${mins}${secs}.zip`;
      }

      const zipped = zipSync(zipFiles, { level: 0 });
      const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
      batchZipBlob = blob;
      if (batchZipUrl) URL.revokeObjectURL(batchZipUrl);
      batchZipUrl = URL.createObjectURL(blob);
      batchZipSize = blob.size;
    }
  }

  async function reconvertBatchItem(item: BatchItem, options: { rebuildZip?: boolean } = {}) {
    const settings = itemSettings(item);
    if (!item.project) {
      const buf = await item.file.arrayBuffer();
      const { project } = await getConverter().open(new Uint8Array(buf), { transfer: true });
      item.project = project;
    }

    const activeDiameter =
      item.matchedProfile?.nozzleDiameter ||
      item.metadata?.nozzleDiameter ||
      "0.4";
    const sendHighFlow = isHighFlowSupported(activeDiameter) && highFlowStore.enabled
      ? [...highFlowStore.toolheads]
      : undefined;
    const explicitProfileId =
      item.selectedProfileId && item.selectedProfileId !== item.matchedProfile?.profileId
        ? item.selectedProfileId
        : undefined;

    const itemPresetName = item.selectedPresetName ?? globalPresetName;
    const activePresetObj = itemPresetName
      ? presetsEngine.listPresets().find((p) => p.name.toLowerCase() === itemPresetName.toLowerCase())
      : null;

    item.status = "converting";
    try {
      const result = await item.project.convert({
        ...(activePresetObj ? { preset: JSON.parse(JSON.stringify(activePresetObj)) } : { profileId: explicitProfileId }),
        ...snapmakerOrcaReleaseStore.option,
        filamentComplianceMode: item.filamentComplianceMode || undefined,
        highFlowHotends: sendHighFlow,
        hardenedNozzles: hardenedNozzleStore.enabled ? true : undefined,
        stamp: stampStore.enabled ? undefined : false,
        explain: true,
        aboveStock: item.aboveStockChoices ? { keep: [...item.aboveStockChoices.keep], stock: [...item.aboveStockChoices.stock] } : undefined,
        onProgress: (stage: string) => {
          item.status = stage === "writing" ? "stitching" : "converting";
        },
      });

      item.whatChanged = result.report.whatChanged ?? null;
      item.filamentComplianceFallback = result.report.filamentComplianceFallback ?? null;
      item.filamentComplianceUnchanged = result.report.filamentComplianceUnchanged ?? null;
      item.warnings = [
        ...result.report.warnings,
        ...(result.report.preset?.notes ?? []),
      ];
      if (result.report.profileMatch) {
        item.matchedProfile = {
          profileId: result.report.profileMatch.profileId,
          nozzleDiameter: result.report.profileMatch.nozzleDiameter,
          exact: result.report.profileMatch.exact,
        };
      }
      item.response = {
        shifts: result.report.shifts,
      };
      item.convertedBytes = result.output;
      item.convertedWith = settings;
      item.status = "complete";

      if (batchCompleted && options.rebuildZip !== false) {
        await rebuildBatchZip();
      }
    } catch (err: unknown) {
      item.status = "error";
      const errObj = err as { message?: string };
      item.errorMessage = errObj.message || "Failed to convert file.";
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="batch-workspace" data-testid="batch-view">
  <!-- Header Bar -->
  <div class="batch-header">
    <div class="batch-title-group">
      <div class="batch-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>Batch Conversion Queue</span>
      </div>
      <h2 class="batch-headline">
        {items.length} {items.length === 1 ? 'Project' : 'Projects'} Staged
      </h2>
      <p class="batch-subtitle">
        Inspect detected nozzle settings & profiles for each file before generating your batch ZIP archive.
      </p>
    </div>

    <div class="batch-header-actions">
      <button
        type="button"
        class="btn-secondary btn-sm"
        onclick={() => fileInputRef.click()}
        disabled={isBatchRunning}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add More Files
      </button>
      <input
        bind:this={fileInputRef}
        type="file"
        accept=".3mf,.zip"
        multiple
        class="hidden-file-input"
        onchange={(e) => handleAddFiles(e.currentTarget.files)}
      />
      <button
        type="button"
        class="btn-secondary btn-sm"
        onclick={handleClearAll}
        disabled={isBatchRunning}
        data-testid="clear-batch"
      >
        Clear Batch
      </button>
    </div>
  </div>

  <!-- Global Batch Controls -->
  <div class="batch-global-controls">
    <SnapmakerOrcaVersionSelector compact={false} />
    <PresetPicker
      selectedPreset={globalPresetName}
      onSelectPreset={handleSetGlobalPreset}
      onOpenPresetsManager={onOpenPresetsManager}
      compact={false}
      showTitle={true}
    />
    <FilamentComplianceSelector
      mode={globalComplianceMode}
      onChange={handleSetGlobalCompliance}
      compact={false}
    />
    <HighFlowHotendToggle
      isSupported={isBatchHighFlowSupported}
      compact={false}
    />
    {#if isBatchHardenedSupported}
      <HardenedNozzleToggle
        compact={false}
      />
    {/if}
    <StampToggle
      compact={false}
    />
  </div>

  {#if isParsingInitial}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Inspecting staged 3MF metadata...</p>
    </div>
  {:else}
    <!-- Staged Files Accordion / List -->
    <div class="staged-list">
      {#each items as item, index (item.id)}
        {@const activePresetForItem = presetsEngine.listPresets().find((p) => p.name.toLowerCase() === (item.selectedPresetName ?? globalPresetName ?? "").toLowerCase())}
        <div
          class="staged-card"
          class:is-expanded={item.expanded}
          class:is-complete={item.status === 'complete'}
          class:is-error={item.status === 'error'}
          class:is-converting={item.status === 'converting' || item.status === 'stitching'}
        >
          <!-- Card Header / Summary Row -->
          <div class="card-summary">
            <button
              type="button"
              class="card-expand-btn"
              onclick={() => toggleExpand(item.id)}
              aria-expanded={item.expanded}
              aria-controls={`batch-details-${item.id}`}
              id={`batch-header-${item.id}`}
            >
              <div class="summary-left">
                <span class="file-index">#{index + 1}</span>
                <div class="file-name-group">
                  <span class="file-name" title={item.file.name}>{item.file.name}</span>
                  <span class="file-size">{formatBytes(item.file.size)}</span>
                </div>
              </div>

              <div class="summary-badges">
                <span class="badge badge-emerald">
                  {item.metadata.nozzleDiameter ? `${item.metadata.nozzleDiameter}mm Nozzle` : "0.4mm Nozzle"}
                </span>
                {#if item.metadata.layerHeight}
                  <span class="badge badge-subtle">{item.metadata.layerHeight}mm Layer</span>
                {/if}
                <span class="badge badge-subtle">{item.metadata.platesCount} {item.metadata.platesCount === 1 ? "Plate" : "Plates"}</span>

                {#if isPresetAboveStock(item.selectedPresetName ?? globalPresetName)}
                  <span class="badge badge-warning" title="Selected preset contains above-stock parameters">
                    Above-Stock
                  </span>
                {/if}
                {#if item.warnings && item.warnings.length > 0}
                  <span class="badge badge-amber" title="{item.warnings.length} conversion note(s)">
                    ⚠️ {item.warnings.length} {item.warnings.length === 1 ? "Note" : "Notes"}
                  </span>
                {/if}

                <!-- Status Pill -->
                {#if item.status === "complete"}
                  <span class="status-pill status-success">✓ Ready</span>
                {:else if item.status === "error"}
                  <span class="status-pill status-fail">✕ Error</span>

                {:else if item.status === "converting" || item.status === "stitching"}
                  <span class="status-pill status-active">Converting...</span>
                {:else}
                  <span class="status-pill status-idle">Staged</span>
                {/if}
              </div>

              <span class="chevron-indicator" class:rotated={item.expanded} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
            </button>

            <div class="summary-actions">
              <button
                type="button"
                class="icon-btn remove-btn"
                onclick={() => handleRemoveItem(item.id)}
                disabled={isBatchRunning}
                title="Remove from batch"
                aria-label={`Remove ${item.file.name} from batch`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Card Expanded Details -->
          {#if item.expanded}
            <div
              class="card-details"
              id={`batch-details-${item.id}`}
              aria-labelledby={`batch-header-${item.id}`}
            >
              {#if item.errorMessage}
                <div class="error-banner" >
                  <p><strong>Error:</strong> {item.errorMessage}</p>
                </div>
              {/if}

              <!-- Profile Picker Override -->
              <div class="detail-section">
                <ProfilePicker
                  detectedDiameter={item.metadata.nozzleDiameter || "0.4"}
                  sourceLayerHeight={item.metadata.layerHeight}
                  sourcePresetName={item.metadata.sourcePresetName}
                  selectedProfileId={activePresetForItem ? activePresetForItem.base : item.selectedProfileId}
                  matchedProfile={item.matchedProfile}
                  onSelectProfile={(id) => (item.selectedProfileId = id)}
                  compact={true}
                  disabled={Boolean(activePresetForItem)}
                />
              </div>

              <!-- Preset Picker Override -->
              <div class="detail-divider"></div>
              <div class="detail-section">
                <PresetPicker
                  selectedPreset={item.selectedPresetName ?? globalPresetName}
                  onSelectPreset={(p) => (item.selectedPresetName = p)}
                  onOpenPresetsManager={onOpenPresetsManager}
                  compact={true}
                  showTitle={true}
                />
              </div>

              <!-- Filament Compliance Selector -->
              <div class="detail-divider"></div>
              <div class="detail-section">
                <FilamentComplianceSelector
                  mode={item.filamentComplianceMode}
                  onChange={(m) => (item.filamentComplianceMode = m)}
                  fallbackNotice={item.filamentComplianceFallback}
                  unchangedNotice={item.filamentComplianceUnchanged}
                  compact={true}
                />
              </div>

              <!-- Filament Swatches Preview -->
              {#if item.metadata.filaments && item.metadata.filaments.length > 0}
                {@const itemProfileId = item.selectedProfileId || item.matchedProfile?.profileId || null}
                {@const itemPrinterId = itemProfileId && catalog ? catalog.get(itemProfileId)?.printerId ?? null : null}
                <div class="detail-divider"></div>
                <div class="detail-section">
                  <FilamentSwatches
                    filaments={item.metadata.filaments}
                    complianceMode={item.filamentComplianceMode}
                    catalog={catalog}
                    printerId={itemPrinterId}
                    nozzleDiameter={item.metadata?.nozzleDiameter}
                  />
                </div>
              {/if}

              <!-- Plate & Bed Visualizer -->
              {#if item.inspection}
                <div class="detail-divider"></div>
                <div class="detail-section visualizer-section">
                  <PlateVisualizer inspection={item.inspection} response={item.response} />
                </div>
              {/if}

              <!-- Conversion Warnings / Notes -->
              {#if item.warnings && item.warnings.length > 0}
                <div class="detail-divider"></div>
                <div class="detail-section warning-note-box">
                  <div class="warning-box-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span>Conversion Notes ({item.warnings.length})</span>
                  </div>
                  <ul class="warning-box-list">
                    {#each item.warnings as w}
                      <li>{w}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              <!-- What Changed Panel -->
              {#if item.status === "complete" && item.whatChanged}
                <div class="detail-divider"></div>
                <div class="detail-section">
                  <WhatChangedPanel
                    data={item.whatChanged}
                    outputFilename={item.outputFilename}
                    onReconvert={async (choices: { keep: string[]; stock: string[] }) => {
                      item.aboveStockChoices = choices;
                      await reconvertBatchItem(item);
                    }}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Batch Bottom Controls -->
    <div class="batch-footer">

      {#if batchCompleted && batchZipUrl}
        <!-- Completed Download Card -->
        <div class="batch-completed-card">
          <div class="zip-icon-wrapper">📦</div>
          <div class="zip-text-group">
            <h3 class="zip-title">Batch Conversion {items.some(it => it.status === 'error') ? 'Partially' : ''} Complete!</h3>
            <p class="zip-meta">
              {items.filter(it => it.status === 'complete').length} converted 3MF {items.filter(it => it.status === 'complete').length === 1 ? 'file' : 'files'} bundled into <code>{batchZipFilename}</code> ({formatBytes(batchZipSize)}).
            </p>
          </div>
          <button
            type="button"
            class="btn-primary btn-large download-zip-btn"
            data-testid="download-batch-zip"
            disabled={isRefreshing}
            onclick={() => {
              if (batchZipBlob) {
                saveBlobWithPicker(batchZipBlob, batchZipFilename, "application/zip");
              } else if (batchZipUrl) {
                const a = document.createElement("a");
                a.href = batchZipUrl;
                a.download = batchZipFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {isRefreshing ? "Updating for your new settings..." : `Download ${batchZipFilename}`}
          </button>
        </div>
      {:else if !batchCompleted}
        <!-- Action Run Bar -->
        <div class="batch-action-bar">
          <div class="batch-status-text">
            {#if isBatchRunning}
              <div class="running-indicator">
                <div class="spinner-sm"></div>
                <span>Converting {batchProgress.current} of {batchProgress.total} projects...</span>
              </div>
            {:else}
              <span class="ready-text">Ready to convert {items.length} files to Snapmaker U1</span>
            {/if}
          </div>

          <button
            type="button"
            class="btn-primary btn-large"
            onclick={startBatchConversion}
            disabled={isBatchRunning || items.length === 0}
          >
            {#if isBatchRunning}
              <span>Converting Batch...</span>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline>
              </svg>
              <span>Convert All ({items.length} Files) → ZIP Bundle</span>
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .batch-workspace {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }

  .batch-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .batch-global-controls {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .batch-title-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .batch-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-strong);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .batch-headline {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-primary);
  }

  .batch-subtitle {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .zip-meta code {
    color: var(--accent-strong);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    background: var(--badge-accent-bg);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
  }

  .batch-header-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .hidden-file-input {
    display: none;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 3rem;
    color: var(--text-secondary);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--badge-accent-border);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
    border: 2px solid var(--badge-accent-border);
    border-top-color: var(--accent-strong);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Staged List */
  .staged-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .staged-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .staged-card.is-expanded {
    border-color: var(--border-focus);
    background: var(--bg-card);
  }

  .staged-card.is-complete {
    border-color: var(--success);
  }

  .staged-card.is-error {
    border-color: var(--danger);
  }

  .card-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.85rem 0 0;
    gap: 0.5rem;
    user-select: none;
    transition: background 0.15s ease;
  }

  .card-summary:hover {
    background: var(--bg-card-hover);
  }

  .card-expand-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    min-width: 0;
    gap: 1rem;
    padding: 0.85rem 0.65rem 0.85rem 1.15rem;
    background: transparent;
    border: none;
    margin: 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
    transition: background 0.15s ease;
  }

  .card-expand-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .chevron-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    padding: 0.4rem;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .card-expand-btn:hover .chevron-indicator {
    color: var(--text-primary);
  }

  .chevron-indicator svg {
    transition: transform 0.2s ease;
  }

  .chevron-indicator.rotated svg {
    transform: rotate(180deg);
  }

  .summary-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .file-index {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .file-name-group {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .summary-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }



  .status-pill {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    border-radius: 9999px;
    text-transform: uppercase;
  }

  .status-idle {
    background: var(--border-subtle);
    color: var(--text-muted);
  }

  .status-active {
    background: var(--badge-accent-bg);
    color: var(--accent-strong);
    border: 1px solid var(--badge-accent-border);
  }

  .status-success {
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
  }

  .status-fail {
    background: var(--danger);
    color: var(--danger);
    border: 1px solid var(--danger);
  }

  .summary-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .icon-btn:hover {
    color: var(--text-primary);
    background: var(--border-subtle);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Expanded Card Details */
  .card-details {
    padding: 1.25rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    background: var(--bg-input);
  }

  .error-banner {
    padding: 0.65rem 0.85rem;
    background: var(--danger);
    border: 1px solid var(--danger);
    border-radius: var(--radius-md);
    color: var(--danger);
    font-size: 0.8rem;
  }

  .detail-section {
    width: 100%;
  }

  .detail-divider {
    height: 1px;
    background: var(--border-subtle);
  }

  .visualizer-section {
    width: 100%;
  }

  /* Batch Footer */
  .batch-footer {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .batch-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .batch-status-text {
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  .running-indicator {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--accent-strong);
    font-weight: 600;
  }

  /* Completed Download Card */
  .batch-completed-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    background: var(--success-glow);
    border: 1px solid var(--success-glow);
    border-radius: var(--radius-lg);
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .zip-icon-wrapper {
    font-size: 2.5rem;
  }

  .zip-text-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .zip-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .zip-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .download-zip-btn {
    background: linear-gradient(135deg, var(--success) 0%, var(--success) 100%) !important;
    box-shadow: 0 4px 16px var(--success) !important;
  }

  .download-zip-btn:hover {
    background: linear-gradient(135deg, var(--success) 0%, var(--success) 100%) !important;
    box-shadow: 0 6px 20px var(--success-glow) !important;
  }

  .badge-warning {
    background: var(--btn-secondary-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
  }

  .badge-amber {
    background: var(--badge-accent-bg);
    border: 1px solid var(--warning);
    color: var(--warning);
  }

  .warning-note-box {
    background: var(--bg-card);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    padding: 0.75rem 1rem;
  }

  .warning-box-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--warning);
    margin-bottom: 0.35rem;
  }

  .warning-box-list {
    list-style: none;
    font-size: 0.775rem;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0.25rem;
  }

  .warning-box-list li::before {
    content: "• ";
    color: var(--warning);
    font-weight: 700;
  }

  .btn-large {
    padding: 0.75rem 1.5rem;
    font-size: 0.95rem;
  }




</style>
