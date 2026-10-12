// Situation room — tests for the pure part (spec criteria 25, 26, 27, 28, 29, 31, 30 parser half).
// Derived from .work/situation-room/spec.md, not from the module source. Nothing here touches disk
// except the read of the real incidents.md (read only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NO_PART, splitBranch, partKey, createStepper, usage, rounds, parseIncidents, blocksOverTime,
  buildSummary, parseGitLog, dayKey, dayRange, sanitizeEvent, parseLogLine,
} from "./derive.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const L = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

// ---------- 25: part and step ----------
test("[situation-room 25] splitBranch: the table from the spec", () => {
  assert.deepEqual(splitBranch("ui-wave-1/part-e"), { feature: "ui-wave-1", part: "part-e" });
  assert.equal(splitBranch("main").part, NO_PART);
  assert.equal(splitBranch(undefined).part, NO_PART);
  assert.equal(splitBranch(null).part, NO_PART);
  assert.equal(splitBranch("").part, NO_PART);
  assert.equal(splitBranch("9f97930").part, NO_PART); // detached short SHA
  assert.equal(splitBranch("9f97930a1b2c3d4e5f60718293a4b5c6d7e8f901").part, NO_PART); // full SHA
  assert.deepEqual(splitBranch("a/b/c"), { feature: "a", part: "b/c" }); // first slash only
  assert.equal(NO_PART, "ללא חלק");
});

test("[situation-room 25] a branch without a slash is a feature with no part", () => {
  assert.deepEqual(splitBranch("situation-room"), { feature: "situation-room", part: NO_PART });
});

test("[situation-room 25] partKey is stable per part and shared by no-part cases", () => {
  assert.equal(partKey("ui-wave-1/part-e"), partKey("ui-wave-1/part-e"));
  assert.notEqual(partKey("ui-wave-1/part-e"), partKey("ui-wave-1/part-d"));
  assert.notEqual(partKey("x/part-e"), partKey("y/part-e"));
  assert.equal(partKey("main"), partKey(undefined));
});

const start = (who, aid, branch, t = 1, sid = "s1") => ({ t, ev: "SubagentStart", sid, aid, who, branch });

test("[situation-room 25] step: critic run 1 -> 9, run 2 in the same part -> 11", () => {
  const s = createStepper();
  assert.equal(s.annotate(start("critic", "c1", "f/part-e")).step, 9);
  assert.equal(s.annotate(start("critic", "c2", "f/part-e")).step, 11);
  assert.equal(s.annotate(start("critic", "c3", "f/part-e")).step, 11);
});

test("[situation-room 25] step: critic run count is per part, not global", () => {
  const s = createStepper();
  s.annotate(start("critic", "c1", "f/part-e"));
  assert.equal(s.annotate(start("critic", "c2", "f/part-d")).step, 9);
});

test("[situation-room 25] step: builder -> 6, builder after a critic run in the part -> 10", () => {
  const s = createStepper();
  assert.equal(s.annotate(start("builder", "b1", "f/part-e")).step, 6);
  s.annotate(start("critic", "c1", "f/part-e"));
  assert.equal(s.annotate(start("builder", "b2", "f/part-e")).step, 10);
  // a builder in another part is untouched by that critic
  assert.equal(s.annotate(start("builder", "b3", "f/part-d")).step, 6);
});

test("[situation-room 25] step: fixed agent types follow workflow.md numbering", () => {
  const s = createStepper();
  assert.equal(s.annotate(start("spec", "a1", "f/p")).step, 3);
  assert.equal(s.annotate(start("data-architect", "a2", "f/p")).step, 5);
  assert.equal(s.annotate(start("algorithm-data", "a3", "f/p")).step, "5b");
  assert.equal(s.annotate(start("test-engineer", "a4", "f/p")).step, 8);
});

test("[situation-room 25] annotate adds feature and part; keeps the original fields", () => {
  const out = createStepper().annotate({ ...start("critic", "c1", "ui-wave-1/part-e"), tool: undefined });
  assert.equal(out.feature, "ui-wave-1");
  assert.equal(out.part, "part-e");
  assert.equal(out.who, "critic");
  assert.equal(out.aid, "c1");
});

test("[situation-room 25] annotate on main / no branch gives the no-part label", () => {
  const s = createStepper();
  assert.equal(s.annotate({ t: 1, ev: "Stop", sid: "s", who: "ORCHESTRATOR", branch: "main" }).part, NO_PART);
  assert.equal(s.annotate({ t: 2, ev: "Stop", sid: "s", who: "ORCHESTRATOR" }).part, NO_PART);
});

test("[situation-room 25] orchestrator events have no numbered step", () => {
  const out = createStepper().annotate({ t: 1, ev: "PreToolUse", sid: "s", who: "ORCHESTRATOR", tool: "Read", branch: "f/p" });
  assert.notEqual(typeof out.step, "number");
});

test("[situation-room 25] scout shows under its caller's step", () => {
  const s = createStepper();
  s.annotate(start("critic", "c1", "f/p"));
  assert.equal(s.annotate(start("scout", "sc1", "f/p")).step, 9);
  const s2 = createStepper();
  assert.equal(s2.annotate(start("scout", "sc9", "f/p")).step, "support");
});

test("[situation-room 25] an agent's tool events carry the step of its run", () => {
  const s = createStepper();
  s.annotate(start("critic", "c1", "f/p"));
  s.annotate(start("critic", "c2", "f/p"));
  const pre = s.annotate({ t: 3, ev: "PreToolUse", sid: "s1", aid: "c2", who: "critic", tool: "Read", branch: "f/p" });
  assert.equal(pre.step, 11);
});

// ---------- 23 (unit half): allowlist on read ----------
test("[situation-room 23] sanitizeEvent drops draft-format fields and unknown keys", () => {
  const ev = sanitizeEvent({
    t: 5, ev: "UserPromptSubmit", sid: "s", who: "ORCHESTRATOR", branch: "main",
    text: "SECRET-PROMPT-7", last: "SECRET-MSG", args: "SECRET-ARGS", command_args: "SECRET-CA", cwd: "C:\\x", query: "q", bg: true, marker: "MARKER",
  });
  assert.ok(ev);
  assert.equal(JSON.stringify(ev).includes("SECRET"), false);
  assert.equal(JSON.stringify(ev).includes("MARKER"), false);
  for (const k of ["text", "last", "args", "command_args", "cwd", "query", "bg", "marker"]) assert.equal(k in ev, false, k);
});

test("[situation-room 23] sanitizeEvent: a field allowed for another event is dropped", () => {
  const ev = sanitizeEvent({ t: 5, ev: "SubagentStop", sid: "s", aid: "a", who: "critic", tool: "Read", ms: 5, target: "x", skill: "y", reason: "z" });
  assert.deepEqual(Object.keys(ev).sort(), ["aid", "ev", "sid", "t", "who"]);
});

test("[situation-room 23] sanitizeEvent rejects junk: non-object, array, unknown event, bad t, wrong types", () => {
  for (const bad of [null, undefined, 5, "x", [], {}, { ev: "Stop" }, { t: "5", ev: "Stop" }, { t: NaN, ev: "Stop" }, { t: Infinity, ev: "Stop" }, { t: 1, ev: "Nope" }, { t: 1, ev: "__proto__" }, { t: 1, ev: "constructor" }]) {
    assert.equal(sanitizeEvent(bad), null, JSON.stringify(bad));
  }
  const ev = sanitizeEvent({ t: 1, ev: "PostToolUse", sid: "s", tool: { a: 1 }, id: 7, ms: "9" });
  assert.equal("tool" in ev, false);
  assert.equal("id" in ev, false);
  assert.equal("ms" in ev, false);
});

test("[situation-room 23] sanitizeEvent never lets a .env target through", () => {
  for (const target of [".env", "apps/web/.env.local", "**/.env*", "C:\\x\\.ENV.example"]) {
    const ev = sanitizeEvent({ t: 1, ev: "PreToolUse", sid: "s", tool: "Read", target });
    assert.ok(ev);
    assert.equal("target" in ev, false, target);
  }
});

test("[situation-room 23] sanitizeEvent clips very long strings", () => {
  const ev = sanitizeEvent({ t: 1, ev: "PreToolUse", sid: "s", tool: "Read", target: "a".repeat(100000) });
  assert.ok(ev.target.length <= 1000);
});

test("[situation-room 23] parseLogLine: garbage and truncated JSON give null, never throw", () => {
  for (const line of ["", "   ", "{", "not json", "[1,2]", "null", '{"t":1,"ev":"Stop"', "\u0000\u0001"]) {
    assert.equal(parseLogLine(line), null, JSON.stringify(line));
  }
  assert.ok(parseLogLine('{"t":1,"ev":"Stop","sid":"s","reason":"x"}'));
});

// ---------- 26: usage ----------
const pre = (id, skill, branch, t) => ({ t, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Skill", id, skill, branch });
const post = (id, ms, branch, t) => ({ t, ev: "PostToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Skill", id, ms, branch });
const stop = (aid, who, branch, t) => ({ t, ev: "SubagentStop", sid: "s1", aid, who, branch });
const byPart = (rows, key) => rows.parts.find(p => `${p.feature}/${p.part}` === key);

test("[situation-room 26] usage: empty log gives an empty result, no exception", () => {
  const u = usage([]);
  assert.deepEqual(u.agents, []);
  assert.deepEqual(u.skills, []);
});

test("[situation-room 26] usage: agent counts, total duration and the per-part split are exact", () => {
  const events = [
    start("critic", "c1", "f/part-e", 1000), stop("c1", "critic", "f/part-e", 4000),
    start("critic", "c2", "f/part-e", 5000), stop("c2", "critic", "f/part-e", 6000),
    start("critic", "c3", "f/part-d", 7000), stop("c3", "critic", "f/part-d", 7500),
    start("builder", "b1", "f/part-e", 100), stop("b1", "builder", "f/part-e", 700),
  ];
  const u = usage(events);
  const critic = u.agents.find(a => a.who === "critic");
  assert.equal(critic.runs, 3);
  assert.equal(critic.ms, 3000 + 1000 + 500);
  assert.equal(critic.running, 0);
  assert.equal(byPart(critic, "f/part-e").runs, 2);
  assert.equal(byPart(critic, "f/part-e").ms, 4000);
  assert.equal(byPart(critic, "f/part-d").runs, 1);
  assert.equal(byPart(critic, "f/part-d").ms, 500);
  const builder = u.agents.find(a => a.who === "builder");
  assert.equal(builder.runs, 1);
  assert.equal(builder.ms, 600);
  assert.equal(u.agents.length, 2);
});

test("[situation-room 26] usage: a start with no stop is counted as running and given no duration", () => {
  const u = usage([start("critic", "c1", "f/part-e", 1000), start("critic", "c2", "f/part-e", 2000), stop("c2", "critic", "f/part-e", 2600)]);
  const critic = u.agents[0];
  assert.equal(critic.runs, 2);
  assert.equal(critic.running, 1);
  assert.equal(critic.ms, 600); // the open run adds nothing
  assert.equal(byPart(critic, "f/part-e").running, 1);
});

test("[situation-room 26] usage: a stop with no matching start changes nothing", () => {
  const u = usage([stop("ghost", "critic", "f/p", 5000)]);
  assert.deepEqual(u.agents, []);
});

test("[situation-room 26] usage: the same agent id is not double counted by a repeated stop", () => {
  const u = usage([start("critic", "c1", "f/p", 1000), stop("c1", "critic", "f/p", 2000), stop("c1", "critic", "f/p", 9000)]);
  assert.equal(u.agents[0].ms, 1000);
  assert.equal(u.agents[0].running, 0);
});

test("[situation-room 26] usage: skills sum ms of Skill tool calls; slash expansions count as uses with no duration", () => {
  const events = [
    pre("x1", "rtl-hebrew", "f/part-e", 10), post("x1", 120, "f/part-e", 11),
    pre("x2", "rtl-hebrew", "f/part-d", 20), post("x2", 80, "f/part-d", 21),
    { t: 30, ev: "UserPromptExpansion", sid: "s1", who: "ORCHESTRATOR", skill: "rtl-hebrew", branch: "f/part-e" },
    pre("x3", "accessibility", "f/part-e", 40), post("x3", 7, "f/part-e", 41),
    // a non-skill tool call with a duration must not leak into a skill
    { t: 50, ev: "PreToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id: "r1", branch: "f/part-e" },
    { t: 51, ev: "PostToolUse", sid: "s1", who: "ORCHESTRATOR", tool: "Read", id: "r1", ms: 9999, branch: "f/part-e" },
  ];
  const u = usage(events);
  const rtl = u.skills.find(s => s.name === "rtl-hebrew");
  assert.equal(rtl.uses, 3);
  assert.equal(rtl.ms, 200);
  assert.equal(byPart(rtl, "f/part-e").uses, 2);
  assert.equal(byPart(rtl, "f/part-e").ms, 120);
  assert.equal(byPart(rtl, "f/part-d").uses, 1);
  assert.equal(byPart(rtl, "f/part-d").ms, 80);
  const a11y = u.skills.find(s => s.name === "accessibility");
  assert.equal(a11y.uses, 1);
  assert.equal(a11y.ms, 7);
  assert.equal(u.skills.length, 2);
});

test("[situation-room 26] usage: a skill call with no Post event is a use with no duration", () => {
  const u = usage([pre("x1", "security-craft", "f/p", 1)]);
  assert.equal(u.skills[0].uses, 1);
  assert.equal(u.skills[0].ms, 0);
});

test("[situation-room 26] usage: a failed skill call still ends the call and keeps its ms", () => {
  const u = usage([pre("x1", "s", "f/p", 1), { t: 2, ev: "PostToolUseFailure", sid: "s1", tool: "Skill", id: "x1", ms: 33, failed: true, branch: "f/p" }]);
  assert.equal(u.skills[0].uses, 1);
  assert.equal(u.skills[0].ms, 33);
});

test("[situation-room 26] usage: events with no branch land in the no-part row, not lost", () => {
  const u = usage([start("critic", "c1", undefined, 1), stop("c1", "critic", undefined, 5)]);
  assert.equal(u.agents[0].runs, 1);
  assert.equal(u.agents[0].parts[0].part, NO_PART);
});

test("[situation-room 26] usage: hostile agent names do not pollute prototypes", () => {
  const u = usage([start("__proto__", "a1", "f/p", 1), start("constructor", "a2", "f/p", 2)]);
  assert.equal(u.agents.length, 2);
  assert.equal(({}).runs, undefined);
});

// ---------- 27: rounds ----------
test("[situation-room 27] rounds: 3 critic and 2 test-engineer in part-e, 1 critic in part-d -> 3/2/1", () => {
  const ev = [];
  let t = 1;
  for (let i = 0; i < 3; i++) ev.push(start("critic", `c${i}`, "ui-wave-1/part-e", t++));
  for (let i = 0; i < 2; i++) ev.push(start("test-engineer", `t${i}`, "ui-wave-1/part-e", t++));
  ev.push(start("critic", "cd", "ui-wave-1/part-d", t++));
  // noise that must not count: other agent types, and stop events
  ev.push(start("builder", "b", "ui-wave-1/part-e", t++), stop("c0", "critic", "ui-wave-1/part-e", t++));
  const r = rounds(ev);
  const e = r.find(x => x.part === "part-e");
  const d = r.find(x => x.part === "part-d");
  assert.equal(r.length, 2);
  assert.equal(e.critic, 3);
  assert.equal(e.testEngineer, 2);
  assert.equal(d.critic, 1);
  assert.equal(d.testEngineer, 0);
  assert.equal(e.feature, "ui-wave-1");
});

test("[situation-room 27] rounds: empty log -> []", () => {
  assert.deepEqual(rounds([]), []);
});

test("[situation-room 27] rounds: the same part name under two features stays apart", () => {
  const r = rounds([start("critic", "a", "x/part-e", 1), start("critic", "b", "y/part-e", 2)]);
  assert.equal(r.length, 2);
  assert.ok(r.every(row => row.critic === 1));
});

test("[situation-room 27] rounds: runs after the part's last merge are not counted as its rounds", () => {
  const ev = [start("critic", "a", "f/part-e", 100), start("critic", "b", "f/part-e", 200), start("critic", "c", "f/part-e", 900)];
  const r = rounds(ev, { "f/part-e": 500 });
  assert.equal(r[0].critic, 2);
});

test("[situation-room 27] rounds: runs on main count under no part, not under a real part", () => {
  const r = rounds([start("critic", "a", "main", 1)]);
  assert.ok(r.every(row => row.part === NO_PART));
});

// ---------- 28: incidents.md parser ----------
// Copied from incidents.md lines 36-50 (the real file at the time the test was written).
const REAL_36_50 = [
  "2026-10-11 18:26 | 6 hook blocks, all deliberate: the live probes that activated the 7.2 guard (main loop git add -A; CRITIC git diff without the notes.md exclusion; TEST ENGINEER Read of apps/web/src, logged twice before the single-log fix; BUILDER Write and redirect into tests/) | none, no call ran | state: resolved | WORKPLAN 7.2/7.3: verification, not an incident",
  "2026-10-11 19:02 | (resolution of the line above) ORCHESTRATOR combined git add and git commit; the rule worked as designed, the commands were split | none | state: resolved | —",
  "2026-10-11 20:42 | hook blocked Bash (all) ×2, the .env rule: the ORCHESTRATOR's commit message, then a sed recording it, named the preview env file as text | none, no call ran | state: resolved | a false positive on the commit message (noise.md), guard fixed; the sed block was correct — edited with the Edit tool instead",
  "2026-10-11 21:34 | hook blocked Bash (all), the .env rule: a `node -` heredoc (a WORKPLAN update script) named the preview env file in its text | none, no call ran | state: resolved | correct block — a heredoc fed to node is a script; the update ran from a script file instead",
  "2026-10-11 22:00–22:10 | 15 hook blocks during UI wave 1 part a, all correct under the rules: BUILDER ×3 (git add -A; git add + commit combined, ×2) · CRITIC ×2 (git diff without the notes.md exclusion; a recursive shell search) · TEST ENGINEER ×10 (reads of apps/*/src paths, one git diff) | none, no call ran; each agent took the allowed path | state: resolved | friction to watch: TEST ENGINEER needed apps/web/src/styles/tokens.generated.css, a build product of the packages/shared contract — an exemption is a candidate if the pattern repeats in part b",
  "2026-10-11 22:18–23:59 | 18 hook blocks during UI wave 1 part b and the 7.3 commit, all correct under the rules: all ×3 (git add + commit/checkout combined) · BUILDER ×2 (mkdir e2e — the e2e path is a test path) · CRITIC ×2 · TEST ENGINEER ×11 (reads and a Glob reaching apps/*/src) | none, no call ran; each agent took the allowed path | state: resolved | TEST ENGINEER friction repeats from part a: it learns component APIs from stories because the spec names none — SPEC adds an API line per component for parts c–f",
  "2026-10-11 19:02–00:00 | 18 hook blocks during UI wave 1 part c, all correct under the rules: all ×6 · test-engineer ×10 · critic ×2 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond parts a–b",
  "2026-10-12 00:18–01:07 | 18 hook blocks during UI wave 1 part d, all correct under the rules: all ×3 · test-engineer ×9 · critic ×6 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond parts a–c",
  "2026-10-12 07:32–09:16 | 22 hook blocks during UI wave 1 part e, all correct under the rules: builder ×1 · all ×3 · test-engineer ×11 · critic ×7 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond the earlier parts",
  "2026-10-12 09:35 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
  "2026-10-12 09:42 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
  "2026-10-12 09:42 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
  "2026-10-12 09:43 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
  "2026-10-12 09:43 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
  "2026-10-12 09:43 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik",
];
const total = entries => entries.reduce((n, e) => n + e.count, 0);
const roleSplit = entries => {
  const m = {};
  for (const e of entries) m[e.role] = (m[e.role] ?? 0) + e.count;
  return m;
};

test("[situation-room 28] a single block line counts 1, with its role and tool", () => {
  const out = parseIncidents(REAL_36_50[9]);
  assert.equal(out.length, 1);
  assert.equal(total(out), 1);
  assert.equal(out[0].role, "all");
  assert.equal(out[0].tool, "Bash");
  assert.equal(out[0].date, "2026-10-12");
  assert.equal(out[0].t, L(2026, 10, 12, 9, 35));
});

test("[situation-room 28] a single block line with a role in parentheses and a comma form counts 1", () => {
  assert.equal(total(parseIncidents(REAL_36_50[3])), 1); // line 39: "(all), the .env rule"
  assert.equal(roleSplit(parseIncidents(REAL_36_50[10])).hasOwnProperty("test-engineer"), true);
});

test("[situation-room 28] `hook blocked Bash (all) x2` counts 2", () => {
  const out = parseIncidents(REAL_36_50[2]);
  assert.equal(total(out), 2);
  assert.deepEqual(roleSplit(out), { all: 2 });
});

test("[situation-room 28] `18 hook blocks ... all x3 . test-engineer x9 . critic x6` is 18 split by role", () => {
  const out = parseIncidents(REAL_36_50[7]);
  assert.equal(total(out), 18);
  assert.deepEqual(roleSplit(out), { all: 3, "test-engineer": 9, critic: 6 });
  assert.ok(out.every(e => e.date === "2026-10-12"));
});

test("[situation-room 28] other aggregated lines: totals equal the stated total, split by role", () => {
  assert.equal(total(parseIncidents(REAL_36_50[4])), 15);
  assert.deepEqual(roleSplit(parseIncidents(REAL_36_50[4])), { builder: 3, critic: 2, "test-engineer": 10 });
  assert.equal(total(parseIncidents(REAL_36_50[5])), 18);
  assert.deepEqual(roleSplit(parseIncidents(REAL_36_50[5])), { all: 3, builder: 2, critic: 2, "test-engineer": 11 });
  assert.deepEqual(roleSplit(parseIncidents(REAL_36_50[6])), { all: 6, "test-engineer": 10, critic: 2 });
  assert.deepEqual(roleSplit(parseIncidents(REAL_36_50[8])), { builder: 1, all: 3, "test-engineer": 11, critic: 7 });
});

test("[situation-room 28] an aggregated line without a role breakdown still counts its total (6)", () => {
  assert.equal(total(parseIncidents(REAL_36_50[0])), 6);
});

test("[situation-room 28] a resolution note (not a block record) adds nothing", () => {
  assert.equal(total(parseIncidents(REAL_36_50[1])), 0);
});

test("[situation-room 28] the whole fixture block adds up", () => {
  // 6 + 0 + 2 + 1 + 15 + 18 + 18 + 18 + 22 + 6 single lines
  assert.equal(total(parseIncidents(REAL_36_50.join("\n"))), 6 + 0 + 2 + 1 + 15 + 18 + 18 + 18 + 22 + 6);
  assert.equal(total(parseIncidents(REAL_36_50.join("\r\n"))), 106); // CRLF files
});

test("[situation-room 28] garbled lines are skipped, not thrown", () => {
  const garbled = [
    "", "garbage", "|||", "2026-10-11", "2026-10-11 18:26", "2026-10-11 18:26 |", "2026-10-11 18:26 | hook blocked",
    "2026-10-11 18:26 | hook blocked Bash", "2026-10-11 18:26 | hook blocked Bash (",
    "2026-10-11 18:26 | 18 hook blocks ×××", "2026-10-11 18:26 | hook blocked Bash (all) ×abc",
    "2026-13-45 99:99 | hook blocked Bash (all)", "\u0000\u0001\u0002", "x".repeat(200000),
  ];
  for (const g of garbled) {
    assert.doesNotThrow(() => parseIncidents(g), JSON.stringify(g).slice(0, 40));
  }
  // the impossible date is garbled and must not become a block on some other day
  assert.deepEqual(parseIncidents("2026-13-45 99:99 | hook blocked Bash (all)"), []);
  // a good line between garbage still counts
  assert.equal(total(parseIncidents(`junk\n${REAL_36_50[9]}\n|||\n`)), 1);
});

test("[situation-room 28] non-string input gives [], never throws", () => {
  for (const v of [undefined, null, 0, {}, []]) assert.doesNotThrow(() => parseIncidents(v));
  assert.deepEqual(parseIncidents(undefined), []);
  assert.deepEqual(parseIncidents(""), []);
});

test("[situation-room 28] a huge declared count is bounded, not trusted", () => {
  const out = parseIncidents("2026-10-11 18:26 | hook blocked Bash (all) ×99999999999999");
  assert.ok(total(out) <= 1e6);
});

test("[situation-room 28] the real incidents.md parses without throwing and finds at least the fixture's blocks", () => {
  const real = readFileSync(path.join(root, "incidents.md"), "utf8");
  const out = parseIncidents(real);
  assert.ok(total(out) >= 106, `got ${total(out)}`);
  assert.ok(out.every(e => e.count >= 1 && Number.isFinite(e.t) && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
});

// ---------- 29: blocks over time, no double count ----------
const blockEv = (t, role, tool) => ({ t, ev: "Block", sid: "s1", who: role, role, tool, id: `i${t}`, reason: "r" });
const dayOf = (res, date) => res.days.find(d => d.date === date);

test("[situation-room 29] with no Block events, every incidents.md block is counted", () => {
  const incidents = parseIncidents(REAL_36_50.join("\n"));
  const res = blocksOverTime({ incidents, events: [], fromT: L(2026, 10, 11), toT: L(2026, 10, 12, 23, 59) });
  const d11 = dayOf(res, "2026-10-11");
  const d12 = dayOf(res, "2026-10-12");
  assert.equal(d11.total, 6 + 2 + 1 + 15 + 18 + 18);
  assert.equal(d12.total, 18 + 22 + 6);
});

test("[situation-room 29] incidents before the first Block event + log events after it; none counted twice", () => {
  const incidents = parseIncidents([
    "2026-10-12 09:35 | hook blocked Bash (all): a | x | state: contained | y",
    "2026-10-12 10:39 | hook blocked Bash (all): b | x | state: contained | y", // also in the log below
    "2026-10-12 11:15 | hook blocked Bash (critic): c | x | state: contained | y", // also in the log below
  ].join("\n"));
  const events = [
    blockEv(L(2026, 10, 12, 10, 39, 30), "all", "Bash"),
    blockEv(L(2026, 10, 12, 11, 15, 5), "critic", "Bash"),
    blockEv(L(2026, 10, 12, 12, 0, 0), "builder", "Write"),
  ];
  const res = blocksOverTime({ incidents, events, fromT: L(2026, 10, 12), toT: L(2026, 10, 12, 23, 59), firstEventT: L(2026, 10, 12, 8) });
  const d = dayOf(res, "2026-10-12");
  assert.equal(d.total, 1 + 3); // the 09:35 line, plus the three log events; 10:39 and 11:15 incidents not added again
  const roles = Object.fromEntries(d.roles.map(r => [r.key, r.n]));
  assert.deepEqual(roles, { all: 2, critic: 1, builder: 1 });
});

test("[situation-room 29] by role and by tool for a day", () => {
  const events = [blockEv(L(2026, 10, 12, 10, 0), "all", "Bash"), blockEv(L(2026, 10, 12, 10, 5), "all", "Bash"), blockEv(L(2026, 10, 12, 10, 6), "critic", "Read")];
  const res = blocksOverTime({ incidents: [], events, fromT: L(2026, 10, 12), toT: L(2026, 10, 12, 23, 59), firstEventT: L(2026, 10, 12, 9) });
  const d = dayOf(res, "2026-10-12");
  assert.equal(d.total, 3);
  assert.deepEqual(Object.fromEntries(d.tools.map(x => [x.key, x.n])), { Bash: 2, Read: 1 });
  assert.deepEqual(Object.fromEntries(d.roles.map(x => [x.key, x.n])), { all: 2, critic: 1 });
});

test("[situation-room 29] empty inputs: every day total 0, no exception", () => {
  const res = blocksOverTime({ incidents: [], events: [], fromT: L(2026, 10, 1), toT: L(2026, 10, 3) });
  assert.equal(res.days.length, 3);
  assert.ok(res.days.every(d => d.total === 0));
});

test("[situation-room 29] the same Block log event twice in the day file is two blocks (distinct lines), but an incident in the cut minute is not", () => {
  const incidents = parseIncidents("2026-10-12 10:39 | hook blocked Bash (all): b | x | state: contained | y");
  const res = blocksOverTime({ incidents, events: [blockEv(L(2026, 10, 12, 10, 39, 59), "all", "Bash")], fromT: L(2026, 10, 12), toT: L(2026, 10, 12, 23, 59), firstEventT: L(2026, 10, 12, 8) });
  assert.equal(dayOf(res, "2026-10-12").total, 1);
});

// ---------- 31: first-event date, no data vs zero ----------
test("[situation-room 31] a log starting 12.10 with a range from 01.10: earlier days are no-data, not zero", () => {
  const events = [{ t: L(2026, 10, 12, 8), ev: "Stop", sid: "s", who: "ORCHESTRATOR", branch: "main" }];
  const s = buildSummary({ events, incidentsText: "", commits: [], now: L(2026, 10, 12, 12), days: 12 });
  assert.equal(s.firstEvent.date, "2026-10-12");
  assert.equal(s.blocks.firstDate, "2026-10-12");
  const days = s.blocks.days;
  assert.equal(days.length, 12);
  assert.equal(days[0].date, "2026-10-01");
  assert.ok(days.slice(0, 11).every(d => d.noData === true), "earlier days are no data");
  assert.equal(days[11].date, "2026-10-12");
  assert.equal(days[11].noData, false);
  assert.equal(days[11].total, 0); // a day with data and no blocks is a real zero
});

test("[situation-room 31] incidents.md gives data from its own first day, not from the log's", () => {
  const events = [{ t: L(2026, 10, 12, 8), ev: "Stop", sid: "s", who: "ORCHESTRATOR", branch: "main" }];
  const s = buildSummary({ events, incidentsText: REAL_36_50.join("\n"), commits: [], now: L(2026, 10, 12, 12), days: 12 });
  const byDate = Object.fromEntries(s.blocks.days.map(d => [d.date, d]));
  assert.equal(byDate["2026-10-10"].noData, true);
  assert.equal(byDate["2026-10-11"].noData, false);
  assert.equal(byDate["2026-10-11"].total, 60);
  assert.equal(s.firstEvent.date, "2026-10-12"); // usage views start with the log
});

test("[situation-room 31] an empty log: no first event, and nothing presented as zero", () => {
  const s = buildSummary({ events: [], incidentsText: "", commits: [], now: L(2026, 10, 12, 12), days: 5 });
  assert.equal(s.firstEvent, null);
  assert.ok(s.blocks.days.every(d => d.noData === true));
  assert.deepEqual(s.usage, { agents: [], skills: [] });
  assert.deepEqual(s.rounds, []);
  assert.deepEqual(s.timeline.commits, []);
  assert.deepEqual(s.timeline.runs, []);
});

test("[situation-room 31] the range is clamped: 0, negative, NaN and a huge number never blow up", () => {
  for (const days of [0, -5, NaN, 1e9, "x", undefined, Infinity]) {
    const s = buildSummary({ events: [], incidentsText: "", commits: [], now: L(2026, 10, 12, 12), days });
    assert.ok(s.blocks.days.length >= 1 && s.blocks.days.length <= 400, String(days));
  }
});

test("[situation-room 31] first event date is the earliest event, whatever the order in the array", () => {
  const events = [
    { t: L(2026, 10, 12, 8), ev: "Stop", sid: "s", who: "ORCHESTRATOR" },
    { t: L(2026, 10, 9, 8), ev: "Stop", sid: "s", who: "ORCHESTRATOR" },
  ];
  const s = buildSummary({ events, now: L(2026, 10, 12, 12), days: 7 });
  assert.equal(s.firstEvent.date, "2026-10-09");
});

// ---------- 30: git parser (pure half) ----------
test("[situation-room 30] parseGitLog: merge marked by more than one parent, plain commit not", () => {
  const sep = "\x1f";
  const text = [
    `${"a".repeat(40)}${sep}${"b".repeat(40)} ${"c".repeat(40)}${sep}1760000100${sep}Merge branch x`,
    `${"b".repeat(40)}${sep}${"d".repeat(40)}${sep}1760000000${sep}plain commit`,
    `${"e".repeat(40)}${sep}${sep}1750000000${sep}root commit`,
  ].join("\n");
  const out = parseGitLog(text);
  assert.equal(out.length, 3);
  assert.equal(out[0].merge, true);
  assert.equal(out[1].merge, false);
  assert.equal(out[2].merge, false);
  assert.equal(out[0].t, 1760000100 * 1000);
  assert.equal(out[1].subject, "plain commit");
});

test("[situation-room 30] parseGitLog: garbage and empty input give [], a subject with the separator survives", () => {
  assert.deepEqual(parseGitLog(""), []);
  assert.deepEqual(parseGitLog(undefined), []);
  assert.deepEqual(parseGitLog("not a commit\n\n\x1f\x1f"), []);
  const sep = "\x1f";
  const out = parseGitLog(`${"a".repeat(40)}${sep}${sep}1760000000${sep}a${sep}b`);
  assert.equal(out.length, 1);
});

test("dayKey / dayRange: local calendar days, inclusive, across a month end", () => {
  assert.equal(dayKey(L(2026, 10, 1, 0, 0)), "2026-10-01");
  assert.equal(dayKey(L(2026, 10, 31, 23, 59)), "2026-10-31");
  assert.deepEqual(dayRange(L(2026, 9, 29, 15), L(2026, 10, 2, 1)), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.deepEqual(dayRange(L(2026, 10, 12, 8), L(2026, 10, 12, 9)), ["2026-10-12"]);
});
