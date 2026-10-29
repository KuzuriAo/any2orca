// SPDX-License-Identifier: AGPL-3.0-or-later
import { getStorage } from "./storage.svelte";

export type ToolheadSelection = [boolean, boolean, boolean, boolean];

export const STORAGE_KEY = "any2orca_high_flow_toolheads";
export const INSTALLED_KEY = "any2orca_high_flow_installed";

const ALL_OFF: ToolheadSelection = [false, false, false, false];

export function isValidToolheadSelection(data: unknown): data is ToolheadSelection {
  return (
    Array.isArray(data) &&
    data.length === 4 &&
    data.every((item) => typeof item === "boolean")
  );
}

// Uses shared getStorage("session") from ./storage

export class HighFlowState {
  installed = $state<boolean>(false);
  toolheads = $state<ToolheadSelection>([...ALL_OFF]);
  private storage: Storage | null;

  constructor(storage: Storage | null = getStorage("session")) {
    this.storage = storage;
    this.init();
  }

  private init(): void {
    this.installed = false;
    this.toolheads = [...ALL_OFF];

    if (!this.storage) return;

    try {
      const storedInstalled = this.storage.getItem(INSTALLED_KEY);
      if (storedInstalled !== null) {
        this.installed = storedInstalled === "true";
      }

      const stored = this.storage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (isValidToolheadSelection(parsed)) {
          this.toolheads = [...parsed];
          if (this.toolheads.some(Boolean)) {
            this.installed = true;
          }
          return;
        }
        this.toolheads = [...ALL_OFF];
        return;
      }
    } catch {
      this.installed = false;
      this.toolheads = [...ALL_OFF];
    }
  }

  get enabled(): boolean {
    return this.installed && this.toolheads.some(Boolean);
  }

  get hasActive(): boolean {
    return this.toolheads.some(Boolean);
  }

  get summary(): string {
    if (!this.enabled) {
      return "High-flow hotends: none";
    }
    const selected: string[] = [];
    for (let i = 0; i < 4; i++) {
      if (this.toolheads[i]) {
        selected.push(`T${i + 1}`);
      }
    }
    return selected.length > 0
      ? `High-flow hotends: ${selected.join(", ")}`
      : "High-flow hotends: none";
  }

  private save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(INSTALLED_KEY, String(this.installed));
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.toolheads));
    } catch {
      // Keep in-memory value on storage access restriction
    }
  }

  setInstalled(value: boolean): void {
    this.installed = value;
    this.save();
  }

  setToolheads(selection: ToolheadSelection): void {
    this.toolheads = [...selection];
    if (this.toolheads.some(Boolean)) {
      this.installed = true;
    }
    this.save();
  }

  setToolhead(index: number, active: boolean): void {
    if (index < 0 || index > 3) return;
    const updated: ToolheadSelection = [...this.toolheads];
    updated[index] = active;
    this.setToolheads(updated);
  }

  toggleToolhead(index: number): void {
    if (index < 0 || index > 3) return;
    this.setToolhead(index, !this.toolheads[index]);
  }

  selectAll(): void {
    this.installed = true;
    this.setToolheads([true, true, true, true]);
  }

  deselectAll(): void {
    this.setToolheads([...ALL_OFF]);
  }

  toggle(): void {
    this.installed = !this.installed;
    this.save();
  }
}

export const highFlowStore = new HighFlowState();
