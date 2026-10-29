// SPDX-License-Identifier: MIT
import { statSync } from "node:fs";

/**
 * Whether two existing paths name the same file or folder. Compares the
 * file system's own identity (device and inode), so a different spelling
 * (case on macOS and Windows, a symlink, `..`) still counts as the same.
 * A path that doesn't exist is never the same as anything.
 */
export function isSamePath(a: string, b: string): boolean {
  try {
    const x = statSync(a, { bigint: true });
    const y = statSync(b, { bigint: true });
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
}

/** A file system error as a sentence, for the errors people commonly hit; anything else keeps its own message. */
export function describeFsError(err: unknown): string {
  const e = err as NodeJS.ErrnoException | null;
  const path = typeof e?.path === "string" ? `"${e.path}"` : "that path";
  switch (e?.code) {
    case "ENOENT":
      return `${path} doesn't exist.`;
    case "EISDIR":
      return `${path} is a folder, not a file.`;
    case "ENOTDIR":
      return `part of ${path} is a file, not a folder.`;
    case "EEXIST":
      return `${path} already exists.`;
    case "EACCES":
    case "EPERM":
      return `no permission to use ${path}.`;
    case "ENOSPC":
      return "the disk is full.";
    default:
      return err instanceof Error ? err.message : String(err);
  }
}
