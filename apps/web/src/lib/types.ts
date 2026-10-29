// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Shifts, Inspection, WhatChanged } from "any2orca";

export type ConversionStage =
  | "idle"
  | "reading"
  | "parsing"
  | "converting"
  | "stitching"
  | "complete"
  | "error";

export interface FileMetadata {
  name: string;
  size: number;
  platesCount: number;
  objectsCount: number;
  filaments: Array<{
    id: number;
    color: string;
    name?: string;
    colorName?: string;
    type?: string;
  }>;
  nozzleDiameter?: string;
  layerHeight?: number;
  sourcePresetName?: string;
  printerModel?: string;
  version?: string;
}

export interface ConversionState {
  stage: ConversionStage;
  progressPercent: number;
  stageMessage: string;
  file: File | null;
  inspection: Inspection | null;
  metadata: FileMetadata | null;
  response: { shifts: Shifts } | null;
  selectedProfileId: string | null;
  selectedPresetName?: string | null;
  filamentComplianceMode?: "generic" | "snapmaker" | null;
  filamentComplianceFallback?: string[] | null;
  filamentComplianceUnchanged?: string[] | null;
  matchedProfile: {
    profileId: string;
    nozzleDiameter: string;
    exact: boolean;
  } | null;
  downloadUrl: string | null;
  downloadFilename: string | null;
  downloadBlob?: Blob | null;
  warnings: string[];
  errorMessage: string | null;
  errorCode: string | null;
  referrer?: string | null;
  whatChanged?: WhatChanged | null;
  aboveStockChoices?: { keep: string[]; stock: string[] } | null;
}
