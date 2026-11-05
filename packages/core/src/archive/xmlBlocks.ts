// SPDX-License-Identifier: MIT
/**
 * Single-pass scanners for the shapes the readers and the writer look for in a
 * 3MF's XML. A pattern whose character class can run to the end of the text,
 * tried again at every tag that never ends, costs the square of the text's
 * size: 40,000 unterminated tags in 0.2 MB took ten seconds, so a file of the
 * size these paths accept took minutes. Every scanner here is linear, and
 * matches what the pattern in its own doc comment matched.
 */

/** Whether `text` has `tag` at `at`, comparing ASCII letters without case. */
function tagAt(text: string, at: number, tag: string): boolean {
  if (at + tag.length > text.length) return false;
  for (let i = 0; i < tag.length; i++) {
    // Folds an ASCII letter's case without building a string per tag: one big mesh has millions of tags.
    if ((text.charCodeAt(at + i) | 32) !== (tag.charCodeAt(i) | 32)) return false;
  }
  return true;
}

/** Whether `text` holds `</tag>` at `at`, the tag name without case. */
export function closingTagAt(text: string, at: number, tag: string): boolean {
  return text.charCodeAt(at) === 0x3c && text.charCodeAt(at + 1) === 0x2f && tagAt(text, at + 2, tag) && text.charCodeAt(at + 2 + tag.length) === 0x3e;
}

/**
 * Every `<tag ...>` and `<tag .../>` in `text`, in order: the attributes as
 * written (everything between `<tag` and the first `>`, a self-closing tag's
 * `/` included) and where the tag starts and ends.
 *
 * The same tags as `/<tag[^>]*>/g`, found in linear time. Each caller applies
 * its own rule for what may follow the tag name by looking at `attrs`: a
 * pattern written `<tag\s` wants `attrs` to start with whitespace, and one
 * written `<tag\b` wants its first character to be something other than a
 * letter, digit or underscore.
 *
 * @param ignoreCase match the tag name without case, as a pattern with the `i` flag does.
 */
export function* xmlTags(text: string, tag: string, ignoreCase = false): Generator<{ attrs: string; start: number; end: number }> {
  const open = `<${tag}`;
  let from = 0;
  for (;;) {
    let start = ignoreCase ? text.indexOf("<", from) : text.indexOf(open, from);
    if (ignoreCase) {
      while (start !== -1 && !tagAt(text, start + 1, tag)) start = text.indexOf("<", start + 1);
    }
    if (start === -1) return;
    const openerEnd = text.indexOf(">", start + open.length);
    // No `>` after this tag means none after any later one either.
    if (openerEnd === -1) return;
    yield { attrs: text.slice(start + open.length, openerEnd), start, end: openerEnd + 1 };
    from = openerEnd + 1;
  }
}

/**
 * `text` with every `<tag ...>` replaced by what `replace` returns for it: the
 * same replacements as `text.replace(/<tag\s+[^>]*>/g, replace)`, in one pass.
 */
export function replaceXmlTags(text: string, tag: string, replace: (tag: string) => string): string {
  const pieces: string[] = [];
  let copiedTo = 0;
  for (const { attrs, start, end } of xmlTags(text, tag)) {
    // `<tag\s+` : a tag name the text only begins with isn't this tag.
    if (!/^\s/.test(attrs)) continue;
    pieces.push(text.slice(copiedTo, start), replace(text.slice(start, end)));
    copiedTo = end;
  }
  if (pieces.length === 0) return text;
  pieces.push(text.slice(copiedTo));
  return pieces.join("");
}

/**
 * The first `<tag prefix...>...</tag>` block in `text`, as written (both tags
 * included), or null: the same match as
 * ``new RegExp(`<tag ${prefix}[^>]*>[\\s\\S]*?</tag>`)``, found in linear time.
 *
 * `prefix` is the attribute text the opening tag must begin with, as written
 * in the file, e.g. `id="7"`.
 */
export function xmlBlockStartingWith(text: string, tag: string, prefix: string): string | null {
  const open = `<${tag} ${prefix}`;
  const close = `</${tag}>`;
  const start = text.indexOf(open);
  if (start === -1) return null;
  const openerEnd = text.indexOf(">", start + open.length);
  if (openerEnd === -1) return null;
  // Closing tags come in order, so the first opener with a closer after it is the one that pattern matched.
  const end = text.indexOf(close, openerEnd + 1);
  return end === -1 ? null : text.slice(start, end + close.length);
}

/**
 * Every `<tag ...>body</tag>` block in `text`, in order, with the same
 * matches as `/<tag(\s[^>]*?)?>([\s\S]*?)<\/tag>/g`, found in linear time.
 */
export function* xmlBlocks(text: string, tag: string): Generator<{ attrs: string; body: string }> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let from = 0;
  for (;;) {
    const start = text.indexOf(open, from);
    if (start === -1) return;
    const next = text[start + open.length];
    if (next !== ">" && next !== " " && next !== "\t" && next !== "\n" && next !== "\r") {
      from = start + open.length;
      continue;
    }
    const openerEnd = text.indexOf(">", start + open.length);
    if (openerEnd === -1) return;
    const end = text.indexOf(close, openerEnd + 1);
    // No closing tag after this opener means none after any later one either.
    if (end === -1) return;
    yield { attrs: text.slice(start + open.length, openerEnd).trim(), body: text.slice(openerEnd + 1, end) };
    from = end + close.length;
  }
}
