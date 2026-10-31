// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Polyfill $state rune for Node tsx environment before importing .svelte.ts
(globalThis as any).$state = <T>(v: T): T => v;

const { SnapmakerOrcaReleaseState, STORAGE_KEY } = await import("./snapmakerOrcaReleaseState.svelte");

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

const RELEASES = [
  { version: "2.4.1", application: "Snapmaker_Orca-2.4.1", isDefault: true },
  { version: "2.4.0", application: "Snapmaker_Orca-2.4.0", isDefault: false },
];

describe("SnapmakerOrcaReleaseState", () => {
  it("defaults to the newest release, sending no version to the worker", () => {
    const state = new SnapmakerOrcaReleaseState(new MockStorage());
    state.setReleases(RELEASES);
    assert.equal(state.version, null);
    assert.deepEqual(state.option, {});
    assert.equal(state.current?.version, "2.4.1");
  });

  it("picks an older release, sends it to the worker, and saves it for the session", () => {
    const storage = new MockStorage();
    const state = new SnapmakerOrcaReleaseState(storage);
    state.setReleases(RELEASES);
    state.setVersion("2.4.0");
    assert.deepEqual(state.option, { snapmakerOrcaVersion: "2.4.0" });
    assert.equal(state.current?.version, "2.4.0");
    assert.equal(storage.getItem(STORAGE_KEY), "2.4.0");
    state.setVersion(null);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });

  it("treats picking the newest release as the default, so nothing is saved", () => {
    const storage = new MockStorage();
    const state = new SnapmakerOrcaReleaseState(storage);
    state.setReleases(RELEASES);
    state.setVersion("2.4.1");
    assert.equal(state.version, null);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });

  it("restores a saved release the catalog still holds", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "2.4.0");
    const state = new SnapmakerOrcaReleaseState(storage);
    state.setReleases(RELEASES);
    assert.equal(state.version, "2.4.0");
  });

  it("drops a saved release the catalog no longer holds, or that became the default", () => {
    for (const saved of ["2.3.6", "2.4.1"]) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, saved);
      const state = new SnapmakerOrcaReleaseState(storage);
      state.setReleases(RELEASES);
      assert.equal(state.version, null, saved);
      assert.equal(storage.getItem(STORAGE_KEY), null, saved);
    }
  });

  it("ignores stored values that aren't a plain version, and refuses to pick one", () => {
    for (const bad of ["../2.4.0", "2.4", "v2.4.0", "2.4.0 ", "<script>", "{}", "2.4.0\n"]) {
      const storage = new MockStorage();
      storage.setItem(STORAGE_KEY, bad);
      const state = new SnapmakerOrcaReleaseState(storage);
      assert.equal(state.version, null, bad);
      state.setReleases(RELEASES);
      state.setVersion(bad);
      assert.equal(state.version, null, bad);
      assert.deepEqual(state.option, {}, bad);
    }
  });

  it("keeps working when storage throws", () => {
    const state = new SnapmakerOrcaReleaseState(new ThrowingStorage());
    state.setReleases(RELEASES);
    assert.doesNotThrow(() => state.setVersion("2.4.0"));
    assert.equal(state.version, "2.4.0");
  });

  it("tells the worker calls about every change, starting with the saved choice", () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY, "2.4.0");
    const published: unknown[] = [];
    const state = new SnapmakerOrcaReleaseState(storage, (option) => published.push(option));
    state.setReleases(RELEASES);
    state.setVersion(null);
    state.setVersion("9.9.9");
    assert.deepEqual(published, [{ snapmakerOrcaVersion: "2.4.0" }, {}, {}]);
  });

  it("works with no storage at all", () => {
    const state = new SnapmakerOrcaReleaseState(null);
    state.setReleases(RELEASES);
    state.setVersion("2.4.0");
    assert.equal(state.version, "2.4.0");
  });
});
