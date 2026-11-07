// SPDX-License-Identifier: MIT
/**
 * The filament naming options' notes for a conversion, in words: the one wording the web app, the command line
 * and any other UI show, so they always say the same thing.
 */
import type { ConvertReport } from "../project.js";

/** The settings a note names first, in this order, with how people say them and their unit. */
const NAMED: ReadonlyArray<[key: string, name: string, unit: string]> = [
  ["nozzle_temperature", "nozzle temperature", " °C"],
  ["nozzle_temperature_initial_layer", "first-layer nozzle temperature", " °C"],
  ["filament_flow_ratio", "flow ratio", ""],
  ["filament_max_volumetric_speed", "max volumetric speed", " mm³/s"],
  ["pressure_advance", "pressure advance", ""],
  ["filament_retraction_length", "retraction length", " mm"],
  ["hot_plate_temp", "bed temperature (smooth PEI)", " °C"],
  ["textured_plate_temp", "bed temperature (textured PEI)", " °C"],
  ["fan_max_speed", "max fan speed", "%"],
];

const list = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * What the Snapmaker or Generic filament option did, one sentence per note: which filaments use a preset's own
 * settings and what that replaced, which use Generic because Snapmaker makes no preset for them, and which kept
 * the creator's name and settings because no preset fits. Empty when the option wasn't used or changed nothing.
 */
export function filamentNotes(report: Pick<ConvertReport, "filamentPresets" | "filamentComplianceFallback" | "filamentComplianceUnchanged">): string[] {
  const notes: string[] = [];
  const byPreset = new Map<string, NonNullable<ConvertReport["filamentPresets"]>>();
  for (const p of report.filamentPresets ?? []) byPreset.set(p.preset, [...(byPreset.get(p.preset) ?? []), p]);
  for (const [preset, slots] of byPreset) {
    const changed = slots.find((s) => s.changed.length > 0)?.changed ?? [];
    const which = `${slots.length === 1 ? "Filament" : "Filaments"} ${list(slots.map((s) => String(s.slot)))}`;
    if (changed.length === 0) {
      notes.push(`${which} ${slots.length === 1 ? "uses" : "use"} ${preset}'s own settings, which match the creator's.`);
      continue;
    }
    // The settings people know by name first; the rest as a count.
    const named = NAMED.flatMap(([key, name, unit]) => {
      const c = changed.find((x) => x.key === key);
      return c && c.before !== "nil" && c.after !== "nil" ? [`${name} ${c.before}${unit} → ${c.after}${unit}`] : [];
    }).slice(0, 3);
    const rest = changed.length - named.length;
    const others = `${rest} other setting${rest === 1 ? "" : "s"}`;
    const what = named.length === 0 ? others : rest > 0 ? `${named.join(", ")}, and ${others}` : list(named);
    notes.push(`${which} ${slots.length === 1 ? "uses" : "use"} ${preset}'s own settings instead of the creator's: ${what}.`);
  }
  const fallback = report.filamentComplianceFallback ?? [];
  if (fallback.length > 0) notes.push(`Snapmaker makes no preset for ${list(fallback)} at this nozzle size, so ${fallback.length === 1 ? "it uses" : "those use"} Generic.`);
  const unchanged = report.filamentComplianceUnchanged ?? [];
  if (unchanged.length > 0) {
    notes.push(`No Snapmaker or Generic preset fits ${list(unchanged)} at this nozzle size, so ${unchanged.length === 1 ? "its name and settings stay" : "their names and settings stay"} as the creator had them. Snapmaker Space may refuse this file.`);
  }
  return notes;
}
