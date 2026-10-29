// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Polyfill $state rune for Node tsx environment before importing .svelte.ts
(globalThis as any).$state = <T>(v: T): T => v;

const {
  HighFlowState,
  STORAGE_KEY,
  INSTALLED_KEY,
  isValidToolheadSelection,
} = await import("./highFlowState.svelte");
type ToolheadSelection = [boolean, boolean, boolean, boolean];

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

describe("isValidToolheadSelection", () => {
  it("accepts valid 4-element boolean tuples", () => {
    assert.equal(isValidToolheadSelection([true, false, true, false]), true);
    assert.equal(isValidToolheadSelection([false, false, false, false]), true);
    assert.equal(isValidToolheadSelection([true, true, true, true]), true);
  });

  it("rejects non-arrays and wrong lengths", () => {
    assert.equal(isValidToolheadSelection(null), false);
    assert.equal(isValidToolheadSelection(undefined), false);
    assert.equal(isValidToolheadSelection("test"), false);
    assert.equal(isValidToolheadSelection(true), false);
    assert.equal(isValidToolheadSelection([true, false]), false);
    assert.equal(isValidToolheadSelection([true, false, true]), false);
    assert.equal(isValidToolheadSelection([true, false, true, false, true]), false);
  });

  it("rejects arrays with non-boolean elements", () => {
    assert.equal(isValidToolheadSelection([true, "true", false, false]), false);
    assert.equal(isValidToolheadSelection([1, 0, 1, 0]), false);
    assert.equal(isValidToolheadSelection([null, false, false, false]), false);
  });
});

describe("HighFlowState", () => {
  it("a fresh visit starts with switch off, nothing selected, and summary none", () => {
    const storage = new MockStorage();
    const state = new HighFlowState(storage);
    assert.deepEqual(state.toolheads, [false, false, false, false]);
    assert.equal(state.installed, false);
    assert.equal(state.enabled, false);
    assert.equal(state.summary, "High-flow hotends: none");
  });

  it("turning toggle on sets installed to true, but toolheads defaults to no nozzles selected", () => {
    const storage = new MockStorage();
    const state = new HighFlowState(storage);
    state.toggle();
    assert.equal(state.installed, true);
    assert.deepEqual(state.toolheads, [false, false, false, false]);
    assert.equal(state.enabled, false);
    assert.equal(state.summary, "High-flow hotends: none");
  });

  it("session storage instead of local: loads valid stored toolheads and writes back to sessionStorage", () => {
    const storage = new MockStorage();
    const expected: ToolheadSelection = [true, false, true, false];
    storage.setItem(STORAGE_KEY, JSON.stringify(expected));
    storage.setItem(INSTALLED_KEY, "true");
    const state = new HighFlowState(storage);
    assert.deepEqual(state.toolheads, expected);
    assert.equal(state.installed, true);
    assert.equal(state.enabled, true);
    assert.equal(state.summary, "High-flow hotends: T1, T3");

    // Writing back to session storage
    state.setToolhead(1, true);
    assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify([true, true, true, false]));
  });

  it("no migration: ignores any old any2orca_high_flow_hotend key completely", () => {
    const storage = new MockStorage();
    storage.setItem("any2orca_high_flow_hotend", "true");
    const state = new HighFlowState(storage);
    assert.equal(state.installed, false);
    assert.deepEqual(state.toolheads, [false, false, false, false]);
    assert.equal(state.enabled, false);
    assert.equal(state.summary, "High-flow hotends: none");
  });

  it("invalid stored values: falls back to all false when stored value is invalid JSON or wrong shape", () => {
    const badInputs = [
      "not-json",
      JSON.stringify([true, false]),
      JSON.stringify([true, false, true, false, true]),
      JSON.stringify([true, "invalid", false, false]),
      JSON.stringify({ t1: true }),
      "12345",
    ];
    for (const bad of badInputs) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, bad);
      const state = new HighFlowState(storage);
      assert.deepEqual(state.toolheads, [false, false, false, false]);
      assert.equal(state.enabled, false);
      assert.equal(state.summary, "High-flow hotends: none");
    }
  });

  it("handles throwing storage gracefully without unhandled exceptions", () => {
    const throwingStorage = new ThrowingStorage();
    const state = new HighFlowState(throwingStorage);
    assert.equal(state.installed, false);
    assert.deepEqual(state.toolheads, [false, false, false, false]);
    assert.doesNotThrow(() => {
      state.selectAll();
      state.toggle();
    });
  });

  it("summary updates live as toolheads change", () => {
    const storage = new MockStorage();
    const state = new HighFlowState(storage);
    assert.equal(state.summary, "High-flow hotends: none");

    state.toggle(); // installed = true, toolheads all false
    assert.equal(state.summary, "High-flow hotends: none");

    state.setToolhead(0, true);
    assert.equal(state.summary, "High-flow hotends: T1");

    state.setToolhead(2, true);
    assert.equal(state.summary, "High-flow hotends: T1, T3");

    state.selectAll();
    assert.equal(state.summary, "High-flow hotends: T1, T2, T3, T4");

    state.toggle(); // toggle off
    assert.equal(state.summary, "High-flow hotends: none");

    state.toggle(); // toggle back on with remembered selections
    assert.equal(state.summary, "High-flow hotends: T1, T2, T3, T4");

    state.deselectAll();
    assert.equal(state.summary, "High-flow hotends: none");
  });
});
