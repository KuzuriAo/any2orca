// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ConvertNote, Shifts, Inspection, PlateFilaments, SwapPlan, WhatChanged } from "any2orca";

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
    /** The filament's maker as the project names it, for previewing the name a filament option gives. */
    vendor?: string;
  }>;
  nozzleDiameter?: string;
  matchNozzleDiameter?: string;
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
  response: { shifts: Shifts; plateOrigins?: Record<number, [number, number]>; plateFilaments?: PlateFilaments[]; swapPlans?: SwapPlan[]; layerLimits?: { min: number; max: number } | null } | null;
  /** The text offered for a bug report about this file's result or error; null while there is nothing to report on. */
  problemReport?: string | null;
  selectedProfileId: string | null;
  selectedPresetName?: string | null;
  filamentComplianceMode?: "snapmaker" | "polymaker" | "generic" | null;
  filamentNotes?: string[] | null;
  matchedProfile: {
    profileId: string;
    nozzleDiameter: string;
    exact: boolean;
  } | null;
  downloadUrl: string | null;
  downloadFilename: string | null;
  downloadBlob?: Blob | null;
  warnings: string[];
  notes?: ConvertNote[] | null;
  errorMessage: string | null;
  errorCode: string | null;
  referrer?: string | null;
  whatChanged?: WhatChanged | null;
  nozzleSize?: string | null;
  layerHeight?: number | null;
  aboveStockChoices?: { keep: string[]; stock: string[] } | null;
}
