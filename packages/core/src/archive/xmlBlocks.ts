// SPDX-License-Identifier: MIT
/**
 * Every `<tag ...>body</tag>` block in `text`, in order, with the same
 * matches as `/<tag(\s[^>]*?)?>([\s\S]*?)<\/tag>/g`, found in linear time.
 * A lazy pattern like that one rescans the rest of the text for each opener
 * that has no closing tag, which a crafted file can turn into minutes.
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
