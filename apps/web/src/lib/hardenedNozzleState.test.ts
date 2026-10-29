// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Polyfill $state rune for Node tsx environment before importing .svelte.ts
(globalThis as any).$state = <T>(v: T): T => v;

const {
  HardenedNozzleState,
  STORAGE_KEY,
} = await import("./hardenedNozzleState.svelte");

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

describe("HardenedNozzleState", () => {
  it("defaults to disabled (unchecked) on a fresh visit without storage", () => {
    const storage = new MockStorage();
    const state = new HardenedNozzleState(storage);
    assert.equal(state.enabled, false);
  });

  it("toggling changes enabled state and persists to sessionStorage", () => {
    const storage = new MockStorage();
    const state = new HardenedNozzleState(storage);
    state.toggle();
    assert.equal(state.enabled, true);
    assert.equal(storage.getItem(STORAGE_KEY), "true");

    state.toggle();
    assert.equal(state.enabled, false);
    assert.equal(storage.getItem(STORAGE_KEY), "false");
  });

  it("loads stored true value as enabled from sessionStorage", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "true");
    const state = new HardenedNozzleState(storage);
    assert.equal(state.enabled, true);
  });

  it("loads stored false value as disabled from sessionStorage", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "false");
    const state = new HardenedNozzleState(storage);
    assert.equal(state.enabled, false);
  });

  it("ignores untrusted, corrupted, or non-boolean strings and falls back to disabled", () => {
    for (const bad of ["invalid", "1", "yes", "null", "undefined", "{}", "[]"]) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, bad);
      const state = new HardenedNozzleState(storage);
      assert.equal(state.enabled, false, `failed for ${bad}`);
    }
  });

  it("persists setEnabled updates to sessionStorage", () => {
    const storage = new MockStorage();
    const state = new HardenedNozzleState(storage);
    state.setEnabled(true);
    assert.equal(state.enabled, true);
    assert.equal(storage.getItem(STORAGE_KEY), "true");

    state.setEnabled(false);
    assert.equal(state.enabled, false);
    assert.equal(storage.getItem(STORAGE_KEY), "false");
  });

  it("handles throwing storage gracefully without uncaught exceptions", () => {
    const throwingStorage = new ThrowingStorage();
    const state = new HardenedNozzleState(throwingStorage);
    assert.equal(state.enabled, false);
    assert.doesNotThrow(() => {
      state.setEnabled(true);
      state.toggle();
    });
  });
});
