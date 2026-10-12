// Situation room — tests for the readers (spec criteria 24 tail, 30 git). Temp directories only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTail, readCommits, readIncidents } from "./sources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const made = [];
const tmp = (prefix = "sr-src-") => {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
};
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const line = (o) => `${JSON.stringify(o)}\n`;
const ev = (t, id, extra = {}) => ({ t, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id, branch: "f/part-e", ...extra });

// ---------- 24: tail ----------
test("[situation-room 24] tail: the backlog arrives first, a later line arrives once, nothing repeats", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl"), line(ev(1, "a")) + line(ev(2, "b")));
  const tail = createTail(dir);
  assert.deepEqual((await tail.poll()).map(e => e.id), ["a", "b"]);
  assert.deepEqual(await tail.poll(), []);
  appendFileSync(path.join(dir, "events-2026-10-12.jsonl"), line(ev(3, "c")));
  assert.deepEqual((await tail.poll()).map(e => e.id), ["c"]);
  assert.deepEqual(await tail.poll(), []);
});

test("[situation-room 24] tail: a line written in two halves is delivered whole, once", async () => {
  const dir = tmp();
  const f = path.join(dir, "events-2026-10-12.jsonl");
  const full = line(ev(1, "half"));
  writeFileSync(f, full.slice(0, 20));
  const tail = createTail(dir);
  assert.deepEqual(await tail.poll(), []);
  appendFileSync(f, full.slice(20));
  assert.deepEqual((await tail.poll()).map(e => e.id), ["half"]);
  assert.deepEqual(await tail.poll(), []);
});

test("[situation-room 24] tail: multi-byte text split across polls is not corrupted", async () => {
  const dir = tmp();
  const f = path.join(dir, "events-2026-10-12.jsonl");
  const buf = Buffer.from(line(ev(1, "x", { target: "שלום-עולם" })), "utf8");
  const cut = buf.indexOf(Buffer.from("ש", "utf8")) + 1; // in the middle of a two-byte letter
  writeFileSync(f, buf.subarray(0, cut));
  const tail = createTail(dir);
  await tail.poll();
  appendFileSync(f, buf.subarray(cut));
  const got = await tail.poll();
  assert.equal(got.length, 1);
  assert.equal(got[0].target, "שלום-עולם");
});

test("[situation-room 24] tail: a day rollover loses no line", async () => {
  const dir = tmp();
  const d1 = path.join(dir, "events-2026-10-11.jsonl");
  const d2 = path.join(dir, "events-2026-10-12.jsonl");
  writeFileSync(d1, line(ev(1, "late-evening")));
  const tail = createTail(dir);
  assert.deepEqual((await tail.poll()).map(e => e.id), ["late-evening"]);
  // after midnight: the new file appears, and a slow hook still appends to yesterday's file
  writeFileSync(d2, line(ev(3, "after-midnight-1")));
  appendFileSync(d1, line(ev(2, "straggler")));
  const got = (await tail.poll()).map(e => e.id).sort();
  assert.deepEqual(got, ["after-midnight-1", "straggler"]);
  appendFileSync(d2, line(ev(4, "after-midnight-2")));
  assert.deepEqual((await tail.poll()).map(e => e.id), ["after-midnight-2"]);
  assert.deepEqual(await tail.poll(), []);
});

test("[situation-room 24] tail: several day files at start are all loaded, oldest first", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl"), line(ev(30, "c")));
  writeFileSync(path.join(dir, "events-2026-10-10.jsonl"), line(ev(10, "a")));
  writeFileSync(path.join(dir, "events-2026-10-11.jsonl"), line(ev(20, "b")));
  assert.deepEqual((await createTail(dir).poll()).map(e => e.id), ["a", "b", "c"]);
});

test("[situation-room 24] tail: a missing log directory is an empty result, not an error", async () => {
  const dir = tmp();
  assert.deepEqual(await createTail(path.join(dir, "no-such")).poll(), []);
});

test("[situation-room 24] tail: files that are not day files (events.jsonl, .1, other) are never read", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events.jsonl"), line(ev(1, "old-draft")));
  writeFileSync(path.join(dir, "events.jsonl.1"), line(ev(2, "old-draft-1")));
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl.bak"), line(ev(3, "bak")));
  writeFileSync(path.join(dir, "events-2026-10-12.txt"), line(ev(4, "txt")));
  writeFileSync(path.join(dir, "x-events-2026-10-12.jsonl"), line(ev(5, "prefix")));
  assert.deepEqual(await createTail(dir).poll(), []);
});

test("[situation-room 24] tail: garbage lines are skipped, good lines around them arrive", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl"), `${line(ev(1, "a"))}not json\n\n{"t":"x"}\n${line(ev(2, "b"))}`);
  assert.deepEqual((await createTail(dir).poll()).map(e => e.id), ["a", "b"]);
});

test("[situation-room 24] tail: events come annotated with feature, part and step", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl"), line({ t: 1, ev: "SubagentStart", sid: "s", aid: "c1", who: "critic", branch: "ui-wave-1/part-e" }));
  const [e] = await createTail(dir).poll();
  assert.equal(e.feature, "ui-wave-1");
  assert.equal(e.part, "part-e");
  assert.equal(e.step, 9);
});

test("[situation-room 23] tail: draft-format fields never leave the tail", async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, "events-2026-10-12.jsonl"), line({ t: 1, ev: "UserPromptSubmit", sid: "s", who: "ORCHESTRATOR", text: "SECRET-PROMPT-7", cwd: "C:\\x" })
    + line({ t: 2, ev: "SubagentStop", sid: "s", aid: "a", who: "critic", last: "SECRET-MSG" }));
  const got = await createTail(dir).poll();
  assert.equal(got.length, 2);
  assert.equal(JSON.stringify(got).includes("SECRET"), false);
});

test("[situation-room 24] tail: a truncated file is re-read from the start", async () => {
  const dir = tmp();
  const f = path.join(dir, "events-2026-10-12.jsonl");
  writeFileSync(f, line(ev(1, "a")) + line(ev(2, "b")));
  const tail = createTail(dir);
  await tail.poll();
  writeFileSync(f, line(ev(3, "c")));
  assert.deepEqual((await tail.poll()).map(e => e.id), ["c"]);
});

// ---------- incidents reader ----------
test("[situation-room 28] readIncidents: file text, or empty string when there is none", async () => {
  const dir = tmp();
  assert.equal(await readIncidents(dir), "");
  writeFileSync(path.join(dir, "incidents.md"), "hello");
  assert.equal(await readIncidents(dir), "hello");
});

// ---------- 30: git ----------
function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-12T10:00:00Z", GIT_COMMITTER_DATE: "2026-10-12T10:00:00Z" }, stdio: ["ignore", "pipe", "pipe"],
  });
}
function fixtureRepo(dir) {
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "a.txt"), "a");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-q", "-m", "plain commit on main");
  git(dir, "checkout", "-q", "-b", "feature/x");
  writeFileSync(path.join(dir, "b.txt"), "b");
  git(dir, "add", "b.txt");
  git(dir, "commit", "-q", "-m", "work on the branch");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "Merge feature x", "feature/x");
}

test("[situation-room 30] git timeline: a merge and a plain commit give two points, only the merge marked", async () => {
  const dir = tmp();
  fixtureRepo(dir);
  const commits = await readCommits(dir);
  assert.equal(commits.length, 2, JSON.stringify(commits.map(c => c.subject)));
  const merge = commits.find(c => c.subject === "Merge feature x");
  const plain = commits.find(c => c.subject === "plain commit on main");
  assert.ok(merge && plain);
  assert.equal(merge.merge, true);
  assert.equal(plain.merge, false);
  assert.equal(commits.filter(c => c.merge).length, 1);
  assert.ok(commits.every(c => /^[0-9a-f]{40}$/.test(c.sha) && Number.isFinite(c.t)));
  assert.ok(!commits.some(c => c.subject === "work on the branch"), "first-parent only");
  assert.equal(commits[0].subject, "Merge feature x"); // newest first
});

test("[situation-room 30] git timeline: a directory with no git gives an empty timeline", async () => {
  const dir = tmp();
  assert.deepEqual(await readCommits(dir), []);
});

test("[situation-room 30] git timeline: a directory that does not exist gives an empty timeline", async () => {
  assert.deepEqual(await readCommits(path.join(tmp(), "gone")), []);
});

test("[situation-room 30] git timeline: an empty repository (no commits) gives []", async () => {
  const dir = tmp();
  git(dir, "init", "-q", "-b", "main");
  assert.deepEqual(await readCommits(dir), []);
});

test("[situation-room 30] git is invoked without a shell: shell metacharacters in the path do nothing", async () => {
  const parent = tmp();
  const evil = path.join(parent, "r;touch PWNED & echo $(touch PWNED2) x");
  mkdirSync(evil);
  fixtureRepo(evil);
  const commits = await readCommits(evil);
  assert.equal(commits.length, 2);
  for (const name of ["PWNED", "PWNED2"]) {
    assert.equal(existsSync(path.join(evil, name)), false, name);
    assert.equal(existsSync(path.join(parent, name)), false, name);
    assert.equal(existsSync(path.join(process.cwd(), name)), false, name);
  }
});

test("[situation-room 30] git is invoked with execFile and fixed arguments, never exec or a shell option", () => {
  const src = readFileSync(path.join(here, "sources.mjs"), "utf8");
  assert.match(src, /\bexecFile\b/);
  assert.doesNotMatch(src, /\bexecSync\b|\bspawnSync\b|\bexec\(|\bexec\s*\}|shell\s*:\s*(true|["'`])/);
  assert.doesNotMatch(src, /child_process["']\s*;?[\s\S]*\bexec\b\s*[,}]/, "plain exec must not be imported");
  // no request data reaches the argument list: the readers take a directory, never a request
  assert.doesNotMatch(src, /\breq\b|\.url\b|searchParams/);
});
