// SPDX-License-Identifier: MIT
import { FILAMENT_COLOR_ROWS } from "./filamentColorNames.js";

/** One (vendor, product line, hex) -> real product color name entry. */
export interface FilamentColorEntry {
  vendor: "bambu" | "polymaker";
  /** The product line as the vendor names it, e.g. "PLA Matte" or "Panchroma™ Matte PLA". */
  type: string;
  hex: string;
  name: string;
}

/** The filament makers the color library covers today; a later any2orca release may add one. */
export type FilamentColorVendor = "bambu" | "polymaker" | (string & {});
/** The real product color name a slot's preset and hex match. */
export interface FilamentColorMatch {
  vendor: FilamentColorVendor;
  name: string;
}

/**
 * Every entry by its normalized product line, then its hex, built once when
 * the module loads, so looking up a slot reads two maps instead of
 * normalizing every row's product line again. When two rows share a line and
 * a hex, the first one counts, as a scan in row order found it.
 */
const BY_TYPE_AND_HEX = new Map<string, Map<string, FilamentColorMatch>>();
for (const [vendor, type, hex, name] of FILAMENT_COLOR_ROWS) {
  const key = normalizeType(type);
  const byHex = BY_TYPE_AND_HEX.get(key) ?? new Map<string, FilamentColorMatch>();
  if (!byHex.has(hex)) byHex.set(hex, { vendor, name });
  BY_TYPE_AND_HEX.set(key, byHex);
}

/**
 * Extracts the product-line string from a Bambu-style `filament_settings_id`
 * (e.g. `"Bambu PLA Matte @BBL P1S 0.4 nozzle"` -> `"PLA Matte"`), which is
 * the only piece needed to disambiguate colors that collide across product
 * lines (see lookupFilamentColorName). Strips a leading "Bambu " vendor
 * prefix (Bambu's own naming convention, confirmed against real exported
 * files) and everything from " @" onward (the printer/nozzle scope).
 *
 * Third-party filament profiles (e.g. Polymaker) don't share one fixed
 * naming convention the way Bambu's own presets do, so this only strips the
 * "Bambu " prefix specifically -- for anything else, the string is returned
 * with just the " @..." suffix trimmed, which is enough to match this
 * package's own Polymaker `type` values directly since none of them use an
 * "@printer" scope. Returns null for an empty/unparseable input.
 */
export function parseFilamentType(filamentSettingsId: string): string | null {
  const withoutScope = filamentSettingsId.split(" @")[0]?.trim();
  if (!withoutScope) return null;
  const withoutBambuPrefix = withoutScope.replace(/^Bambu\s+/, "");
  return withoutBambuPrefix || null;
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().toUpperCase();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function normalizeType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Looks up the real vendor product name for a filament slot, given its
 * `filament_settings_id` (used to identify the product line) and
 * `filament_colour` hex. Matches on **both** product line and hex, never
 * hex alone -- the same hex (e.g. `#000000`) is a genuinely different
 * product across lines (Bambu's own "PLA Basic" ships it as "Basic Black",
 * "PLA Matte" as "Matte Charcoal"), so hex-only matching would either be
 * ambiguous or silently pick the wrong one.
 *
 * Returns `null` on no exact match rather than guessing a close color --
 * callers should fall back to showing the raw hex code in that case, same
 * as if this function didn't exist. Coverage is a curated snapshot (see
 * see NOTICE for provenance),
 * not exhaustive -- a miss just means "not in the snapshot yet," not "not
 * a real product."
 */
export function lookupFilamentColorName(filamentSettingsId: string, hex: string): FilamentColorMatch | null {
  const type = parseFilamentType(filamentSettingsId);
  if (!type) return null;
  const match = BY_TYPE_AND_HEX.get(normalizeType(type))?.get(normalizeHex(hex));
  return match ? { vendor: match.vendor, name: match.name } : null;
}
