// SPDX-License-Identifier: MIT
import { OLDER_RELEASE_LIMITS, SETTINGS_CATALOG } from "./settingsCatalog.js";

/** A setting's limits and choices: what Snapmaker Orca accepts for it. */
export interface SettingLimits {
  readonly min: number | null;
  readonly max: number | null;
  readonly choices: readonly string[] | null;
}

function forOlderRelease(key: string, release: string): SettingLimits | undefined {
  if (!Object.hasOwn(OLDER_RELEASE_LIMITS, release) || !Object.hasOwn(OLDER_RELEASE_LIMITS[release], key)) return undefined;
  const newest = SETTINGS_CATALOG[key];
  const d = OLDER_RELEASE_LIMITS[release][key];
  return {
    min: "min" in d ? (d.min ?? null) : newest.min,
    max: "max" in d ? (d.max ?? null) : newest.max,
    choices: "choices" in d ? (d.choices ?? null) : newest.choices,
  };
}

/**
 * What Snapmaker Orca accepts for a setting: for the release given, or, with none, what every supported
 * release accepts (the higher minimum, the lower maximum, the choices they share), for a check made before the
 * release is known, such as reading a PrusaSlicer project. Undefined for a key Snapmaker Orca doesn't have.
 */
export function settingLimits(key: string, release?: string): SettingLimits | undefined {
  if (!Object.hasOwn(SETTINGS_CATALOG, key)) return undefined;
  const { min, max, choices } = SETTINGS_CATALOG[key];
  if (release !== undefined) return forOlderRelease(key, release) ?? { min, max, choices };
  let out: SettingLimits = { min, max, choices };
  for (const older of Object.keys(OLDER_RELEASE_LIMITS)) {
    const o = forOlderRelease(key, older);
    if (!o) continue;
    out = {
      min: o.min === null ? out.min : out.min === null ? o.min : Math.max(out.min, o.min),
      max: o.max === null ? out.max : out.max === null ? o.max : Math.min(out.max, o.max),
      choices: o.choices === null ? out.choices : out.choices === null ? o.choices : out.choices.filter((c) => o.choices!.includes(c)),
    };
  }
  return out;
}
