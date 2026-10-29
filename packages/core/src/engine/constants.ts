// SPDX-License-Identifier: MIT
/**
 * Keys inside project_settings.config that describe the per-filament-slot
 * array but aren't part of the standalone filament_settings_N.config
 * shape (which only holds settings for a single filament).
 *
 * Unlike `BLOCKLIST`/`U1_VALUE_KEYS`/`FILAMENT_KEY_BLOCKLIST`, this is a
 * structural fact about the Bambu/Orca settings schema, not per-profile
 * tuning data -- it doesn't vary by printer/profile, so it is a fixed
 * engine constant rather than profile data.
 */
export const EXTRA_PROJECT_LEVEL_FILAMENT_KEYS: ReadonlySet<string> = new Set(["filament_colour", "filament_ids"]);
