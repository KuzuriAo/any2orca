// SPDX-License-Identifier: AGPL-3.0-or-later

export function getStorage(type: "local" | "session" = "local"): Storage | null {
  try {
    if (typeof window !== "undefined") {
      const storage = type === "local" ? window.localStorage : window.sessionStorage;
      if (storage) return storage;
    }
    if (type === "local" && typeof localStorage !== "undefined") {
      return localStorage;
    }
    if (type === "session" && typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export class BooleanSetting {
  enabled = $state<boolean>(false);
  protected key: string;
  protected defaultValue: boolean;
  protected storage: Storage | null;

  constructor(key: string, defaultValue: boolean, storage: Storage | null = getStorage("local")) {
    this.key = key;
    this.defaultValue = defaultValue;
    this.storage = storage;
    this.init();
  }

  private init(): void {
    this.enabled = this.defaultValue;
    if (!this.storage) return;

    try {
      const stored = this.storage.getItem(this.key);
      if (stored === "true") {
        this.enabled = true;
      } else if (stored === "false") {
        this.enabled = false;
      } else {
        this.enabled = this.defaultValue;
      }
    } catch {
      this.enabled = this.defaultValue;
    }
  }

  protected save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, String(this.enabled));
    } catch {
      // Keep in-memory value on storage access restriction
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = Boolean(value);
    this.save();
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.save();
  }
}
