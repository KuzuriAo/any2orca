<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick } from "svelte";
  import type { ConversionState } from "./lib/types";
  import { extractFileMetadata, sanitizeWarnings, largeProjectNote } from "./lib/metadata";
  import { LARGE_PROJECT_BYTES } from "any2orca";
  import { getConverter, isHighFlowSupported, fetchProfiles, type WorkerProject } from "./lib/api";
  import { type Theme, getInitialTheme, applyTheme } from "./lib/theme";
  import { type Brand, getInitialBrand, applyBrand } from "./lib/brand";
  import { highFlowStore } from "./lib/highFlowState.svelte";
  import { stampStore } from "./lib/stampState.svelte";
  import { hardenedNozzleStore } from "./lib/hardenedNozzleState.svelte";
  import { loadedFilesStore } from "./lib/loadedFilesState.svelte";
  import { yieldToMain } from "./lib/async";
  import { saveBlobWithPicker } from "./lib/download";
  import {
    parseManifestParam,
    downloadManifestFiles,
    parseHandoffMessage,
    type ManifestFile,
  } from "./lib/handoff";

  import Workspace from "./lib/components/Workspace.svelte";
  import PrivacyModal from "./lib/components/PrivacyModal.svelte";
  import PartnerIntegrationSelector from "./lib/components/PartnerIntegrationSelector.svelte";
  import AdvancedModal from "./lib/components/AdvancedModal.svelte";
    import { presetsEngine } from "./lib/presetsEngine";
  import { isSectionHidden } from "./lib/hiddenSections";

  let showPrivacyModal = $state(false);
  let showPartnerSelector = $state(false);
  let showAdvancedModal = $state(false);
  let advancedModalTab = $state<"presets" | "compare">("presets");

  function handleDismissB2oNotice() {
    showB2oNotice = false;
    try {
      localStorage.setItem("any2orca_b2o_notice_dismissed", "1");
    } catch {
      // Best-effort
    }
  }

  function handleOpenPresets() {
    advancedModalTab = "presets";
    showAdvancedModal = true;
  }

  function handleOpenCompare() {
    advancedModalTab = "compare";
    showAdvancedModal = true;
  }

  function handleOpenAdvanced() {
    advancedModalTab = "presets";
    showAdvancedModal = true;
  }

  function handleSelectPreset(presetName: string | null) {
    convState.selectedPresetName = presetName;
  }
  let batchFiles = $state<File[] | null>(null);
  let pendingManifest = $state<{ files: ManifestFile[]; hosts: string[] } | null>(null);
  let pendingRef: string | null = null;
  let currentTheme = $state<Theme>(getInitialTheme());
  let currentBrand = $state<Brand>(getInitialBrand());
  let currentProject: WorkerProject | null = null;
  let bootstrappedUrl = false;
  let catalogError = $state(false);
  const CATALOG_ERROR_MESSAGE = "The printer profiles couldn't be loaded. Check your connection, or, on your own copy, that /profiles/ is served.";

  $effect(() => {
    if (typeof window === "undefined") return;
    fetchProfiles().catch((err: unknown) => {
      console.error("Failed to load profiles at startup:", err);
      catalogError = true;
      convState.errorCode = "catalog_load_failed";
      convState.errorMessage = CATALOG_ERROR_MESSAGE;
    });
  });
  let showB2oNotice = $state(false);

  $effect(() => {
    applyTheme(currentTheme);
  });

  $effect(() => {
    applyBrand(currentBrand);
  });

  function toggleTheme() {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
  }

  function handleOpenPartnerSelector() {
    if (isSectionHidden("integrate")) return;
    showPartnerSelector = true;
    if (window.location.hash !== "#integration") {
      window.location.hash = "integration";
    }
  }

  function handleClosePartnerSelector() {
    showPartnerSelector = false;
    const hash = window.location.hash.toLowerCase();
    if (hash === "#integration" || hash === "#integrate" || hash === "#partners" || hash === "#partner-selector") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  let convState = $state<ConversionState>({
    file: null,
    stage: "idle",
    stageMessage: "",
    progressPercent: 0,
    metadata: null,
    inspection: null,
    response: null,
    selectedProfileId: null,
    selectedPresetName: null,
    filamentComplianceMode: null,
    filamentComplianceFallback: null,
    filamentComplianceUnchanged: null,
    matchedProfile: null,
    downloadUrl: null,
    downloadFilename: null,
    warnings: [],
    errorCode: null,
    errorMessage: null,
    referrer: null,
  });

  async function handleIncomingFiles(files: File[]) {
    if (!files || files.length === 0) return;

    const invalidFile = files.find((f) => {
      const lower = f.name.toLowerCase();
      return !lower.endsWith(".3mf") && !lower.endsWith(".zip");
    });
    if (invalidFile) {
      resetState();
      convState.stage = "error";
      convState.errorCode = "invalid_file";
      convState.errorMessage = `Only .3mf projects (or a .zip of them) can be converted. '${invalidFile.name}' is a mesh, not a project: open it in your slicer, save the project, and drop that.`;
      return;
    }

    if (files.length === 1 && files[0].name.toLowerCase().endsWith(".3mf")) {
      await handleFileSelected(files[0]);
      return;
    }

    convState.stage = "reading";
    convState.stageMessage = "Reading your files...";
    convState.progressPercent = 10;
    await yieldToMain();

    const flattenedFiles: File[] = [];
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const bundleEntries = await getConverter().unwrapBundle(bytes);
        if (bundleEntries && bundleEntries.length > 0) {
          for (const entry of bundleEntries) {
            flattenedFiles.push(new File([entry.bytes as unknown as BlobPart], entry.name, { type: "application/octet-stream" }));
          }
        } else {
          flattenedFiles.push(file);
        }
      } catch {
        flattenedFiles.push(file);
      }
    }

    if (flattenedFiles.length > 1) {
      handleBatchFilesSelected(flattenedFiles);
    } else if (flattenedFiles.length === 1) {
      await handleFileSelected(flattenedFiles[0]);
    }
  }

  $effect(() => {
    if (typeof window === "undefined") return;

    function checkHash() {
      if (isSectionHidden("integrate")) return;
      const hash = window.location.hash.toLowerCase();
      if (hash === "#integration" || hash === "#integrate" || hash === "#partners" || hash === "#partner-selector") {
        showPartnerSelector = true;
      }
    }

    checkHash();
    window.addEventListener("hashchange", checkHash);

    if (bootstrappedUrl) return () => window.removeEventListener("hashchange", checkHash);
    bootstrappedUrl = true;

    const searchParams = new URLSearchParams(window.location.search);
    const rawRef = searchParams.get("ref");
    if (rawRef && /^[a-zA-Z0-9_-]{1,64}$/.test(rawRef)) {
      pendingRef = rawRef;
    }

    const rawFrom = searchParams.get("from");
    if (rawFrom === "b2o") {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem("any2orca_b2o_notice_dismissed") === "1";
      } catch {
        // Storage disabled or inaccessible
      }
      if (!dismissed) {
        showB2oNotice = true;
      }
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("from");
        history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      } catch {
        // Best-effort
      }
    }

    // Mechanism A: ?manifest=<url-encoded-json>
    const manifestParam = searchParams.get("manifest");
    if (manifestParam) {
      const parsed = parseManifestParam(manifestParam, Boolean(import.meta.env.DEV));
      if (!parsed.ok) {
        console.error("Partner manifest validation failed:", parsed.error);
        convState.stage = "error";
        convState.errorCode = "import_failed";
        convState.errorMessage = parsed.error;
      } else {
        pendingManifest = {
          files: parsed.files,
          hosts: parsed.hosts,
        };
      }
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("manifest");
        history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      } catch {
        // Best-effort
      }
      return;
    }

    // Mechanism B: ?handoff=1
    const handoffParam = searchParams.get("handoff");
    if (handoffParam === "1") {
      if (!window.opener) {
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("handoff");
          history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
        } catch {
          // Best-effort
        }
        convState.stage = "idle";
        convState.warnings = ["No partner window connected. Drop a .3mf file here to convert."];
        return;
      }

      convState.stage = "reading";
      convState.stageMessage = "Waiting for file handoff from partner site...";
      convState.progressPercent = 10;

      const handleMessage = async (event: MessageEvent) => {
        // Only accept messages from window.opener; silently ignore others and keep listening
        if (!window.opener || event.source !== window.opener) {
          return;
        }

        const parsed = parseHandoffMessage(event.data);
        if (!parsed.ok) {
          if (parsed.ignore) {
            // Ignore silently and keep listening
            return;
          }
          window.removeEventListener("message", handleMessage);
          convState.stage = "error";
          convState.errorCode = "import_failed";
          convState.errorMessage = parsed.error;
          return;
        }

        window.removeEventListener("message", handleMessage);

        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("handoff");
          history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
        } catch {
          // Best-effort
        }

        try {
          convState.stageMessage = "Receiving handed off files...";
          convState.progressPercent = 25;
          await yieldToMain();

          const files: File[] = parsed.files.map((f) => {
            return new File([f.buffer as unknown as BlobPart], f.name, { type: "application/octet-stream" });
          });

          convState.referrer = pendingRef;
          await handleIncomingFiles(files);
        } catch (err: unknown) {
          console.error("Partner postMessage import failed:", err);
          convState.stage = "error";
          convState.errorCode = "import_failed";
          const errObj = err as { message?: string };
          convState.errorMessage = errObj.message || "Failed to process handed off files.";
        }
      };

      window.addEventListener("message", handleMessage);

      // Send ready-ping to partner tab.
      try {
        window.opener?.postMessage?.({ type: "any2orca-ready" }, "*");
      } catch {
        // Best-effort
      }
    }
  });

  async function handleFileSelected(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".3mf") && !lower.endsWith(".zip")) {
      resetState();
      convState.stage = "error";
      convState.errorCode = "invalid_file";
      convState.errorMessage = `Only .3mf projects (or a .zip of them) can be converted. '${file.name}' is a mesh, not a project: open it in your slicer, save the project, and drop that.`;
      return;
    }
    batchFiles = null;
    resetState();
    convState.file = file;
    convState.stage = "reading";
    convState.stageMessage = "Reading your file...";
    convState.progressPercent = 15;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      convState.stage = "parsing";
      convState.stageMessage = "Extracting plate configs & coordinates locally...";
      convState.progressPercent = 45;
      await yieldToMain();

      const { project, inspection } = await getConverter().open(bytes, { transfer: true });
      currentProject = project;
      convState.inspection = inspection;
      loadedFilesStore.setFiles([{ file, name: file.name, inspection, isConvertedOutput: false }]);

      const meta = extractFileMetadata(file, inspection);
      convState.metadata = meta;

      // Extract client-side warnings if any
      const rawWarnings = [...(inspection.warnings || [])];
      let cleanedWarnings = sanitizeWarnings(rawWarnings, inspection.unpackedBytes);
      if (inspection.unpackedBytes && inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
        const note = largeProjectNote(inspection.unpackedBytes);
        if (!cleanedWarnings.includes(note)) {
          cleanedWarnings = [note, ...cleanedWarnings];
        }
      }
      convState.warnings = cleanedWarnings;

      try {
        const choice = await project.matchProfile();
        convState.matchedProfile = choice.profileMatch;
      } catch {
        // Fall back to matching during conversion
      }

      convState.stage = "idle";
      convState.stageMessage = "File ready for conversion";
      convState.progressPercent = 0;
    } catch (err: unknown) {
      console.error("Parsing error:", err);
      convState.stage = "error";
      const errObj = err as { code?: string; message?: string };
      convState.errorCode = errObj.code || "invalid_file";
      convState.errorMessage = errObj.message || "Failed to parse 3MF file. Ensure it is a valid Bambu Studio, Creality Print, or Anycubic project.";
    }
  }

  function handleBatchFilesSelected(files: File[]) {
    resetState();
    batchFiles = files;
    loadedFilesStore.setFiles(files.map((f) => ({ file: f, name: f.name })));
  }

  async function handleSelectProfile(profileId: string) {
    convState.selectedProfileId = profileId;
    if (convState.stage === "complete") {
      // Re-run conversion with the newly selected profile
      await startConversion(profileId);
    }
  }

  async function startConversion(overrideProfileId?: string) {
    if (!currentProject || !convState.file) return;

    if (overrideProfileId) {
      convState.selectedProfileId = overrideProfileId;
    }

    convState.errorMessage = null;
    convState.errorCode = null;
    convState.stage = "converting";
    convState.stageMessage = "Converting settings & recentering coordinates...";
    convState.progressPercent = 30;

    await tick();

    try {
      const activeDiameter =
        convState.matchedProfile?.nozzleDiameter ||
        convState.metadata?.nozzleDiameter ||
        "0.4";
      const sendHighFlow = isHighFlowSupported(activeDiameter) && highFlowStore.enabled
        ? [...highFlowStore.toolheads]
        : undefined;

      const explicitProfileId =
        convState.selectedProfileId && convState.selectedProfileId !== convState.matchedProfile?.profileId
          ? convState.selectedProfileId
          : undefined;

      const stageMessages: Record<string, string> = {
        matching: "Matching a Snapmaker U1 profile...",
        "loading-profile": "Loading profile settings...",
        merging: "Converting settings & recentering coordinates...",
        writing: "Writing the converted file...",
      };
      const stagePercents: Record<string, number> = {
        matching: 35,
        "loading-profile": 50,
        merging: 65,
        writing: 85,
      };

      const selectedPresetObj = convState.selectedPresetName
        ? presetsEngine.listPresets().find((p) => p.name.toLowerCase() === convState.selectedPresetName!.toLowerCase())
        : null;

      const result = await currentProject.convert({
        ...(selectedPresetObj ? { preset: JSON.parse(JSON.stringify(selectedPresetObj)) } : { profileId: explicitProfileId }),
        highFlowHotends: sendHighFlow,
        hardenedNozzles: hardenedNozzleStore.enabled ? true : undefined,
        filamentComplianceMode: convState.filamentComplianceMode || undefined,
        stamp: stampStore.enabled ? undefined : false,
        explain: true,
        aboveStock: convState.aboveStockChoices ? { keep: [...convState.aboveStockChoices.keep], stock: [...convState.aboveStockChoices.stock] } : undefined,
        onProgress: (stage) => {
          convState.stage = stage === "writing" ? "stitching" : "converting";
          convState.stageMessage = stageMessages[stage] || "Converting your file...";
          convState.progressPercent = stagePercents[stage] || 50;
        },
      });

      convState.whatChanged = result.report.whatChanged ?? null;
      convState.filamentComplianceFallback = result.report.filamentComplianceFallback ?? null;
      convState.filamentComplianceUnchanged = result.report.filamentComplianceUnchanged ?? null;
      if (result.report.profileMatch) {
        convState.matchedProfile = result.report.profileMatch;
      }

      convState.response = {
        shifts: result.report.shifts,
      };

      // Create download blob (manual download only, never auto-download)
      if (convState.downloadUrl) {
        URL.revokeObjectURL(convState.downloadUrl);
      }
      const blob = new Blob([result.output as unknown as BlobPart], {
        type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const originalName = convState.file.name.replace(/\.3mf$/i, "");
      const downloadFilename = `${originalName}_U1.3mf`;

      convState.downloadUrl = downloadUrl;
      convState.downloadFilename = downloadFilename;
      convState.downloadBlob = blob;

      const sourceFile = convState.file;
      loadedFilesStore.setFiles([
        { file: sourceFile, getFile: () => sourceFile, name: sourceFile.name, inspection: convState.inspection, isConvertedOutput: false },
        {
          getFile: () =>
            new File([blob], downloadFilename, {
              type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
            }),
          name: downloadFilename,
          isConvertedOutput: true,
        },
      ]);

      const combinedWarnings = [
        ...result.report.warnings,
        ...(result.report.preset?.notes ?? []),
      ];
      let cleanedFinishWarnings = sanitizeWarnings(combinedWarnings, convState.inspection?.unpackedBytes);
      if (convState.inspection?.unpackedBytes && convState.inspection.unpackedBytes > LARGE_PROJECT_BYTES) {
        const note = largeProjectNote(convState.inspection.unpackedBytes);
        if (!cleanedFinishWarnings.includes(note)) {
          cleanedFinishWarnings = [note, ...cleanedFinishWarnings];
        }
      }
      convState.warnings = cleanedFinishWarnings;

      convState.stage = "complete";
      convState.stageMessage = "Conversion complete! Ready for Snapmaker Orca.";
      convState.progressPercent = 100;
    } catch (err: unknown) {
      console.error("Conversion error:", err);
      convState.stage = "error";
      const errObj = err as { code?: string; message?: string };
      convState.errorCode = errObj.code || "unknown_error";
      convState.errorMessage = errObj.message || "An unexpected error occurred during conversion.";
    }
  }

  
  async function handleReconvert(aboveStock: { keep: string[]; stock: string[] }) {
    convState.aboveStockChoices = aboveStock;
    await startConversion();
  }

  function triggerDownload(url?: string, filename?: string) {
    const dName = filename || convState.downloadFilename;
    if (!dName) return;

    if (convState.downloadBlob) {
      saveBlobWithPicker(convState.downloadBlob, dName, "application/vnd.ms-package.3dmanufacturing-3dmodel+xml");
      return;
    }

    const dUrl = url || convState.downloadUrl;
    if (!dUrl) return;

    const link = document.createElement("a");
    link.href = dUrl;
    link.download = dName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleConfirmManifest() {
    if (!pendingManifest) return;
    const manifestToLoad = pendingManifest;
    pendingManifest = null;

    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("manifest");
      history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
    } catch {
      // Best-effort
    }

    convState.stage = "reading";
    convState.stageMessage = "Loading files from partner link...";
    convState.progressPercent = 10;

    try {
      const fetchedFiles = await downloadManifestFiles(manifestToLoad.files, async (stageMessage, progressPercent) => {
        convState.stageMessage = stageMessage;
        convState.progressPercent = progressPercent;
        await yieldToMain();
      });

      convState.referrer = pendingRef;
      await handleIncomingFiles(fetchedFiles);
    } catch (err: unknown) {
      console.error("Partner manifest download failed:", err);
      convState.stage = "error";
      convState.errorCode = "import_failed";
      const errObj = err as { message?: string };
      convState.errorMessage = errObj.message || "Failed to import files from partner link.";
    }
  }

  function handleCancelManifest() {
    pendingManifest = null;
    pendingRef = null;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("manifest");
      history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
    } catch {
      // Best-effort
    }
  }

  function handleClearBatch() {
    batchFiles = null;
    resetState();
  }

  function resetState() {
    loadedFilesStore.clear();
    if (currentProject) {
      void currentProject.close();
      currentProject = null;
    }
    pendingManifest = null;
    if (convState.downloadUrl) {
      URL.revokeObjectURL(convState.downloadUrl);
    }
    const referrer = convState.referrer;
    convState = {
      file: null,
      stage: "idle",
      stageMessage: "",
      progressPercent: 0,
      metadata: null,
      inspection: null,
      response: null,
      selectedProfileId: null,
      selectedPresetName: null,
      filamentComplianceMode: null,
      filamentComplianceFallback: null,
      filamentComplianceUnchanged: null,
      matchedProfile: null,
      downloadUrl: null,
      downloadFilename: null,
      warnings: [],
      errorCode: catalogError ? "catalog_load_failed" : null,
      errorMessage: catalogError ? CATALOG_ERROR_MESSAGE : null,
      referrer,
      whatChanged: null,
      aboveStockChoices: null,
    };
  }
</script>

<div id="app-workspace-root" inert={showPrivacyModal || showAdvancedModal || showPartnerSelector}>
<Workspace
  convState={convState}
  theme={currentTheme}
  batchFiles={batchFiles}
  onToggleTheme={toggleTheme}
  onFileSelected={handleFileSelected}
  onBatchFilesSelected={handleBatchFilesSelected}
  onIncomingFiles={handleIncomingFiles}
  onConvert={() => startConversion()}
  onClearBatch={handleClearBatch}
  onClearFile={resetState}
  onSelectProfile={handleSelectProfile}
  onSelectComplianceMode={(mode) => (convState.filamentComplianceMode = mode)}
  onDownload={() => triggerDownload()}
  onReconvert={handleReconvert}
  onOpenPrivacy={() => (showPrivacyModal = true)}
  onSelectPreset={handleSelectPreset}
  onOpenPresets={handleOpenPresets}
  onOpenCompare={handleOpenCompare}
  onOpenAdvanced={handleOpenAdvanced}
  onOpenPartnerSelector={handleOpenPartnerSelector}
  pendingManifest={pendingManifest}
  onConfirmManifest={handleConfirmManifest}
  onCancelManifest={handleCancelManifest}
  showB2oNotice={showB2oNotice}
  onDismissB2oNotice={handleDismissB2oNotice}
/>
</div>

{#if showPrivacyModal}
  <PrivacyModal onClose={() => (showPrivacyModal = false)} />
{/if}

{#if showPartnerSelector && !isSectionHidden("integrate")}
  <PartnerIntegrationSelector onClose={handleClosePartnerSelector} />
{/if}

{#if showAdvancedModal}
  <AdvancedModal
    initialTab={advancedModalTab}
    initialFile={convState.file}
    loadedFiles={loadedFilesStore.files}
    onClose={() => (showAdvancedModal = false)}
    onPresetSaved={(name) => {
      convState.selectedPresetName = name;
    }}
  />
{/if}
