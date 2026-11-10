// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Polyfill $state rune for Node tsx environment before importing .svelte.ts
(globalThis as any).$state = <T>(v: T): T => v;

const {
  NozzleSizeState,
  STORAGE_KEY,
} = await import("./nozzleSizeState.svelte");

class MockStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
}

class ThrowingStorage implements Storage {
  get length(): number { return 0; }
  clear(): void { throw new Error("SecurityError: Access denied"); }
  getItem(): string | null { throw new Error("SecurityError: Access denied"); }
  key(): string | null { throw new Error("SecurityError: Access denied"); }
  removeItem(): void { throw new Error("SecurityError: Access denied"); }
  setItem(): void { throw new Error("QuotaExceededError"); }
}

describe("NozzleSizeState", () => {
  it("defaults to 0.4 on a fresh visit without storage", () => {
    const storage = new MockStorage();
    const state = new NozzleSizeState(storage);
    assert.equal(state.value, "0.4");
  });

  it("loads a saved nozzle choice from localStorage", () => {
    for (const valid of ["0.2", "0.4", "0.6", "0.8", "match"] as const) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, valid);
      const state = new NozzleSizeState(storage);
      assert.equal(state.value, valid);
    }
  });

  it("persists setValue updates to localStorage", () => {
    const storage = new MockStorage();
    const state = new NozzleSizeState(storage);
    state.setValue("0.6");
    assert.equal(state.value, "0.6");
    assert.equal(storage.getItem(STORAGE_KEY), "0.6");

    state.setValue("match");
    assert.equal(state.value, "match");
    assert.equal(storage.getItem(STORAGE_KEY), "match");
  });

  it("ignores bad stored values and falls back to 0.4", () => {
    for (const bad of ["invalid", "0.5", "1.0", "", "null", "undefined", "{}", "<script>"]) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, bad);
      const state = new NozzleSizeState(storage);
      assert.equal(state.value, "0.4", `failed for ${bad}`);
      state.setValue(bad);
      assert.equal(state.value, "0.4", `setValue failed for ${bad}`);
    }
  });

  it("handles throwing storage gracefully without uncaught exceptions", () => {
    const throwingStorage = new ThrowingStorage();
    const state = new NozzleSizeState(throwingStorage);
    assert.equal(state.value, "0.4");
    assert.doesNotThrow(() => {
      state.setValue("0.6");
    });
    assert.equal(state.value, "0.6");
  });
});
