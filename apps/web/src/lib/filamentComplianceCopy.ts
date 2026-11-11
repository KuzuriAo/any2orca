// SPDX-License-Identifier: AGPL-3.0-or-later

export type ComplianceMode = "generic" | "snapmaker" | null;

export interface FilamentComplianceOption {
  id: "original" | "generic" | "snapmaker";
  value: ComplianceMode;
  label: string;
  description: string;
  tooltip: string;
  badge?: string;
}

export const FILAMENT_COMPLIANCE_HELP =
  "Original keeps the creator's filaments exactly: their names and their settings. Generic and Snapmaker switch each filament to a preset Snapmaker Orca ships, with that preset's own settings, for uploads to Snapmaker Space; colors and order stay. Snapmaker Orca would use the preset's settings anyway once a filament carries its name.";

export const FILAMENT_COMPLIANCE_OPTIONS: readonly FilamentComplianceOption[] = [
  {
    id: "original",
    value: null,
    label: "Original",
    description: "Keep the creator's filaments: names and settings as in the file.",
    tooltip: "Keeps the creator's filament names and settings.",
  },
  {
    id: "generic",
    value: "generic",
    label: "Generic",
    description: "Switch to Generic presets, with their own settings.",
    tooltip: "Sets each filament to a Generic preset Snapmaker Orca ships, with that preset's settings. Colors and order stay.",
  },
  {
    id: "snapmaker",
    value: "snapmaker",
    label: "Snapmaker",
    description: "Switch to Snapmaker presets, with their own settings, for Snapmaker Space.",
    tooltip: "Sets each filament to a Snapmaker preset Snapmaker Orca ships, with that preset's settings, where Snapmaker makes one, and Generic otherwise. Colors and order stay.",
    badge: "Snapmaker Space",
  },
];

export const FILAMENT_COMPLIANCE_FAQ_HTML = `<p>${FILAMENT_COMPLIANCE_HELP}</p>
        <ul>
          <li><strong>Original (Default):</strong> Keeps the creator's filaments: names and settings as in the file (e.g. <em>Bambu PLA Basic</em>, <em>Creality Hyper PLA</em>, <em>Anycubic PLA</em>, <em>Prusament PLA</em>).</li>
          <li><strong>Generic:</strong> Switches each filament to a Generic preset Snapmaker Orca ships (e.g. <em>Generic PLA</em>), with that preset's own settings.</li>
          <li><strong>Snapmaker:</strong> Switches each filament to a Snapmaker preset Snapmaker Orca ships (e.g. <em>Snapmaker PLA SnapSpeed</em>), with that preset's own settings, for Snapmaker Space. Where Snapmaker makes no preset for that kind of filament (plain PETG, for example), the Generic one is used, and where neither fits the nozzle size, its name and settings stay as the creator had them.</li>
        </ul>`;
