// Situation room — the pure part: what the log means. No file system, no clock, no network.
// Used by the server (tools/situation-room/server.mjs); spec: .work/situation-room/spec.md,
// sections 1 and 3.
//
// Everything here takes data in and gives data out, so it can be tested on fixtures.

export const NO_PART = "ללא חלק";
export const DAY_MS = 86400000;

// Math.min(...array) throws a RangeError from about 125k elements; the log can hold more.
export function minOf(items, pick = x => x) {
  let m = null;
  for (const it of items) { const v = pick(it); if (m === null || v < m) m = v; }
  return m;
}
export function maxOf(items, pick = x => x) {
  let m = null;
  for (const it of items) { const v = pick(it); if (m === null || v > m) m = v; }
  return m;
}

// ---------- reading the log: the allowlist ----------
// The server's own copy of the field list in .claude/hooks/situation-log.js. An old line (the draft
// logged prompt text and assistant messages) or a widened hook cannot reach the page through here.
const COMMON = { t: "number", ev: "string", sid: "string", aid: "string", who: "string", branch: "string" };
const FIELDS = {
  SessionStart: { source: "string" },
  UserPromptSubmit: {},
  UserPromptExpansion: { skill: "string" },
  PreToolUse: { tool: "string", id: "string", target: "string", skill: "string", subagent: "string" },
  PostToolUse: { tool: "string", id: "string", ms: "number" },
  PostToolUseFailure: { tool: "string", id: "string", ms: "number", failed: "boolean", interrupt: "boolean" },
  SubagentStart: {},
  SubagentStop: {},
  Stop: { reason: "string" },
  SessionEnd: { reason: "string" },
  Block: { role: "string", tool: "string", id: "string", reason: "string" },
};
const MAX_STRING = 200;

// One parsed log line -> the event the room may use, or null. Unknown event names, a missing or
// non-numeric `t`, and every field outside the list are dropped. A `target` naming an .env file is
// dropped too (the hook never writes one; an older log might hold it).
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const extra = typeof raw.ev === "string" && Object.hasOwn(FIELDS, raw.ev) ? FIELDS[raw.ev] : null;
  if (!extra || typeof raw.t !== "number" || !Number.isFinite(raw.t)) return null;
  const out = {};
  for (const [key, type] of Object.entries({ ...COMMON, ...extra })) {
    const v = raw[key];
    if (typeof v !== type) continue;
    if (type === "number" && !Number.isFinite(v)) continue;
    out[key] = type === "string" ? v.slice(0, MAX_STRING) : v;
  }
  if (out.target !== undefined && /\.env/i.test(out.target)) delete out.target;
  if (out.sid === undefined) out.sid = "-";
  if (out.who === undefined) out.who = "ORCHESTRATOR";
  return out;
}

export function parseLogLine(line) {
  try {
    return sanitizeEvent(JSON.parse(line));
  } catch {
    return null;
  }
}

// ---------- part and step ----------
// `<feature>/<part>` splits at the first slash. main, a detached SHA or no branch has no part.
export function splitBranch(branch) {
  if (typeof branch !== "string" || !branch.trim() || /^[0-9a-f]{7,40}$/.test(branch)) {
    return { feature: null, part: NO_PART };
  }
  const i = branch.indexOf("/");
  if (branch === "main" || i < 0) return { feature: branch, part: NO_PART };
  return { feature: branch.slice(0, i), part: branch.slice(i + 1) };
}

export function partKey(branch) {
  const { feature, part } = splitBranch(branch);
  return part === NO_PART ? NO_PART : `${feature}/${part}`;
}

// workflow.md numbering. builder is 6 (10 once a critic has run in the same part), critic 9 (11
// from its second run in the part). Scout is support: it shows under its caller's step.
const BASE_STEP = { spec: 3, "data-architect": 5, "algorithm-data": "5b", builder: 6, "test-engineer": 8, critic: 9 };

// Feed events in log order; `annotate` returns each with `feature`, `part` and `step` (null for the
// orchestrator and for an agent type that has no step; "support" for scout without a running caller).
export function createStepper() {
  const criticRuns = new Map(); // part key -> critic runs started
  const aidStep = new Map(); // agent id -> its step
  const running = new Map(); // session id -> Map(aid -> step) of non-scout agents
  return {
    annotate(ev) {
      const { feature, part } = splitBranch(ev.branch);
      // Without a part (main, a plain branch) the runs are counted per branch, not shared by all of them.
      const key = part === NO_PART ? `branch:${ev.branch ?? ""}` : partKey(ev.branch);
      let step = null;
      if (ev.ev === "SubagentStart" && ev.aid && aidStep.has(ev.aid)) {
        step = aidStep.get(ev.aid); // the same start seen again (a replay): not a new run
      } else if (ev.ev === "SubagentStart" && ev.aid) {
        if (ev.who === "critic") {
          const n = (criticRuns.get(key) ?? 0) + 1;
          criticRuns.set(key, n);
          step = n >= 2 ? 11 : 9;
        } else if (ev.who === "builder") {
          step = (criticRuns.get(key) ?? 0) > 0 ? 10 : 6;
        } else if (ev.who === "scout") {
          const callers = [...(running.get(ev.sid)?.values() ?? [])];
          step = callers.length ? callers[callers.length - 1] : "support";
        } else {
          step = Object.hasOwn(BASE_STEP, ev.who) ? BASE_STEP[ev.who] : null;
        }
        aidStep.set(ev.aid, step);
        if (ev.who !== "scout") {
          if (!running.has(ev.sid)) running.set(ev.sid, new Map());
          running.get(ev.sid).set(ev.aid, step);
        }
      } else if (ev.aid) {
        step = aidStep.has(ev.aid) ? aidStep.get(ev.aid) : (Object.hasOwn(BASE_STEP, ev.who) ? BASE_STEP[ev.who] : null);
        if (ev.ev === "SubagentStop") running.get(ev.sid)?.delete(ev.aid);
      }
      return { ...ev, feature, part, step };
    },
  };
}

// ---------- days ----------
const p2 = n => String(n).padStart(2, "0");
export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
// Local dates from the day of `fromT` to the day of `toT`, inclusive.
export function dayRange(fromT, toT) {
  const out = [];
  const a = new Date(fromT);
  for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate()); d.getTime() <= toT && out.length < 400;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(dayKey(d.getTime()));
  return out;
}

// ---------- usage ----------
function bump(map, key, init) {
  let row = map.get(key);
  if (!row) { row = init(); map.set(key, row); }
  return row;
}
function partRow(parts, branch, init) {
  const { feature, part } = splitBranch(branch);
  return bump(parts, partKey(branch), () => ({ feature, part, ...init() }));
}
const agentInit = () => ({ runs: 0, running: 0, ms: 0 });
const skillInit = () => ({ uses: 0, ms: 0 });

// Per agent type: runs, runs still open, total ms (SubagentStart to SubagentStop; an open run has no
// duration), and the same per part. Per skill: uses, ms (sum of the Skill tool calls' `ms`; slash
// expansions count as a use with no duration), and the same per part.
export function usage(events) {
  const agents = new Map();
  const skills = new Map();
  const open = new Map(); // aid -> { who, branch, t }
  const calls = new Map(); // tool id -> { name, branch }
  const useSkill = (name, branch) => {
    const row = bump(skills, name, () => ({ name, ...skillInit(), parts: new Map() }));
    const prow = partRow(row.parts, branch, skillInit);
    row.uses++;
    prow.uses++;
    return [row, prow];
  };
  for (const ev of events) {
    if (ev.ev === "SubagentStart" && ev.aid) {
      const row = bump(agents, ev.who, () => ({ who: ev.who, ...agentInit(), parts: new Map() }));
      const prow = partRow(row.parts, ev.branch, agentInit);
      row.runs++; row.running++; prow.runs++; prow.running++;
      open.set(ev.aid, { who: ev.who, branch: ev.branch, t: ev.t });
    } else if (ev.ev === "SubagentStop" && open.has(ev.aid)) {
      const o = open.get(ev.aid);
      open.delete(ev.aid);
      const row = agents.get(o.who);
      const prow = partRow(row.parts, o.branch, agentInit);
      const ms = Math.max(0, ev.t - o.t);
      row.running--; row.ms += ms; prow.running--; prow.ms += ms;
    } else if (ev.ev === "PreToolUse" && ev.tool === "Skill" && ev.skill) {
      useSkill(ev.skill, ev.branch);
      if (ev.id) calls.set(ev.id, { name: ev.skill, branch: ev.branch });
    } else if (ev.ev === "UserPromptExpansion" && ev.skill) {
      useSkill(ev.skill, ev.branch);
    } else if ((ev.ev === "PostToolUse" || ev.ev === "PostToolUseFailure") && ev.id && calls.has(ev.id)) {
      const c = calls.get(ev.id);
      calls.delete(ev.id);
      if (typeof ev.ms === "number") {
        const row = skills.get(c.name);
        row.ms += ev.ms;
        partRow(row.parts, c.branch, skillInit).ms += ev.ms;
      }
    }
  }
  const finish = rows => [...rows.values()]
    .map(r => ({ ...r, parts: [...r.parts.values()].sort((a, b) => (b.runs ?? b.uses) - (a.runs ?? a.uses)) }))
    .sort((a, b) => (b.runs ?? b.uses) - (a.runs ?? a.uses));
  return { agents: finish(agents), skills: finish(skills) };
}

// ---------- rounds ----------
// CRITIC and TEST ENGINEER runs per part (the branch at SubagentStart). "Until approved" is not
// knowable. `mergedAt` maps a part key to the time of its last merge on main; runs after it are not
// counted as rounds of that part (spec section 3.2, open question 5).
export function rounds(events, mergedAt = {}) {
  const rows = new Map();
  for (const ev of events) {
    if (ev.ev !== "SubagentStart" || (ev.who !== "critic" && ev.who !== "test-engineer")) continue;
    const key = partKey(ev.branch);
    const { feature, part } = splitBranch(ev.branch);
    const row = bump(rows, key, () => ({ feature, part, critic: 0, testEngineer: 0, afterMerge: 0, mergedAt: null, lastRunAt: 0 }));
    const cut = Object.hasOwn(mergedAt, key) ? mergedAt[key] : null;
    row.mergedAt = cut;
    row.lastRunAt = Math.max(row.lastRunAt, ev.t);
    if (cut !== null && ev.t > cut) row.afterMerge++;
    else if (ev.who === "critic") row.critic++;
    else row.testEngineer++;
  }
  return [...rows.values()].sort((a, b) => b.lastRunAt - a.lastRunAt);
}

// ---------- incidents.md ----------
const INCIDENT_LINE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/;
const SINGLE = /^hook blocked (\S+) \(([^)]*)\)(?: ×(\d+))?/;
const AGGREGATE = /^(\d+) hook blocks?\b/;
const BREAKDOWN = /(?:^|[:·])\s*([A-Za-z][A-Za-z_ -]{0,30}?) ×(\d+)/g;
const MAX_COUNT = 100000;
const roleName = s => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

// Blocks recorded in incidents.md: [{ t, date, role, tool, count }]. The minute of an entry is the
// start of its time (an aggregated line spans a range). A line that is not a block record, or is
// garbled, gives nothing and never throws.
export function parseIncidents(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    try {
      const m = INCIDENT_LINE.exec(line);
      if (!m) continue;
      const [y, mo, d, h, mi] = m.slice(1).map(Number);
      const when = new Date(y, mo - 1, d, h, mi);
      // A date that rolls over (month 13, minute 99) is a garbled line, not a block on another day.
      if (when.getFullYear() !== y || when.getMonth() !== mo - 1 || when.getDate() !== d || when.getHours() !== h || when.getMinutes() !== mi) continue;
      const t = when.getTime();
      const desc = (line.split(" | ")[1] ?? "").trim();
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      const one = SINGLE.exec(desc);
      if (one) {
        const count = Math.min(Number(one[3] ?? 1), MAX_COUNT);
        out.push({ t, date, role: roleName(one[2]) || "unknown", tool: one[1], count });
        continue;
      }
      const agg = AGGREGATE.exec(desc);
      if (!agg) continue;
      const total = Math.min(Number(agg[1]), MAX_COUNT);
      let known = 0;
      for (const b of desc.replace(/\([^)]*\)/g, "").split(" — ")[0].matchAll(BREAKDOWN)) {
        const count = Number(b[2]);
        known += count;
        out.push({ t, date, role: roleName(b[1]), tool: null, count });
      }
      if (total > known) out.push({ t, date, role: "unknown", tool: null, count: total - known });
    } catch {
      // A garbled line is skipped.
    }
  }
  return out;
}

// ---------- blocks over time ----------
// incidents.md entries before the first `Block` event of the log (to the minute) plus the log's own
// Block events; a block present in both counts once. Days before the earliest source are noData.
export function blocksOverTime({ incidents = [], events = [], fromT, toT, firstEventT = null }) {
  const logBlocks = events.filter(e => e.ev === "Block");
  const firstBlock = logBlocks.length ? minOf(logBlocks, e => e.t) : null;
  const cut = firstBlock === null ? Infinity : Math.floor(firstBlock / 60000) * 60000;
  const items = [
    ...incidents.filter(i => i.t < cut).map(i => ({ t: i.t, role: i.role, tool: i.tool, count: i.count })),
    ...logBlocks.map(e => ({ t: e.t, role: e.role ?? "unknown", tool: e.tool ?? null, count: 1 })),
  ];
  const starts = [firstEventT, ...incidents.map(i => i.t)].filter(v => typeof v === "number");
  const first = starts.length ? dayKey(minOf(starts)) : null;
  const days = new Map(dayRange(fromT, toT).map(date => [date, { date, noData: first === null || date < first, total: 0, roles: new Map(), tools: new Map() }]));
  for (const it of items) {
    const day = days.get(dayKey(it.t));
    if (!day) continue;
    day.total += it.count;
    day.roles.set(it.role, (day.roles.get(it.role) ?? 0) + it.count);
    const tool = it.tool ?? "—";
    day.tools.set(tool, (day.tools.get(tool) ?? 0) + it.count);
  }
  const arr = m => [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  return {
    firstDate: first,
    days: [...days.values()].map(d => ({ date: d.date, noData: d.noData, total: d.total, roles: arr(d.roles), tools: arr(d.tools) })),
    points: items.filter(i => i.t >= fromT && i.t <= toT).map(i => ({ t: i.t, role: i.role, tool: i.tool, count: i.count })),
  };
}

// ---------- git ----------
export const GIT_LOG_FORMAT = "%H%x1f%P%x1f%ct%x1f%s";

// Output of `git log --first-parent --format=GIT_LOG_FORMAT` -> [{ sha, t, subject, merge }].
export function parseGitLog(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const [sha, parents, ct, ...subject] = line.split("\x1f");
    const t = Number(ct) * 1000;
    if (!sha || !/^[0-9a-f]{7,64}$/.test(sha) || !Number.isFinite(t) || t <= 0) continue;
    out.push({ sha, t, subject: subject.join("\x1f").slice(0, 200), merge: (parents ?? "").trim().split(/\s+/).filter(Boolean).length > 1 });
  }
  return out;
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// For each part seen in `events`, the time of the last first-parent commit on main whose subject
// names the part (`ui-wave-1/part-e` is named by "UI wave 1 part e"). Parts never named are absent.
export function mergeTimes(events, commits) {
  const keys = new Set(events.filter(e => e.ev === "SubagentStart").map(e => partKey(e.branch)));
  const out = {};
  for (const key of keys) {
    if (key === NO_PART) continue;
    const name = norm(key);
    const hits = commits.filter(c => ` ${norm(c.subject)} `.includes(` ${name} `) && /\bmerge\b/i.test(c.subject));
    if (hits.length) out[key] = maxOf(hits, c => c.t);
  }
  return out;
}

// ---------- the summary ----------
// Agent runs as spans (an unstopped run has end null) and parts as spans, within [fromT, toT].
function spans(events, fromT, toT) {
  const open = new Map();
  const runs = [];
  const parts = new Map();
  for (const ev of events) {
    const key = partKey(ev.branch);
    if (key !== NO_PART) {
      const { feature, part } = splitBranch(ev.branch);
      const p = bump(parts, key, () => ({ feature, part, from: ev.t, to: ev.t }));
      p.from = Math.min(p.from, ev.t);
      p.to = Math.max(p.to, ev.t);
    }
    if (ev.ev === "SubagentStart" && ev.aid) {
      const run = { aid: ev.aid, who: ev.who, part: key, start: ev.t, end: null };
      open.set(ev.aid, run);
      runs.push(run);
    } else if (ev.ev === "SubagentStop" && open.has(ev.aid)) {
      open.get(ev.aid).end = ev.t;
      open.delete(ev.aid);
    }
  }
  return {
    runs: runs.filter(r => (r.end ?? toT) >= fromT && r.start <= toT),
    parts: [...parts.values()].filter(p => p.to >= fromT && p.from <= toT),
  };
}

// Everything the history views show, from the events in the log, the text of incidents.md, the
// parsed commits of main, `now`, and a range of `days`.
export function buildSummary({ events, incidentsText = "", commits = [], now, days = 30 }) {
  const range = Math.min(Math.max(Math.trunc(days) || 30, 1), 90);
  const toT = now;
  const fromT = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() - (range - 1)).getTime();
  const firstEventT = minOf(events, e => e.t);
  const incidents = parseIncidents(incidentsText);
  const blocks = blocksOverTime({ incidents, events, fromT, toT, firstEventT });
  const sp = spans(events, fromT, toT);
  return {
    now,
    range: { days: range, fromT, toT },
    firstEvent: firstEventT === null ? null : { t: firstEventT, date: dayKey(firstEventT) },
    usage: usage(events),
    rounds: rounds(events, mergeTimes(events, commits)),
    blocks: { firstDate: blocks.firstDate, days: blocks.days },
    timeline: {
      commits: commits.filter(c => c.t >= fromT && c.t <= toT),
      runs: sp.runs,
      parts: sp.parts,
      blocks: blocks.points,
    },
  };
}
