// SPDX-License-Identifier: MIT
/**
 * Text bound for the terminal, made safe to print. Much of what the CLI
 * prints comes from files: setting values and object names in a 3MF, names in
 * a shared presets file. The CLI uses no control codes of its own, so every
 * one is replaced (see plainText); newlines and tabs stay.
 */
import { plainText } from "../plainText.js";

/** Zero-width and invisible characters: harmless to a terminal, but they make two values look alike. */
const INVISIBLE = /[\u00ad\u061c\u200b-\u200f\u2028\u2029\u2060\ufeff]/g;

export function safeTerminalText(text: string): string {
  return plainText(text).replace(INVISIBLE, "\ufffd");
}

const JSON_UNSAFE = /[\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/g;

/**
 * A line of JSON output made safe to print without changing the data:
 * JSON.stringify already escapes the C0 controls, and these characters only
 * appear inside strings, so writing them as \u escapes keeps the value.
 */
export function escapeUnsafeForJson(line: string): string {
  return line.replace(JSON_UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
