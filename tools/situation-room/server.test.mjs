// Situation room — tests for the server (spec criteria 22, 23, 24, 32, 33). The real server on port 0,
// against a temp root. Nothing is written to the real .live/ or incidents.md.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoom } from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const made = [];
const rooms = [];
after(async () => {
  for (const r of rooms) await r.stop().catch(() => {});
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

const line = o => `${JSON.stringify(o)}\n`;
const ev = (t, id, extra = {}) => ({ t, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id, branch: "f/part-e", ...extra });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "sr-srv-"));
  made.push(root);
  mkdirSync(path.join(root, ".live"));
  return root;
}
async function boot(root, pollMs = 40) {
  const room = createRoom({ root, port: 0, pollMs });
  rooms.push(room);
  const info = await room.start();
  return { room, ...info };
}
function request({ port, method = "GET", reqPath = "/", host, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: { Host: host ?? `127.0.0.1:${port}`, ...headers } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}
function openSse(port, host) {
  const state = { text: "", close: () => {} };
  const req = http.get({ host: "127.0.0.1", port, path: "/events", headers: { Host: host ?? `127.0.0.1:${port}` } }, res => {
    state.status = res.statusCode;
    state.headers = res.headers;
    res.setEncoding("utf8");
    res.on("data", c => { state.text += c; });
  });
  req.on("error", () => {});
  state.close = () => req.destroy();
  state.waitFor = async (pred, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (pred(state.text)) return true;
      await sleep(15);
    }
    return pred(state.text);
  };
  return state;
}
const count = (s, needle) => s.split(needle).length - 1;

// ---------- 22 ----------
test("[situation-room 22] binds 127.0.0.1 only", async () => {
  const { room, port, url } = await boot(tempRoot());
  assert.equal(room.server.address().address, "127.0.0.1");
  assert.equal(url, `http://127.0.0.1:${port}`);
  assert.ok(port > 0);
});

test("[situation-room 22] Host: evil.com -> 403 on every path, including /events and /summary", async () => {
  const { port } = await boot(tempRoot());
  for (const p of ["/", "/events", "/summary", "/nope"]) {
    const r = await request({ port, reqPath: p, host: "evil.com" });
    assert.equal(r.status, 403, p);
  }
});

test("[situation-room 22] other bad Host values -> 403: wrong port, rebinding name, suffix trick, absent port, empty", async () => {
  const { port } = await boot(tempRoot());
  for (const host of [`evil.com:${port}`, `127.0.0.1:${port + 1}`, "127.0.0.1", "localhost", `127.0.0.1.evil.com:${port}`, `localhost.evil.com:${port}`, `evil.com/127.0.0.1:${port}`, `0.0.0.0:${port}`, `[::1]:${port}`]) {
    const r = await request({ port, host });
    assert.equal(r.status, 403, JSON.stringify(host));
  }
});

test("[situation-room 22] Host 127.0.0.1:<port> and localhost:<port> are accepted", async () => {
  const { port } = await boot(tempRoot());
  assert.equal((await request({ port, host: `127.0.0.1:${port}` })).status, 200);
  assert.equal((await request({ port, host: `localhost:${port}` })).status, 200);
});

test("[situation-room 22] anything but GET -> 405", async () => {
  const { port } = await boot(tempRoot());
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    for (const p of ["/", "/events", "/summary"]) {
      const r = await request({ port, method, reqPath: p });
      assert.equal(r.status, 405, `${method} ${p}`);
    }
  }
});

test("[situation-room 22] /../x, /.env, /incidents.md and friends -> 404", async () => {
  const root = tempRoot();
  writeFileSync(path.join(root, "incidents.md"), "2026-10-12 09:35 | hook blocked Bash (all): a | x | y | z\n");
  writeFileSync(path.join(root, ".env"), "SECRET=1\n");
  writeFileSync(path.join(root, "x"), "X-FILE-CONTENT");
  writeFileSync(path.join(root, "package.json"), "{}");
  const { port } = await boot(root);
  const paths = [
    "/../x", "/..%2fx", "/%2e%2e/x", "/%2e%2e%2fx", "/..\\x", "/.env", "/incidents.md", "/.live/events-2026-10-12.jsonl", "/.live/",
    "/package.json", "/server.mjs", "/derive.mjs", "/sources.mjs", "/tools/situation-room/server.mjs", "/etc/passwd", "/%00", "/index.html/../../x",
    "/events/", "/summary/", "//etc/passwd", "/favicon.ico",
  ];
  for (const p of paths) {
    const r = await request({ port, reqPath: p });
    assert.ok([404, 400].includes(r.status), `${p} -> ${r.status}`);
    assert.equal(r.body.toString().includes("X-FILE-CONTENT"), false, p);
    assert.equal(r.body.toString().includes("SECRET=1"), false, p);
  }
  for (const p of ["/../x", "/.env", "/incidents.md", "/server.mjs"]) {
    assert.equal((await request({ port, reqPath: p })).status, 404, p);
  }
});

test("[situation-room 22] no CORS headers on any answer", async () => {
  const { port } = await boot(tempRoot());
  for (const p of ["/", "/summary", "/nope"]) {
    const r = await request({ port, reqPath: p, headers: { Origin: "http://evil.example" } });
    for (const h of Object.keys(r.headers)) assert.equal(h.toLowerCase().startsWith("access-control-"), false, `${p} ${h}`);
  }
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("event: init"));
  for (const h of Object.keys(sse.headers ?? {})) assert.equal(h.toLowerCase().startsWith("access-control-"), false, h);
  sse.close();
});

test("[situation-room 22] a query string does not change what is served (no path from the request)", async () => {
  const { port } = await boot(tempRoot());
  const r = await request({ port, reqPath: "/?file=../../etc/passwd&path=/.env" });
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), /<html/i);
  const s = await request({ port, reqPath: "/summary?days=../../x" });
  assert.equal(s.status, 200);
  JSON.parse(s.body.toString());
});

test("[situation-room 22] importing server.mjs started nothing; a port in use rejects start()", async () => {
  const { port } = await boot(tempRoot());
  const second = createRoom({ root: tempRoot(), port, pollMs: 40 });
  await assert.rejects(second.start());
  await second.stop().catch(() => {});
});

// ---------- 23 ----------
const MARKERS = ["SECRET-PROMPT-7", "SECRET-MSG", "SECRET-ARGS", "SECRET-CA", "SECRET-CWD", "SECRET-QUERY", "UNKNOWN-FIELD-MARKER", "UNKNOWN-EVENT-MARKER", "OLD-FILE-MARKER", "NESTED-MARKER", "ENV-TARGET-MARKER"];

function draftRoot() {
  const root = tempRoot();
  const t0 = Date.now() - 60000;
  const lines = [
    { t: t0, ev: "UserPromptSubmit", sid: "s1", who: "ORCHESTRATOR", branch: "f/part-e", text: "SECRET-PROMPT-7", cwd: "SECRET-CWD" },
    { t: t0 + 1, ev: "SubagentStart", sid: "s1", aid: "a1", who: "critic", branch: "f/part-e", bg: true },
    { t: t0 + 2, ev: "SubagentStop", sid: "s1", aid: "a1", who: "critic", branch: "f/part-e", last: "SECRET-MSG" },
    { t: t0 + 3, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Skill", id: "k1", skill: "rtl-hebrew", args: "SECRET-ARGS", query: "SECRET-QUERY", branch: "f/part-e" },
    { t: t0 + 4, ev: "UserPromptExpansion", sid: "s1", who: "ORCHESTRATOR", skill: "feature", command_args: "SECRET-CA", branch: "f/part-e" },
    { t: t0 + 5, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id: "r1", target: "apps/web/.env.preview", note: "ENV-TARGET-MARKER" },
    { t: t0 + 6, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id: "r2", target: "ok/file.ts", marker: "UNKNOWN-FIELD-MARKER", nested: { deep: "NESTED-MARKER" } },
    { t: t0 + 7, ev: "WeirdEvent", sid: "s1", who: "ORCHESTRATOR", marker: "UNKNOWN-EVENT-MARKER" },
  ];
  writeFileSync(path.join(root, ".live", "events-2026-10-12.jsonl"), lines.map(line).join(""));
  // the draft's single file: must never be read
  writeFileSync(path.join(root, ".live", "events.jsonl"), line({ t: t0, ev: "UserPromptSubmit", sid: "old", who: "ORCHESTRATOR", id: "OLD-FILE-MARKER", text: "OLD-FILE-MARKER" }));
  writeFileSync(path.join(root, ".live", "events.jsonl.1"), line({ t: t0, ev: "PreToolUse", sid: "old", tool: "Read", id: "OLD-FILE-MARKER" }));
  return root;
}

test("[situation-room 23] draft-format lines: no marker reaches /events, as raw bytes", async () => {
  const { port } = await boot(draftRoot());
  const sse = openSse(port);
  assert.ok(await sse.waitFor(t => t.includes("\n\n") && t.includes("event: init")));
  await sleep(150);
  sse.close();
  for (const m of MARKERS) assert.equal(sse.text.includes(m), false, m);
  assert.equal(/"(text|last|args|command_args|cwd|query|bg)"/.test(sse.text), false);
  assert.ok(sse.text.includes('"s1"'), "the legitimate part of the lines is still there");
  assert.ok(sse.text.includes("ok/file.ts"));
  assert.equal(/\.env/i.test(sse.text), false);
});

test("[situation-room 23] draft-format lines: no marker reaches /summary, as raw bytes", async () => {
  const { port } = await boot(draftRoot());
  const r = await request({ port, reqPath: "/summary" });
  assert.equal(r.status, 200);
  const raw = r.body.toString("utf8");
  for (const m of MARKERS) assert.equal(raw.includes(m), false, m);
  assert.equal(/"(text|last|args|command_args|cwd|query|bg)"/.test(raw), false);
  assert.equal(/\.env/i.test(raw), false);
  const s = JSON.parse(raw);
  assert.equal(s.usage.agents.find(a => a.who === "critic")?.runs, 1); // the draft lines still count
  assert.equal(s.usage.skills.find(k => k.name === "rtl-hebrew")?.uses, 1);
});

test("[situation-room 23] the old .live/events.jsonl is never read, even alone", async () => {
  const root = tempRoot();
  writeFileSync(path.join(root, ".live", "events.jsonl"), line({ t: Date.now(), ev: "SubagentStart", sid: "old", aid: "o1", who: "critic", id: "OLD-FILE-MARKER" }));
  const { port } = await boot(root);
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("event: init"));
  await sleep(150);
  sse.close();
  assert.equal(sse.text.includes("OLD-FILE-MARKER"), false);
  assert.equal(sse.text.includes('"critic"'), false);
  const s = JSON.parse((await request({ port, reqPath: "/summary" })).body.toString());
  assert.deepEqual(s.usage.agents, []);
  assert.equal(s.firstEvent, null);
});

test("[situation-room 23] a draft-format line appended while running is stripped too", async () => {
  const root = tempRoot();
  const { port } = await boot(root, 30);
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("event: init"));
  appendFileSync(path.join(root, ".live", "events-2026-10-12.jsonl"), line({ t: Date.now(), ev: "UserPromptSubmit", sid: "live1", who: "ORCHESTRATOR", text: "SECRET-PROMPT-7" }));
  assert.ok(await sse.waitFor(t => t.includes("live1")));
  await sleep(120);
  sse.close();
  assert.equal(sse.text.includes("SECRET-PROMPT-7"), false);
});

// ---------- 24 ----------
test("[situation-room 24] /events: backlog first, then a later line exactly once", async () => {
  const root = tempRoot();
  const f = path.join(root, ".live", "events-2026-10-12.jsonl");
  writeFileSync(f, line(ev(Date.now() - 5000, "BACKLOG-1")) + line(ev(Date.now() - 4000, "BACKLOG-2")));
  const { port } = await boot(root, 30);
  const sse = openSse(port);
  assert.ok(await sse.waitFor(t => t.includes("event: init") && t.includes("BACKLOG-2")));
  assert.equal(sse.text.indexOf("BACKLOG-1") < sse.text.indexOf("BACKLOG-2"), true);
  assert.equal(sse.text.indexOf("event: events"), -1, "nothing but the backlog yet");
  appendFileSync(f, line(ev(Date.now(), "LATER-1")));
  assert.ok(await sse.waitFor(t => t.includes("LATER-1")));
  await sleep(300);
  assert.equal(count(sse.text, "LATER-1"), 1);
  assert.equal(count(sse.text, "BACKLOG-1"), 1);
  assert.equal(count(sse.text, "BACKLOG-2"), 1);
  assert.ok(sse.text.indexOf("event: init") < sse.text.indexOf("LATER-1"));
  sse.close();
});

test("[situation-room 24] /events: a client connecting late gets the earlier lines once, in the backlog", async () => {
  const root = tempRoot();
  const f = path.join(root, ".live", "events-2026-10-12.jsonl");
  writeFileSync(f, line(ev(Date.now() - 5000, "EARLY")));
  const { port } = await boot(root, 30);
  appendFileSync(f, line(ev(Date.now() - 100, "MIDDLE")));
  await sleep(250);
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("MIDDLE"));
  appendFileSync(f, line(ev(Date.now(), "AFTER")));
  await sse.waitFor(t => t.includes("AFTER"));
  await sleep(250);
  sse.close();
  for (const id of ["EARLY", "MIDDLE", "AFTER"]) assert.equal(count(sse.text, id), 1, id);
});

test("[situation-room 24] /events: a day rollover loses no line", async () => {
  const root = tempRoot();
  const d1 = path.join(root, ".live", "events-2026-10-11.jsonl");
  const d2 = path.join(root, ".live", "events-2026-10-12.jsonl");
  writeFileSync(d1, line(ev(Date.now() - 3000, "DAY1-A")));
  const { port } = await boot(root, 30);
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("DAY1-A"));
  writeFileSync(d2, line(ev(Date.now() - 1000, "DAY2-A")));
  appendFileSync(d1, line(ev(Date.now() - 900, "DAY1-STRAGGLER")));
  appendFileSync(d2, line(ev(Date.now(), "DAY2-B")));
  for (const id of ["DAY2-A", "DAY1-STRAGGLER", "DAY2-B"]) assert.ok(await sse.waitFor(t => t.includes(id)), id);
  await sleep(250);
  sse.close();
  for (const id of ["DAY1-A", "DAY2-A", "DAY1-STRAGGLER", "DAY2-B"]) assert.equal(count(sse.text, id), 1, id);
});

test("[situation-room 24] /events: content type is an event stream, not cached", async () => {
  const { port } = await boot(tempRoot());
  const sse = openSse(port);
  await sse.waitFor(t => t.includes("event: init"));
  sse.close();
  assert.equal(sse.status, 200);
  assert.match(sse.headers["content-type"], /^text\/event-stream/);
  assert.match(sse.headers["cache-control"] ?? "", /no-(store|cache)/);
});

test("[situation-room 24] /events: the connection of a client that left does not break the next poll", async () => {
  const root = tempRoot();
  const f = path.join(root, ".live", "events-2026-10-12.jsonl");
  const { port } = await boot(root, 30);
  const gone = openSse(port);
  await gone.waitFor(t => t.includes("event: init"));
  gone.close();
  await sleep(60);
  const stay = openSse(port);
  await stay.waitFor(t => t.includes("event: init"));
  appendFileSync(f, line(ev(Date.now(), "STILL-WORKS")));
  assert.ok(await stay.waitFor(t => t.includes("STILL-WORKS")));
  stay.close();
});

// ---------- summary ----------
test("[situation-room 31] /summary: empty log gives a valid JSON with no first event", async () => {
  const { port } = await boot(tempRoot());
  const r = await request({ port, reqPath: "/summary?days=7" });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /application\/json/);
  const s = JSON.parse(r.body.toString());
  assert.equal(s.firstEvent, null);
  assert.deepEqual(s.usage.agents, []);
  assert.equal(s.blocks.days.length, 7);
  assert.ok(s.blocks.days.every(d => d.noData));
});

test("[situation-room 31] /summary: junk ?days values do not break it", async () => {
  const { port } = await boot(tempRoot());
  for (const q of ["days=abc", "days=-3", "days=0", "days=99999", "days=", "days=1e9", "days=7&days=9"]) {
    const r = await request({ port, reqPath: `/summary?${q}` });
    assert.equal(r.status, 200, q);
    const s = JSON.parse(r.body.toString());
    assert.ok(s.blocks.days.length >= 1 && s.blocks.days.length <= 400, q);
  }
});

test("[situation-room 29] /summary: incidents.md lines are counted from the temp root's own file", async () => {
  const root = tempRoot();
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:01`;
  writeFileSync(path.join(root, "incidents.md"), `${stamp} | hook blocked Bash (all) ×2: x | none | state: contained | y\n`);
  const { port } = await boot(root);
  const s = JSON.parse((await request({ port, reqPath: "/summary?days=3" })).body.toString());
  const today = s.blocks.days.at(-1);
  assert.equal(today.total, 2);
  assert.equal(today.noData, false);
});

// ---------- 32 ----------
test("[situation-room 32] GET / -> 200, html lang=he dir=rtl, no external resource", async () => {
  const { port } = await boot(tempRoot());
  const r = await request({ port, reqPath: "/" });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /text\/html/);
  const html = r.body.toString("utf8");
  assert.match(html, /<html[^>]*\blang=["']he["']/i);
  assert.match(html, /<html[^>]*\bdir=["']rtl["']/i);
  assert.equal(/https?:\/\//i.test(html), false, "no http(s):// anywhere in the page");
  assert.equal(/(src|href|action|poster)\s*=\s*["']?\s*(https?:)?\/\//i.test(html), false);
  assert.equal(/url\(\s*["']?\s*(https?:)?\/\//i.test(html), false);
  assert.equal(/@import/i.test(html), false);
  assert.equal(/<link[^>]+rel=["']?(stylesheet|preload|preconnect|dns-prefetch)/i.test(html), false);
});

test("[situation-room 32] the page file on disk matches what is served and carries the data-source note", async () => {
  const { port } = await boot(tempRoot());
  const served = (await request({ port, reqPath: "/" })).body.toString("utf8");
  assert.equal(served, readFileSync(path.join(here, "index.html"), "utf8"));
  assert.ok(served.includes("אין נתונים") && /מ-/.test(served) && served.includes("firstEvent"), "views state where the data starts and mark earlier days as no data");
});

test("[situation-room 32] the page does not render prompt or assistant text fields", () => {
  const html = readFileSync(path.join(here, "index.html"), "utf8");
  assert.equal(/(ev|e|event|evt).(text|last|args|command_args|cwd|query)/.test(html), false);
});

test("[situation-room 32] the one command starts the server, prints its address, serves /; a second one on the same port exits 1", async () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.ok(pkg.scripts["situation-room"], "npm script exists");
  assert.match(pkg.scripts["situation-room"], /situation-room[\\/]server\.mjs/);
  const child = spawn(process.execPath, [path.join(here, "server.mjs"), "0"], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  try {
    let out = "";
    child.stdout.on("data", c => { out += c; });
    const end = Date.now() + 8000;
    while (!/http:\/\/127\.0\.0\.1:\d+/.test(out) && Date.now() < end) await sleep(50);
    const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
    assert.ok(m, `no address printed: ${out}`);
    const port = Number(m[1]);
    const r = await request({ port, reqPath: "/" });
    assert.equal(r.status, 200);
    assert.match(r.body.toString(), /lang="he"/);
    const second = spawn(process.execPath, [path.join(here, "server.mjs"), String(port)], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let err = "";
    second.stderr.on("data", c => { err += c; });
    const code = await new Promise(resolve => { second.on("exit", resolve); setTimeout(() => { second.kill(); resolve("timeout"); }, 8000); });
    assert.equal(code, 1);
    assert.ok(err.trim().length > 0 && err.trim().split("\n").length <= 2, `one-line error expected: ${err}`);
  } finally {
    child.kill();
  }
});

// ---------- 33 ----------
test("[situation-room 33] the new test files are in test:tools and exist", () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const script = pkg.scripts["test:tools"];
  for (const f of ["derive.test.mjs", "sources.test.mjs", "server.test.mjs"]) {
    assert.ok(script.includes(`tools/situation-room/${f}`), f);
    readFileSync(path.join(here, f));
  }
  assert.ok(script.includes(".claude/hooks/situation-log.test.js"), "slice 1 test still wired");
  assert.ok(script.includes(".claude/hooks/guard.test.js"), "guard test still wired");
});
