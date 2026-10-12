// Situation room — a live view of the agents and skills at work on the project, and their history.
// decisions.md (2026-10-12, "Situation room"); spec: .work/situation-room/spec.md.
//
// .claude/hooks/situation-log.js appends one line per event to .live/events-YYYY-MM-DD.jsonl. This
// server follows those files, serves the page, streams events to it over server-sent events, and
// computes the history summary. Local only: it listens on 127.0.0.1, answers GET for four fixed
// paths, sends no CORS header, and reads nothing a request names.
//
// Usage: npm run situation-room   (or: node tools/situation-room/server.mjs [port])
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSummary } from "./derive.mjs";
import { createTail, readCommits, readIncidents } from "./sources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 6010;
const BACKLOG_EVENTS = 6000;
const COMMITS_TTL_MS = 15000;
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

// root: the project (it holds .live/, incidents.md and .git). Returns { start, stop }.
export function createRoom({ root = path.resolve(here, "../.."), port = DEFAULT_PORT, pollMs = 400 } = {}) {
  const tail = createTail(path.join(root, ".live"));
  const events = [];
  const clients = new Set();
  let commits = { at: 0, list: [] };
  let memo = { key: "", body: "" };
  let timer = null;
  let boundPort = port;

  const send = (res, name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  async function poll() {
    try {
      const fresh = await tail.poll();
      if (fresh.length) {
        events.push(...fresh);
        for (const res of clients) send(res, "events", fresh);
      }
    } catch {
      // The log is mid-write or missing; the next poll tries again.
    }
  }
  function schedule() {
    timer = setTimeout(async () => { await poll(); schedule(); }, pollMs);
  }

  async function summary(days) {
    const now = Date.now();
    if (now - commits.at > COMMITS_TTL_MS) commits = { at: now, list: await readCommits(root) };
    const incidentsText = await readIncidents(root);
    const key = `${events.length}:${incidentsText.length}:${commits.at}:${days}:${new Date(now).toDateString()}`;
    if (memo.key !== key) {
      memo = { key, body: JSON.stringify(buildSummary({ events, incidentsText, commits: commits.list, now, days })) };
    }
    return memo.body;
  }

  const hostOk = host => host === `127.0.0.1:${boundPort}` || host === `localhost:${boundPort}`;
  const plain = (res, status, headers = {}) => res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers }).end(`${status}\n`);

  const server = createServer(async (req, res) => {
    try {
      if (!hostOk(req.headers.host)) return plain(res, 403);
      if (req.method !== "GET") return plain(res, 405, { Allow: "GET" });
      const [pathname, query = ""] = (req.url ?? "/").split("?");
      if (pathname === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Content-Type-Options": "nosniff" });
        // The snapshot and the subscription happen in one step, so no event is sent twice or skipped.
        send(res, "init", events.slice(-BACKLOG_EVENTS));
        clients.add(res);
        const beat = setInterval(() => res.write(": beat\n\n"), 15000);
        req.on("close", () => { clearInterval(beat); clients.delete(res); });
        return;
      }
      if (pathname === "/summary") {
        const days = Number(new URLSearchParams(query).get("days") ?? 30);
        const body = await summary(Number.isFinite(days) ? days : 30);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return void res.end(body);
      }
      if (pathname === "/" || pathname === "/index.html") {
        const body = await readFile(path.join(here, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff" });
        return void res.end(body);
      }
      return plain(res, 404);
    } catch {
      if (!res.headersSent) plain(res, 500);
      else res.end();
    }
  });

  return {
    server,
    // Loads the retained history, then listens. Resolves { port, url }; rejects on a listen error.
    async start() {
      await poll();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      boundPort = server.address().port;
      schedule();
      return { port: boundPort, url: `http://127.0.0.1:${boundPort}` };
    },
    async stop() {
      clearTimeout(timer);
      for (const res of clients) res.end();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? DEFAULT_PORT);
  try {
    const { url } = await createRoom({ port }).start();
    console.log(`Situation room on ${url}`);
  } catch (err) {
    console.error(err?.code === "EADDRINUSE" ? `Port ${port} is in use. Another situation room may be running: http://127.0.0.1:${port}` : `Could not start: ${err?.message}`);
    process.exit(1);
  }
}
