// SPDX-License-Identifier: AGPL-3.0-or-later
import { DEFAULT_NOZZLE, NOZZLE_CHOICES, type KnownNozzleChoice } from "any2orca";
import { setNozzleOption } from "./api";
import { Setting, getStorage } from "./storage.svelte";

export const STORAGE_KEY = "any2orca_nozzle_size";

export class NozzleSizeState extends Setting<KnownNozzleChoice> {
  private publish: (nozzle: KnownNozzleChoice) => void;

  constructor(
    storage: Storage | null = getStorage("local"),
    publish: (nozzle: KnownNozzleChoice) => void = setNozzleOption
  ) {
    super(STORAGE_KEY, DEFAULT_NOZZLE, NOZZLE_CHOICES, storage);
    this.publish = publish;
    this.publish(this.value);
  }

  override setValue(next: string): void {
    super.setValue(next);
    this.publish(this.value);
  }
}

export const nozzleSizeStore = new NozzleSizeState();
