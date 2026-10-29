// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDemoModelUrl,
  parseManifestParam,
  downloadManifestFiles,
  parseHandoffMessage,
  MAX_MANIFEST_PARAM_LENGTH,
  MAX_MANIFEST_ENTRIES,
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
} from "./handoff";

describe("handoff: parseManifestParam", () => {
  it("parses valid single and multi-entry manifests", () => {
    const single = JSON.stringify([{ name: "desk-set.3mf", url: "https://cdn.example.com/desk-set.3mf" }]);
    const res1 = parseManifestParam(single);
    assert.equal(res1.ok, true);
    if (res1.ok) {
      assert.equal(res1.files.length, 1);
      assert.equal(res1.files[0].name, "desk-set.3mf");
      assert.equal(res1.files[0].url, "https://cdn.example.com/desk-set.3mf");
      assert.deepEqual(res1.hosts, ["cdn.example.com"]);
    }

    const multi = JSON.stringify([
      { name: "part1.3mf", url: "https://a.com/1.3mf" },
      { name: "part2.3mf", url: "https://b.com/2.3mf" },
      { name: "part3.3mf", url: "https://a.com/3.3mf" },
    ]);
    const res2 = parseManifestParam(multi);
    assert.equal(res2.ok, true);
    if (res2.ok) {
      assert.equal(res2.files.length, 3);
      assert.deepEqual(res2.hosts, ["a.com", "b.com"]);
    }
  });

  it("rejects non-string parameter", () => {
    const res = parseManifestParam(null as unknown as string);
    assert.equal(res.ok, false);
  });

  it("rejects oversized parameter (> 8 KB)", () => {
    const huge = "a".repeat(MAX_MANIFEST_PARAM_LENGTH + 1);
    const res = parseManifestParam(huge);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /8 KB limit/);
    }
  });

  it("rejects malformed JSON", () => {
    const res = parseManifestParam("{ not json ]");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /valid JSON/);
    }
  });

  it("rejects a non-array or empty list", () => {
    assert.equal(parseManifestParam(JSON.stringify({})).ok, false);
    assert.equal(parseManifestParam(JSON.stringify([])).ok, false);
    assert.equal(parseManifestParam(JSON.stringify("not an array")).ok, false);
  });

  it("rejects manifests with too many entries (> 20)", () => {
    const items = Array.from({ length: MAX_MANIFEST_ENTRIES + 1 }, (_, i) => ({
      name: `item${i}.3mf`,
      url: `https://example.com/${i}.3mf`,
    }));
    const res = parseManifestParam(JSON.stringify(items));
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /limit of 20 files/);
    }
  });

  it("rejects missing, empty, or oversized name", () => {
    const missingName = JSON.stringify([{ url: "https://cdn.example.com/1.3mf" }]);
    assert.equal(parseManifestParam(missingName).ok, false);

    const emptyName = JSON.stringify([{ name: "   ", url: "https://cdn.example.com/1.3mf" }]);
    assert.equal(parseManifestParam(emptyName).ok, false);

    const hugeName = JSON.stringify([{ name: "a".repeat(MAX_FILE_NAME_LENGTH + 1), url: "https://cdn.example.com/1.3mf" }]);
    assert.equal(parseManifestParam(hugeName).ok, false);
  });

  it("rejects non-https URLs in production", () => {
    const http = JSON.stringify([{ name: "model.3mf", url: "http://cdn.example.com/model.3mf" }]);
    const res = parseManifestParam(http, false);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /secure https/);
    }

    const localhostInProd = JSON.stringify([{ name: "model.3mf", url: "http://localhost:3000/model.3mf" }]);
    assert.equal(parseManifestParam(localhostInProd, false).ok, false);
  });

  it("allows localhost http URLs in dev mode", () => {
    const localhostInDev = JSON.stringify([{ name: "model.3mf", url: "http://localhost:3000/model.3mf" }]);
    assert.equal(parseManifestParam(localhostInDev, true).ok, true);

    const ipInDev = JSON.stringify([{ name: "model.3mf", url: "http://127.0.0.1:5173/model.3mf" }]);
    assert.equal(parseManifestParam(ipInDev, true).ok, true);

    // External http still rejected in dev
    const externalInDev = JSON.stringify([{ name: "model.3mf", url: "http://example.com/model.3mf" }]);
    assert.equal(parseManifestParam(externalInDev, true).ok, false);
  });

  it("rejects dangerous or malformed URL schemes (javascript:, file:, data:)", () => {
    const jsUrl = JSON.stringify([{ name: "model.3mf", url: "javascript:alert(1)" }]);
    assert.equal(parseManifestParam(jsUrl).ok, false);

    const dataUrl = JSON.stringify([{ name: "model.3mf", url: "data:text/plain;base64,AAA" }]);
    assert.equal(parseManifestParam(dataUrl).ok, false);

    const fileUrl = JSON.stringify([{ name: "model.3mf", url: "file:///etc/passwd" }]);
    assert.equal(parseManifestParam(fileUrl).ok, false);
  });
});

describe("handoff: parseHandoffMessage", () => {
  const dummyOpener = {} as Window;

  it("parses valid handoff with ArrayBuffer and Uint8Array", () => {
    const payload = {
      type: "any2orca-import",
      files: [
        { name: "part1.3mf", buffer: new ArrayBuffer(100) },
        { name: "part2.3mf", buffer: new Uint8Array(200) },
      ],
    };

    const res = parseHandoffMessage(payload, dummyOpener, dummyOpener);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.files.length, 2);
      assert.equal(res.files[0].name, "part1.3mf");
      assert.equal(res.files[0].buffer.byteLength, 100);
      assert.equal(res.files[1].name, "part2.3mf");
      assert.equal(res.files[1].buffer.byteLength, 200);
    }
  });

  it("silently ignores messages from unauthorized windows", () => {
    const wrongWindow = {} as Window;
    const payload = { type: "any2orca-import", files: [{ name: "a.3mf", buffer: new ArrayBuffer(10) }] };
    const res = parseHandoffMessage(payload, wrongWindow, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, true);
    }
  });

  it("silently ignores messages without any2orca-import type", () => {
    const payload = { type: "other-event", data: 123 };
    const res = parseHandoffMessage(payload, dummyOpener, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, true);
    }
  });

  it("rejects non-array or empty files list", () => {
    const empty = { type: "any2orca-import", files: [] };
    const res = parseHandoffMessage(empty, dummyOpener, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, false);
      assert.match(res.error, /non-empty 'files' array/);
    }
  });

  it("rejects too many entries (> 20)", () => {
    const files = Array.from({ length: MAX_MANIFEST_ENTRIES + 1 }, (_, i) => ({
      name: `file${i}.3mf`,
      buffer: new ArrayBuffer(10),
    }));
    const payload = { type: "any2orca-import", files };
    const res = parseHandoffMessage(payload, dummyOpener, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, false);
      assert.match(res.error, /limit of 20 files/);
    }
  });

  it("rejects non-buffer buffer property", () => {
    const payload = {
      type: "any2orca-import",
      files: [{ name: "model.3mf", buffer: "not a buffer" }],
    };
    const res = parseHandoffMessage(payload, dummyOpener, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, false);
      assert.match(res.error, /ArrayBuffer or Uint8Array/);
    }
  });

  it("rejects oversized buffers (> 512 MB file or > 1 GB total)", () => {
    const fakeOversizedBuffer = {
      byteLength: MAX_FILE_BYTES + 1,
    } as unknown as Uint8Array;
    Object.setPrototypeOf(fakeOversizedBuffer, Uint8Array.prototype);

    const payload = {
      type: "any2orca-import",
      files: [{ name: "huge.3mf", buffer: fakeOversizedBuffer }],
    };
    const res = parseHandoffMessage(payload, dummyOpener, dummyOpener);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.ignore, false);
      assert.match(res.error, /512 MB limit/);
    }
  });
});

describe("handoff: getDemoModelUrl", () => {
  it("resolves demo model against root base URL", () => {
    assert.equal(getDemoModelUrl("/"), "/demo-model.3mf");
  });

  it("resolves demo model against subpath base URL with or without trailing slash", () => {
    assert.equal(getDemoModelUrl("/tools/any2orca/"), "/tools/any2orca/demo-model.3mf");
    assert.equal(getDemoModelUrl("/tools/any2orca"), "/tools/any2orca/demo-model.3mf");
  });
});

describe("handoff: N-46 credential and redirect checks", () => {
  it("parseManifestParam rejects URLs with user credentials", () => {
    const withCreds = JSON.stringify([{ name: "test.3mf", url: "https://user:pass@example.com/test.3mf" }]);
    const res = parseManifestParam(withCreds);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /credentials/i);
    }
  });

  it("downloadManifestFiles refuses cross-host redirects", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response("dummy content", {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      };
      // Mock response.url pointing to a different origin
      const customFetch = async (url: string | URL | Request) => {
        const resp = new Response("dummy content", { status: 200 });
        Object.defineProperty(resp, "url", { value: "https://evil.attacker.com/malicious.3mf" });
        return resp;
      };
      globalThis.fetch = customFetch as any;

      await assert.rejects(
        () => downloadManifestFiles([{ name: "model.3mf", url: "https://trusted.example.com/model.3mf" }]),
        /Cross-origin redirect refused/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
