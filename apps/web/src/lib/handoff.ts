// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ManifestFile {
  name: string;
  url: string;
}

export interface ManifestParseSuccess {
  ok: true;
  files: ManifestFile[];
  hosts: string[];
}

export interface ManifestParseError {
  ok: false;
  error: string;
}

export type ManifestParseResult = ManifestParseSuccess | ManifestParseError;

export interface HandoffFile {
  name: string;
  buffer: Uint8Array;
}

export interface HandoffParseSuccess {
  ok: true;
  files: HandoffFile[];
}

export interface HandoffParseError {
  ok: false;
  ignore: boolean;
  error: string;
}

export type HandoffParseResult = HandoffParseSuccess | HandoffParseError;

export const MAX_MANIFEST_PARAM_LENGTH = 8192; // 8 KB
export const MAX_MANIFEST_ENTRIES = 20;
export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB

/**
 * Validates the raw ?manifest= URL parameter string without initiating any network requests.
 */
export function parseManifestParam(raw: string, isDev = false): ManifestParseResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Manifest parameter must be a string." };
  }

  if (raw.length > MAX_MANIFEST_PARAM_LENGTH) {
    return { ok: false, error: "Manifest parameter exceeds the 8 KB limit." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid manifest format. The 'manifest' URL query parameter must be valid JSON." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "Manifest must be a non-empty array of file items." };
  }

  if (parsed.length > MAX_MANIFEST_ENTRIES) {
    return { ok: false, error: `Manifest exceeds the limit of ${MAX_MANIFEST_ENTRIES} files.` };
  }

  const files: ManifestFile[] = [];
  const hosts = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: `Manifest item ${i + 1} must be an object.` };
    }

    const { name, url } = item as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      return { ok: false, error: `Manifest item ${i + 1} has an invalid or missing 'name'.` };
    }
    const trimmedName = name.trim();
    if (trimmedName.length > MAX_FILE_NAME_LENGTH) {
      return { ok: false, error: `Manifest item ${i + 1} name exceeds the ${MAX_FILE_NAME_LENGTH} character limit.` };
    }

    if (typeof url !== "string" || !url.trim()) {
      return { ok: false, error: `Manifest item ${i + 1} has an invalid or missing 'url'.` };
    }
    const trimmedUrl = url.trim();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return { ok: false, error: `Manifest item "${trimmedName}" has an invalid URL: ${trimmedUrl}` };
    }

    if (parsedUrl.username || parsedUrl.password) {
      return { ok: false, error: `Manifest item "${trimmedName}" cannot contain user credentials in the URL.` };
    }

    const protocol = parsedUrl.protocol.toLowerCase();
    const isAllowedHttp =
      isDev &&
      protocol === "http:" &&
      (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");

    if (protocol !== "https:" && !isAllowedHttp) {
      return {
        ok: false,
        error: `Only secure https URLs are permitted in manifest links (received: ${trimmedUrl}).`,
      };
    }

    files.push({ name: trimmedName, url: trimmedUrl });
    hosts.add(parsedUrl.host);
  }

  return {
    ok: true,
    files,
    hosts: Array.from(hosts).sort(),
  };
}

/**
 * Downloads manifest files with size limits (512 MB per file, 1 GB total) and credentials: omit.
 */
export async function downloadManifestFiles(
  files: ManifestFile[],
  onProgress?: (stageMessage: string, progressPercent: number) => void
): Promise<File[]> {
  const result: File[] = [];
  let totalBytesAcrossAllFiles = 0;

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const pct = Math.round(10 + ((i + 1) / files.length) * 30);
    onProgress?.(`Downloading ${item.name} (${i + 1}/${files.length})...`, pct);

    let res: Response;
    try {
      res = await fetch(item.url, { credentials: "omit", redirect: "error" });
    } catch {
      throw new Error(
        `Couldn't load "${item.name}" from the link. The server may not allow downloads from other sites (CORS), may redirect to another address (redirects aren't followed), or the network may have failed. Try downloading it directly and dragging it here.`
      );
    }

    if (!res.ok) {
      throw new Error(
        `Couldn't load "${item.name}" from the link (HTTP ${res.status}). Try downloading it directly and dragging it here.`
      );
    }

    const expectedOrigin = new URL(item.url).origin;
    if (res.url) {
      try {
        const finalOrigin = new URL(res.url).origin;
        if (finalOrigin !== expectedOrigin) {
          throw new Error(
            `Cross-origin redirect refused for "${item.name}" (from ${expectedOrigin} to ${finalOrigin}).`
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith("Cross-origin redirect refused")) {
          throw err;
        }
        throw new Error(`Invalid destination URL for "${item.name}".`);
      }
    }

    const clHeader = res.headers.get("Content-Length");
    if (clHeader) {
      const declaredLen = parseInt(clHeader, 10);
      if (!Number.isNaN(declaredLen)) {
        if (declaredLen > MAX_FILE_BYTES) {
          throw new Error(`File "${item.name}" exceeds the 512 MB limit.`);
        }
        if (totalBytesAcrossAllFiles + declaredLen > MAX_TOTAL_BYTES) {
          throw new Error("Total manifest download exceeds the 1 GB limit.");
        }
      }
    }

    if (!res.body) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_FILE_BYTES) {
        throw new Error(`File "${item.name}" exceeds the 512 MB limit.`);
      }
      totalBytesAcrossAllFiles += buf.byteLength;
      if (totalBytesAcrossAllFiles > MAX_TOTAL_BYTES) {
        throw new Error("Total manifest download exceeds the 1 GB limit.");
      }
      result.push(new File([buf], item.name, { type: "application/octet-stream" }));
      continue;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let fileBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          fileBytes += value.byteLength;
          if (fileBytes > MAX_FILE_BYTES) {
            await reader.cancel();
            throw new Error(`File "${item.name}" exceeds the 512 MB limit.`);
          }
          if (totalBytesAcrossAllFiles + fileBytes > MAX_TOTAL_BYTES) {
            await reader.cancel();
            throw new Error("Total manifest download exceeds the 1 GB limit.");
          }
          chunks.push(value);
        }
      }
    } catch (err) {
      await reader.cancel().catch(() => {});
      throw err;
    }

    totalBytesAcrossAllFiles += fileBytes;

    const combined = new Uint8Array(fileBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    result.push(new File([combined], item.name, { type: "application/octet-stream" }));
  }

  return result;
}

/**
 * Validates incoming postMessage payloads, ensuring origin authorization and strict shape/size bounds.
 */
export function parseHandoffMessage(
  data: unknown,
  source?: MessageEventSource | null,
  expectedOpener?: Window | null
): HandoffParseResult {
  if (expectedOpener !== undefined) {
    if (!expectedOpener || source !== expectedOpener) {
      return { ok: false, ignore: true, error: "Ignored message from unauthorized window." };
    }
  }

  if (typeof data !== "object" || data === null) {
    return { ok: false, ignore: true, error: "Invalid message payload." };
  }

  const { type, files: rawFiles } = data as Record<string, unknown>;

  if (type !== "any2orca-import") {
    return { ok: false, ignore: true, error: "Ignored message with unknown type." };
  }

  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return { ok: false, ignore: false, error: "Handoff payload must contain a non-empty 'files' array." };
  }

  if (rawFiles.length > MAX_MANIFEST_ENTRIES) {
    return { ok: false, ignore: false, error: `Handoff exceeds the limit of ${MAX_MANIFEST_ENTRIES} files.` };
  }

  const files: HandoffFile[] = [];
  let totalBytes = 0;

  for (let i = 0; i < rawFiles.length; i++) {
    const item = rawFiles[i];
    if (typeof item !== "object" || item === null) {
      return { ok: false, ignore: false, error: `Handoff item ${i + 1} must be an object.` };
    }

    const { name, buffer } = item as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      return { ok: false, ignore: false, error: `Handoff item ${i + 1} has an invalid or missing 'name'.` };
    }
    const trimmedName = name.trim();
    if (trimmedName.length > MAX_FILE_NAME_LENGTH) {
      return { ok: false, ignore: false, error: `Handoff item ${i + 1} name exceeds the ${MAX_FILE_NAME_LENGTH} character limit.` };
    }

    let byteLength = 0;
    let uint8: Uint8Array;

    if (buffer instanceof Uint8Array) {
      byteLength = buffer.byteLength;
      uint8 = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      byteLength = buffer.byteLength;
      uint8 = new Uint8Array(buffer);
    } else {
      return { ok: false, ignore: false, error: `Handoff item "${trimmedName}" buffer must be an ArrayBuffer or Uint8Array.` };
    }

    if (byteLength > MAX_FILE_BYTES) {
      return { ok: false, ignore: false, error: `Handoff file "${trimmedName}" exceeds the 512 MB limit.` };
    }

    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { ok: false, ignore: false, error: "Total handoff payload exceeds the 1 GB limit." };
    }

    files.push({ name: trimmedName, buffer: uint8 });
  }

  return { ok: true, files };
}

/**
 * Resolves the URL for the demo model 3MF file against Vite's BASE_URL.
 */
export function getDemoModelUrl(baseUrl: string = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/"): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}demo-model.3mf`;
}
