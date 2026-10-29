// SPDX-License-Identifier: AGPL-3.0-or-later

import { BooleanSetting, getStorage } from "./storage.svelte";

export const STORAGE_KEY = "any2orca_stamp";

export class StampState extends BooleanSetting {
  constructor(storage: Storage | null = getStorage("local")) {
    super(STORAGE_KEY, true, storage);
  }
}

export const stampStore = new StampState();
