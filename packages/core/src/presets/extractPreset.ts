// SPDX-License-Identifier: MIT
import { sameSetting } from "../diff/diffSettings.js";
import { SETTINGS_CATALOG } from "../diff/settingsCatalog.js";
import { Any2orcaError } from "../errors.js";
import { loadCatalog, type ProfileCatalog, type ProfileSource } from "../profiles.js";
import { Project } from "../project.js";
import { checkedChanges, describeChanges, stockValue, type ExtractedPreset } from "./preset.js";
import { isPresetKey } from "./presetKeys.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A profile name as Snapmaker Orca 2.4 writes it: older releases left out the "mm" ("0.20 Standard @..."). */
function profileNameKey(name: string): string {
  return name.trim().replace(/^(\d+(?:\.\d+)?)(?:mm)?\s+/, "$1mm ");
}

function stringSetting(settings: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = settings[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * Makes a preset from a 3MF the user tuned in Snapmaker Orca: finds the U1
 * profile it was tuned on and keeps the print settings that differ from that
 * profile's stock values. Throws `preset_base_unknown` for a file that isn't
 * set up for the U1 (convert it first, tune it, save it, then make the
 * preset), or `invalid_file` / `invalid_project` for a file that can't be read.
 */
export async function extractPreset(input: Uint8Array | Project, options: { profiles: ProfileSource | ProfileCatalog }): Promise<ExtractedPreset> {
  const project = input instanceof Project ? input : Project.open(input);
  const settings = project.settings();
  const catalog = await loadCatalog(options.profiles);
  const notes: string[] = [];

  const printer = [stringSetting(settings, "printer_settings_id"), stringSetting(settings, "printer_model")];
  if (!printer.some((name) => name !== null && name.includes("Snapmaker U1"))) {
    throw new Any2orcaError(
      "preset_base_unknown",
      "This project isn't set up for the Snapmaker U1, so there's nothing to compare it with. Convert it, tune it in Snapmaker Orca, save it, then make the preset from that file.",
    );
  }

  const byName = new Map(catalog.list().map((s) => [profileNameKey(s.displayName), s.id]));
  let base = byName.get(profileNameKey(stringSetting(settings, "print_settings_id") ?? ""));
  let baseInferred = false;
  if (!base) {
    const parent = byName.get(profileNameKey(stringSetting(settings, "inherits_group") ?? ""));
    if (parent) {
      base = parent;
      notes.push(`The project uses its own print preset; its changes are compared with ${catalog.get(parent)?.displayName}, the profile it was made from.`);
    }
  }
  if (!base) {
    const choice = await project.matchProfile(catalog);
    if (choice.profileMatch.matchSource === "default-fallback") {
      throw new Any2orcaError("preset_base_unknown", "This project's nozzle size can't be read, so there's no U1 profile to compare it with.");
    }
    base = choice.profileId;
    baseInferred = true;
    notes.push(`The project doesn't name a U1 profile; it's compared with ${catalog.get(base)?.displayName}, the closest match for its nozzle and layer height.`);
  }

  const loaded = await catalog.load(base);
  const stock = loaded.convertProfile.profile.baselineProjectSettings;
  const differing: Record<string, unknown> = {};
  for (const key of Object.keys(settings)) {
    if (!Object.hasOwn(SETTINGS_CATALOG, key) || SETTINGS_CATALOG[key].group !== "print") continue;
    // Bookkeeping and the hotend-type layout differ from the stock profile's for reasons that aren't tuning; not worth a note.
    if (key === "inherits" || key === "process_flow_support" || key.startsWith("compatible_printers")) continue;
    // A setting the profile doesn't have is noted only when the preset couldn't carry it anyway (a script, say).
    if (!Object.hasOwn(stock, key) && isPresetKey(key)) continue;
    if (sameSetting(stockValue(key, settings[key]), stockValue(key, stock[key]))) continue;
    Object.defineProperty(differing, key, { value: settings[key], enumerable: true });
  }
  const changes = checkedChanges(differing, stock, notes);

  return {
    preset: {
      base,
      baseInferred,
      catalog: { version: catalog.index.dataVersion, tracks: `${catalog.index.slicer.name} ${catalog.index.slicer.version}` },
      changes,
      created: today(),
    },
    changes: describeChanges(changes, stock, loaded.convertProfile.printer.machineSettingsConfig),
    notes,
  };
}
