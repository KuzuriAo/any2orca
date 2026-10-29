#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Sets which sections of a built any2orca web app are hidden, without a
 * rebuild and without a configuration file the browser can fetch.
 *
 *   node scripts/configure-web.mjs <web-root> --config /etc/any2orca.json
 *   node scripts/configure-web.mjs <web-root> --hide beyond,faq
 *   node scripts/configure-web.mjs <web-root> --clear
 *
 * The page decides from one attribute on its own HTML,
 * `<html data-hide="beyond,faq">`, read once at startup. This script reads
 * your settings from a private JSON file that you keep outside the folder
 * your web server serves, checks them, and writes that attribute into
 * `<web-root>/index.html`. Nothing else in the site changes, and the
 * settings file is never served. Run it again after unpacking an update.
 *
 * The settings file:  { "hide": ["beyond", "faq"] }
 *
 * Names: beyond (the "Beyond the Web App" section), faq (the FAQ section and
 * the FAQ button), integrate (the Integrate button and the partner
 * selector), support (the Ko-fi link). The link to the source code can't be
 * hidden: the web app is AGPL-3.0, and a copy served to others has to offer
 * its source.
 *
 * Exit codes: 0 done, 1 anything wrong (the message says what).
 */
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Keep in step with ALLOWED_HIDE_SECTIONS in apps/web/src/lib/hiddenSections.ts (a test compares them). */
export const ALLOWED_HIDE_SECTIONS = ["beyond", "faq", "integrate", "support"];

const MAX_CONFIG_BYTES = 4 * 1024;
const MAX_INDEX_BYTES = 5 * 1024 * 1024;
const HTML_TAG = /<html\b[^>]*>/i;
const HIDE_ATTRIBUTE = /\s+data-hide\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

export class ConfigureError extends Error {}

function safe(text, max = 60) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, max);
}

/** Checks a list of section names; returns them lowercased, trimmed and without repeats. Throws ConfigureError on anything unknown. */
export function parseHide(value, where) {
  if (!Array.isArray(value)) throw new ConfigureError(`${where}: "hide" must be a list of section names, for example ["beyond", "faq"].`);
  if (value.length > 20) throw new ConfigureError(`${where}: "hide" has too many entries.`);
  const names = [];
  for (const raw of value) {
    const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!ALLOWED_HIDE_SECTIONS.includes(name)) {
      throw new ConfigureError(`${where}: "${safe(raw)}" isn't a section you can hide. The names are: ${ALLOWED_HIDE_SECTIONS.join(", ")}.`);
    }
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Reads and checks a settings file. Only the key "hide" is allowed. */
export function readConfig(path) {
  if (!existsSync(path)) throw new ConfigureError(`No settings file at ${path}.`);
  if (statSync(path).size > MAX_CONFIG_BYTES) throw new ConfigureError(`${path} is larger than ${MAX_CONFIG_BYTES} bytes; it should be a few lines.`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new ConfigureError(`${path} isn't valid JSON.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new ConfigureError(`${path} must be a JSON object, for example { "hide": ["faq"] }.`);
  for (const key of Object.keys(parsed)) {
    if (key !== "hide") throw new ConfigureError(`${path}: "${safe(key)}" isn't a setting. The only one is "hide".`);
  }
  return Object.hasOwn(parsed, "hide") ? parseHide(parsed.hide, path) : [];
}

/** Whether `inner` is inside (or is) `outer`, following symbolic links. */
function isInside(inner, outer) {
  const rel = relative(realpathSync(outer), realpathSync(inner));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Returns index.html's text with data-hide set to `names` (or removed when empty). Throws if there's no <html> tag. */
export function applyHide(html, names) {
  const match = HTML_TAG.exec(html);
  if (!match) throw new ConfigureError("index.html has no <html> tag; this doesn't look like the built web app.");
  const tag = match[0].replace(HIDE_ATTRIBUTE, "");
  const next = names.length > 0 ? tag.replace(/\s*>$/, ` data-hide="${names.join(",")}">`) : tag;
  return html.slice(0, match.index) + next + html.slice(match.index + match[0].length);
}

/** Sets the hidden sections in a built site. Returns a one-line summary. */
export function configureWeb(webRoot, { names, configPath }) {
  const indexPath = join(webRoot, "index.html");
  if (!existsSync(webRoot) || !statSync(webRoot).isDirectory()) throw new ConfigureError(`${webRoot} isn't a folder.`);
  if (!existsSync(indexPath) || lstatSync(indexPath).isSymbolicLink()) throw new ConfigureError(`${webRoot} has no index.html (it should be the built site's folder, the one with index.html).`);
  if (statSync(indexPath).size > MAX_INDEX_BYTES) throw new ConfigureError("index.html is much larger than the built page; stopping.");
  if (configPath && isInside(configPath, webRoot)) {
    throw new ConfigureError(`${configPath} is inside the folder your web server serves, so anyone could download it. Move it somewhere outside ${webRoot} and run this again.`);
  }
  const html = readFileSync(indexPath, "utf-8");
  const updated = applyHide(html, names);
  if (updated !== html) {
    const temp = `${indexPath}.${process.pid}.tmp`;
    writeFileSync(temp, updated);
    renameSync(temp, indexPath);
  }
  return names.length > 0 ? `Hiding ${names.join(", ")} in ${indexPath}.` : `Nothing hidden in ${indexPath}.`;
}

function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const at = args.indexOf(flag);
    if (at === -1) return undefined;
    const value = args[at + 1];
    if (value === undefined || value.startsWith("--")) throw new ConfigureError(`${flag} needs a value.`);
    args.splice(at, 2);
    return value;
  };
  const clearAt = args.indexOf("--clear");
  const clear = clearAt !== -1;
  if (clear) args.splice(clearAt, 1);
  const configPath = take("--config");
  const hide = take("--hide");
  const [webRoot, ...extra] = args;
  if (!webRoot || extra.length > 0 || args.some((a) => a.startsWith("--")) || [configPath, hide, clear || undefined].filter((v) => v !== undefined).length !== 1) {
    throw new ConfigureError("Usage: node scripts/configure-web.mjs <web-root> (--config <file> | --hide <names> | --clear)");
  }
  const names = clear ? [] : hide !== undefined ? parseHide(hide.split(","), "--hide") : readConfig(configPath);
  console.log(configureWeb(webRoot, { names, ...(configPath ? { configPath } : {}) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ConfigureError)) throw err;
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
