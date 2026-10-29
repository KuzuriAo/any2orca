// SPDX-License-Identifier: AGPL-3.0-or-later

import { BooleanSetting, getStorage } from "./storage.svelte";

export const STORAGE_KEY = "any2orca_hardened_nozzle";

export class HardenedNozzleState extends BooleanSetting {
  constructor(storage: Storage | null = getStorage("session")) {
    super(STORAGE_KEY, false, storage);
  }
}

export const hardenedNozzleStore = new HardenedNozzleState();
