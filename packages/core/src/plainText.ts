// SPDX-License-Identifier: MIT
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

/**
 * Text from a file, made safe to show as plain text: every control character
 * except newline and tab, and every Unicode direction override, becomes the
 * replacement character. A crafted value could otherwise send terminal codes
 * (clear the screen, change the window title, in some terminals write to the
 * clipboard) or make text read differently from what it is. Use it before
 * printing setting values, names or notes from a 3MF to a terminal or log.
 * (For a web page, setting the text with `textContent` is already safe.)
 */
export function plainText(text: string): string {
  return text.replace(UNSAFE, "�");
}
