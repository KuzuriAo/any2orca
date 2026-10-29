# Stats collector

The receiving end of any2orca's opt-in usage stats, and a way to read the counts back. any2orca itself has **no default collector**: with nothing configured, nothing is ever sent, whatever the user's stats choice. If you run a deployment and want to count conversions, you run something like this and point `ANY2ORCA_STATS_ENDPOINT` at it.

[`collector.mjs`](collector.mjs) is a small server with no dependencies beyond `any2orca`; it stores events and, if you allow it, serves a summary. [`summarize.mjs`](summarize.mjs) counts what it stored from the command line.

## What an event is

One small event per conversion, and only for a user who turned stats on. This is the whole list; the schema (`StatsEventSchema` in `any2orca`) is strict, so an event with any other field is rejected rather than stored:

| Field | Example | Meaning |
|---|---|---|
| `v` | `1` | Event format version |
| `core` | `"0.1.0"` | The any2orca version that converted the file |
| `profileId` | `"snapmaker-u1-0.4-standard"` | The profile used |
| `matchSource` | `"auto-exact"` | How the profile was chosen |
| `plates`, `objects`, `filamentSlots` | `2`, `5`, `3` | Counts, nothing about their content |
| `sourceVendor` | `"bambu"` | The maker the source file was set up for |
| `ref` | `"my-site"` | Optional: which site sent the user here (a short slug) |
| `day` | `"2026-10-20"` | The UTC date, never the time of day |

Never in an event: the file or any part of it, file names, paths, or anything that identifies the person or their device. `any2orca telemetry show` prints exactly what a user's own installation would send.

## Run it

From the repository root, make a read token once, then start the collector:

```sh
npm install
openssl rand -hex 32 > read-token && chmod 600 read-token
STATS_FILE=./events.jsonl READ_TOKEN_FILE=./read-token npm start -w @any2orca/example-stats-collector
```

These commands are for a macOS or Linux terminal (`NAME=value command`, `openssl` and `chmod`); on Windows, use WSL or Git Bash.

It listens on `http://127.0.0.1:8788/event` and keeps running, so leave that terminal open. **In a second terminal**, from the same folder, send it an event with the command-line tool, converting the repository's demo model:

```sh
ANY2ORCA_TELEMETRY=1 npx any2orca convert apps/web/public/demo-model.3mf --out-dir ./converted --stats-endpoint http://localhost:8788/event
```

`ANY2ORCA_TELEMETRY=1` turns stats on for this one run, so nothing about your own setup changes. The collector stores the event as one line in `events.jsonl` (at the repository root, where you started it). `Ctrl+C` in the first terminal stops the collector.

## Read the counts

Ask the collector for a summary, with the token:

```sh
curl -H "Authorization: Bearer $(cat read-token)" http://localhost:8788/summary
```

It answers with JSON: the number of events, and counts by day, any2orca version, profile, source vendor, match source and `ref`. The same summary from the file directly, without the server:

```sh
npm run summary -w @any2orca/example-stats-collector -- ./events.jsonl --json
```

**Who can read it:**

- **With a token (recommended, and the setup above).** `READ_TOKEN_FILE` names a file holding the token; `READ_TOKEN` takes it directly, but a file keeps it out of your shell history and process list. The token must be at least 32 characters; `openssl rand -hex 32` makes a good one. A request without it, or with a wrong one, gets `401`.
- **With no token, on a private network only.** `READ_AUTH=none` lets anyone who can reach the collector read the counts, for a machine on your home or office network that nothing outside can reach. **Don't combine it with a reverse proxy that's reachable from outside** (like the HTTPS setup under "Running it for real"): the proxy forwards public requests to the collector's local address, so the counts become public too. The collector warns about this every time it starts in this mode.
- **Neither set:** `/summary` doesn't exist (`404`), and the counts are only in the file.

Setting a token and `READ_AUTH=none` together, both `READ_TOKEN` and `READ_TOKEN_FILE`, or a token shorter than 32 characters stops the collector at startup rather than leaving the counts open by mistake.

## Running it for real

- **Put HTTPS in front.** any2orca only sends to `https://` addresses (plus `http://localhost` for testing), so use a reverse proxy or a platform that terminates TLS. The collector binds to `127.0.0.1` by default; set `HOST` and `PORT` to change that.
- **Let a web page post to it.** Browsers need permission to send to another origin. Set `ALLOW_ORIGIN=https://your-site.example` (one exact origin) and the collector answers the preflight for that origin only. Without it, no browser page can post here. The command-line tool is unaffected either way.
- **Tell your users.** If you turn stats on for a deployment, say so plainly where they'll see it, and keep it opt-in. The library has `resolveStatsConsent()` for the rules (an explicit "off" always wins, and Global Privacy Control turns stats off unless the user chose "on" while it was already set).

## Treating senders as hostile

Anyone who can reach the address can send it anything, so the collector assumes the worst:

- **Strict shape:** the body must parse as exactly one event. Unknown fields are rejected, and only the parsed fields are written, never the raw request.
- **Bounded cost:** bodies over 4 KB are refused (checked while reading, not just from the header), requests over a per-minute cap get `429`, stalled connections time out, and storage stops at a file-size limit (`503`) instead of filling a disk.
- **Narrow surface:** only `POST /` and `POST /event` (with `Content-Type: application/json`) and `GET /summary` (only when read access is set up) do anything.
- **Reads cost little:** the summary is worked out again only when the file has changed, read requests share the per-minute cap, and the token is compared in constant time.
- **Nothing extra stored:** no IP addresses, headers or request times are logged or written.

## Using something other than a file

The server is deliberately plain so you can swap the storage: replace the `appendFile` line with a database insert, a queue, or a metrics call. The checks above stay the same, and `parsed.data` is the only thing you should store.

## Check it

```sh
npm test -w @any2orca/example-stats-collector
```

The tests send valid, extra-field, malformed, wrong-type and oversized requests, check the rate limit, the browser preflight and every read-access setup (no token, a wrong one, the right one, `READ_AUTH=none`, and the setups refused at startup), and run the real `any2orca` command-line tool against the collector to confirm that nothing is sent unless the user opted in and that an opted-in conversion sends exactly one event.

## License

MIT, like the library. Copy any of it into your own project.
