// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describeFsError } from "./sameFile.js";

/** The most files one pattern may name. A folder holding more than this is a mistake to stop, not a job to start. */
export const MAX_WILDCARD_MATCHES = 5000;
const MAX_PATTERN_LENGTH = 512;

const hasWildcard = (text: string): boolean => text.includes("*") || text.includes("?");

/** A file-name pattern as a regular expression: `*` is any run of characters, `?` is one, everything else is itself. */
function patternToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += "[^/\\\\]*";
    else if (char === "?") source += "[^/\\\\]";
    else source += char.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, caseInsensitive ? "iu" : "u");
}

/**
 * Expands `*` and `?` in the file-name part of each argument, for shells that
 * leave them for the program (Command Prompt and PowerShell). An argument that
 * names a file that exists is left alone, as is one with no wildcard, so a
 * shell that already expanded the pattern changes nothing.
 *
 * Wildcards work in the file name only, never in folder names, and never
 * reach into subfolders. A name starting with a dot matches only a pattern
 * that starts with one, as in a Unix shell. Matches are files (not folders),
 * sorted by name, and a file already in the list is not added twice.
 * A pattern that matches nothing, or too much, is an error.
 */
export function expandInputPatterns(args: string[], options: { caseInsensitive?: boolean } = {}): string[] {
  const caseInsensitive = options.caseInsensitive ?? process.platform === "win32";
  const result: string[] = [];
  for (const arg of args) {
    if (!hasWildcard(arg) || existsSync(arg)) {
      result.push(arg);
      continue;
    }
    if (arg.length > MAX_PATTERN_LENGTH) throw new Error("A file pattern that long can't be right.");
    const dir = dirname(arg);
    const pattern = basename(arg);
    if (hasWildcard(dir)) throw new Error(`Wildcards work in the file name only, not in folder names: "${arg}"`);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (err) {
      throw new Error(`Error reading ${arg}: ${describeFsError(err)}`);
    }
    const matcher = patternToRegExp(pattern, caseInsensitive);
    const showDotFiles = pattern.startsWith(".");
    const matches: string[] = [];
    for (const name of names) {
      if (!matcher.test(name) || (name.startsWith(".") && !showDotFiles)) continue;
      const path = join(dir, name);
      try {
        if (!statSync(path).isFile()) continue;
      } catch {
        continue;
      }
      matches.push(path);
      if (matches.length > MAX_WILDCARD_MATCHES) throw new Error(`"${arg}" matches more than ${MAX_WILDCARD_MATCHES} files. Use a narrower pattern or convert a folder at a time.`);
    }
    if (matches.length === 0) throw new Error(`No files match "${arg}".`);
    matches.sort();
    for (const path of matches) if (!result.includes(path)) result.push(path);
  }
  return result;
}
