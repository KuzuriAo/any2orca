// SPDX-License-Identifier: MIT
import type { ProfileCatalog, ProfileSummary } from "../../profiles.js";
import { formatTable } from "../table.js";

/** Renders `any2orca profiles`: one row per profile, sorted by id the way `sort` would. */
export function formatProfiles(profiles: ProfileSummary[]): string {
  // Byte-wise, not localeCompare, so it matches piping through `sort`.
  const sorted = [...profiles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return formatTable(
    sorted.map((p) => [
      p.id,
      p.displayName,
      `${p.nozzleDiameter}mm`,
      p.tierName + (p.autoSelectable ? "" : " (manual-select only)") + (p.highFlowSpeeds ? " (high-flow speeds)" : ""),
    ]),
  );
}

/** `any2orca profiles [--nozzle <mm>]`: what `convert --profile <id>` accepts. */
export function runProfiles(catalog: ProfileCatalog, nozzleDiameter: string | undefined, out: (line: string) => void): void {
  const profiles = catalog.list(nozzleDiameter ? { nozzleDiameter } : {});
  if (profiles.length === 0) {
    out(nozzleDiameter ? `No profiles found for nozzle diameter ${nozzleDiameter}.` : "No profiles found.");
    return;
  }
  out(formatProfiles(profiles));
  const { slicer, dataVersion } = catalog.index;
  out(`\nProfiles track ${slicer.name} ${slicer.version} (catalog ${dataVersion}).`);
  if (profiles.some((p) => p.highFlowSpeeds)) {
    out('"high-flow speeds": has Snapmaker\'s high-flow tuning, used with convert --high-flow (Liber High Flow Hotend on all four toolheads).');
  }
}
