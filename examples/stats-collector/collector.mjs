// SPDX-License-Identifier: MIT
// A collector for any2orca's opt-in usage stats (the event `any2orca telemetry show` prints).
//
//   STATS_FILE=./events.jsonl READ_TOKEN_FILE=./read-token node collector.mjs
//   any2orca convert model.3mf --stats-endpoint http://localhost:8788/event
//   curl -H "Authorization: Bearer $(cat read-token)" http://localhost:8788/summary
//
// Everything a sender could put in a request is treated as hostile: the body is
// size-capped while it is read, parsed against the strict event schema (any
// unknown field is rejected), and only the parsed fields are stored. It keeps no
// IP addresses, headers or timestamps; the event's own UTC date is the only time.
// Reading the counts back (GET /summary) is off unless a token is set, or
// READ_AUTH=none says on purpose that anyone who can reach it may read them.
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFile, readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { StatsEventSchema } from "any2orca";
import { summarize } from "./summary.mjs";

const MAX_BODY_BYTES = 4096;
export const DEFAULT_PORT = 8788;
/** A read token shorter than this is refused: it has to be too long to guess. */
export const MIN_TOKEN_LENGTH = 32;

/**
 * Who may read GET /summary, from the environment: READ_TOKEN_FILE (a file
 * holding the token, preferred) or READ_TOKEN, or READ_AUTH=none for no check.
 * Throws on a weak token or a contradictory setup, so a mistake stops the
 * collector instead of leaving the counts open.
 * @param {Record<string, string | undefined>} env
 * @returns {{ token?: string, open?: boolean }}
 */
export function readAccessFromEnv(env) {
  const none = env.READ_AUTH === "none";
  if (env.READ_AUTH !== undefined && env.READ_AUTH !== "" && !none) throw new Error(`READ_AUTH can only be "none"`);
  if (env.READ_TOKEN_FILE && env.READ_TOKEN) throw new Error("Set READ_TOKEN_FILE or READ_TOKEN, not both");
  let token = env.READ_TOKEN_FILE ? readFileSync(env.READ_TOKEN_FILE, "utf-8").trim() : env.READ_TOKEN?.trim();
  if (token === "") token = undefined;
  if (none && token) throw new Error("READ_AUTH=none and a read token contradict each other; set one");
  if (none) return { open: true };
  if (token === undefined) return {};
  if (token.length < MIN_TOKEN_LENGTH) throw new Error(`The read token must be at least ${MIN_TOKEN_LENGTH} characters (try: openssl rand -hex 32)`);
  return { token };
}

const digest = (value) => createHash("sha256").update(value).digest();

/**
 * @param {object} options
 * @param {string} options.file JSON Lines file the accepted events are appended to.
 * @param {number} [options.maxEventsPerMinute] Across all senders and readers; extra requests get 429.
 * @param {number} [options.maxFileBytes] Stop storing (503) when the file reaches this size.
 * @param {string} [options.allowOrigin] One exact origin allowed to post from a browser page (CORS). Unset: none.
 * @param {{ token?: string, open?: boolean }} [options.read] Who may read GET /summary (see readAccessFromEnv). Unset: nobody.
 */
export function createCollector({ file, maxEventsPerMinute = 600, maxFileBytes = 50 * 1024 * 1024, allowOrigin, read = {} }) {
  if (read.token !== undefined && read.token.length < MIN_TOKEN_LENGTH) throw new Error(`The read token must be at least ${MIN_TOKEN_LENGTH} characters`);
  const tokenDigest = read.token ? digest(read.token) : undefined;
  let windowStart = Date.now();
  let windowCount = 0;
  // The summary is recomputed only when the file changes, so reads can't make the collector re-read a big file on every request.
  let cached = { key: "", body: "" };

  const overLimit = () => {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      windowCount = 0;
    }
    return ++windowCount > maxEventsPerMinute;
  };

  /** Constant-time check of an `Authorization: Bearer <token>` header. */
  const authorized = (header) => {
    if (read.open) return true;
    if (!tokenDigest || typeof header !== "string") return false;
    const match = /^Bearer ([^\s]{1,512})$/.exec(header);
    return match !== null && timingSafeEqual(digest(match[1]), tokenDigest);
  };

  const server = createServer(async (req, res) => {
    const reply = (status, headers = {}, body) => {
      res.writeHead(status, { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
      res.end(body);
    };
    const cors = allowOrigin ? { "access-control-allow-origin": allowOrigin, vary: "origin" } : {};

    try {
      const path = (req.url ?? "").split("?")[0];

      if (path === "/summary") {
        if (!read.open && !tokenDigest) return reply(404);
        if (req.method !== "GET") return reply(405, { allow: "GET" });
        if (overLimit()) return reply(429, { "retry-after": "60" });
        if (!authorized(req.headers.authorization)) return reply(401, { "www-authenticate": 'Bearer realm="any2orca stats"' });
        const info = await stat(file).catch(() => undefined);
        const key = info ? `${info.size}:${info.mtimeMs}` : "none";
        if (cached.key !== key) {
          const text = info ? await readFile(file, "utf-8") : "";
          cached = { key, body: JSON.stringify(summarize(text)) };
        }
        return reply(200, { "content-type": "application/json; charset=utf-8" }, cached.body);
      }

      if (path !== "/" && path !== "/event") return reply(404);

      if (req.method === "OPTIONS" && allowOrigin && req.headers.origin === allowOrigin) {
        return reply(204, { ...cors, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600" });
      }
      if (req.method !== "POST") return reply(405, { allow: "POST" });
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return reply(415, cors);

      if (overLimit()) return reply(429, { ...cors, "retry-after": "60" });

      // Refuse early when the declared length is too big, and enforce the cap while reading in case it lied.
      const declared = Number(req.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reply(413, { ...cors, connection: "close" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reply(413, { ...cors, connection: "close" });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      }

      let parsed;
      try {
        parsed = StatsEventSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        return reply(400, cors);
      }
      if (!parsed.success) return reply(400, cors);

      const currentSize = await stat(file).then((s) => s.size, () => 0);
      if (currentSize >= maxFileBytes) return reply(503, cors);

      await appendFile(file, `${JSON.stringify(parsed.data)}\n`, { mode: 0o600 });
      return reply(204, cors);
    } catch {
      if (!res.headersSent) reply(500);
    }
  });

  // Slow or stalled senders can't hold connections open.
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

/**
 * What the collector prints when it starts: `lines` for the log, `warnings` for stderr. With READ_AUTH=none it
 * always warns, loopback included: a reverse proxy on the same machine forwards public requests to 127.0.0.1,
 * so the listening address alone can't tell whether outsiders can reach the counts.
 */
export function startupMessages({ file, host, port, read }) {
  const lines = [`Collecting to ${file} on http://${host}:${port}/event`];
  const warnings = [];
  if (read.token) lines.push(`Counts: GET http://${host}:${port}/summary with the read token`);
  else if (read.open) {
    lines.push(`Counts: GET http://${host}:${port}/summary, with no token (READ_AUTH=none)`);
    warnings.push(
      "Warning: READ_AUTH=none lets anyone who can reach this collector read the counts, including through a reverse proxy in front of it. Use it only on a private network that nothing outside can reach; otherwise set READ_TOKEN_FILE.",
    );
  } else lines.push("Counts: GET /summary is off (set READ_TOKEN_FILE, READ_TOKEN, or READ_AUTH=none)");
  return { lines, warnings };
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  // Loopback by default. Put a reverse proxy with HTTPS in front to accept real senders;
  // any2orca refuses to send to a plain http:// address other than localhost.
  const host = process.env.HOST ?? "127.0.0.1";
  // npm runs this script in the example's own folder; INIT_CWD is where you ran npm, so a relative path means what you typed.
  const fromHere = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
  const file = fromHere(process.env.STATS_FILE ?? "events.jsonl");
  let read;
  try {
    const tokenFile = process.env.READ_TOKEN_FILE;
    read = readAccessFromEnv({ ...process.env, ...(tokenFile ? { READ_TOKEN_FILE: fromHere(tokenFile) } : {}) });
  } catch (err) {
    console.error(`Not started: ${err.message}`);
    process.exit(1);
  }
  createCollector({ file, allowOrigin: process.env.ALLOW_ORIGIN || undefined, read }).listen(port, host, () => {
    const { lines, warnings } = startupMessages({ file, host, port, read });
    for (const line of lines) console.log(line);
    for (const warning of warnings) console.warn(warning);
  });
}
