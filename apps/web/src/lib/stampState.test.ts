// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Polyfill $state rune for Node tsx environment before importing .svelte.ts
(globalThis as any).$state = <T>(v: T): T => v;

const {
  StampState,
  STORAGE_KEY,
} = await import("./stampState.svelte");

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

describe("StampState", () => {
  it("defaults to enabled (checked) on a fresh visit without storage", () => {
    const storage = new MockStorage();
    const state = new StampState(storage);
    assert.equal(state.enabled, true);
  });

  it("remembers unchecked preference from localStorage", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "false");
    const state = new StampState(storage);
    assert.equal(state.enabled, false);
  });

  it("loads stored true value as enabled", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "true");
    const state = new StampState(storage);
    assert.equal(state.enabled, true);
  });

  it("ignores untrusted, corrupted, or non-boolean strings and falls back to enabled", () => {
    const invalidValues = [
      "not-valid",
      "0",
      "1",
      "{}",
      "[true]",
      "null",
      "undefined",
      "off",
      "no",
      "",
    ];
    for (const bad of invalidValues) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, bad);
      const state = new StampState(storage);
      assert.equal(state.enabled, true, `Expected fallback to true for input: ${bad}`);
    }
  });

  it("persists toggle changes to localStorage", () => {
    const storage = new MockStorage();
    const state = new StampState(storage);
    assert.equal(state.enabled, true);

    state.toggle();
    assert.equal(state.enabled, false);
    assert.equal(storage.getItem(STORAGE_KEY), "false");

    state.toggle();
    assert.equal(state.enabled, true);
    assert.equal(storage.getItem(STORAGE_KEY), "true");
  });

  it("persists setEnabled updates to localStorage", () => {
    const storage = new MockStorage();
    const state = new StampState(storage);

    state.setEnabled(false);
    assert.equal(state.enabled, false);
    assert.equal(storage.getItem(STORAGE_KEY), "false");

    state.setEnabled(true);
    assert.equal(state.enabled, true);
    assert.equal(storage.getItem(STORAGE_KEY), "true");
  });

  it("handles throwing storage gracefully without uncaught exceptions", () => {
    const throwingStorage = new ThrowingStorage();
    const state = new StampState(throwingStorage);
    assert.equal(state.enabled, true);
    assert.doesNotThrow(() => {
      state.toggle();
      state.setEnabled(false);
    });
  });
});
