#!/usr/bin/env node
// Situation room logger — .work/situation-room/spec.md, section 1.
//
// Wired in .claude/settings.json on ten events. Reads the hook JSON on stdin and appends one
// compact line to <main repo>/.live/events-YYYY-MM-DD.jsonl, which tools/situation-room/server.mjs
// streams to the page. A session in a worktree writes to the main checkout's log.
//
// Observes only. It always exits 0 and prints nothing, so it can never block or change a call,
// whatever goes wrong inside it. It records who works on what and when, never content: no prompt
// text, no assistant message, no Bash command, no skill arguments, no URL path, nothing that names
// an .env file. Every event is built from an explicit list of fields (ALLOWED); an input key that is
// not on the list cannot reach the log.
//
// writeEvent(event, projectDir) is also exported for guard.js, which logs its Block event through it.

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_FILE = 5 * 1024 * 1024; // per day file; excess events are dropped, Block events never
const RETENTION_DAYS = 60;
const DAY_FILE = /^events-(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

const COMMON = ['t', 'ev', 'sid', 'aid', 'who', 'branch'];
const ALLOWED = {
  SessionStart: ['source'],
  UserPromptSubmit: [],
  UserPromptExpansion: ['skill'],
  PreToolUse: ['tool', 'id', 'target', 'skill', 'subagent'],
  PostToolUse: ['tool', 'id', 'ms'],
  PostToolUseFailure: ['tool', 'id', 'ms', 'failed', 'interrupt'],
  SubagentStart: [],
  SubagentStop: [],
  Stop: ['reason'],
  SessionEnd: ['reason'],
  Block: ['role', 'tool', 'id', 'reason'],
};

function done() {
  process.exit(0);
}

function clip(value, max) {
  if (typeof value !== 'string') return undefined;
  const one = value.replace(/\s+/g, ' ').trim();
  if (!one) return undefined;
  return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

// A value that names an .env file is not logged at all (checked before clipping).
function noEnv(value) {
  return typeof value === 'string' && /\.env/i.test(value) ? undefined : value;
}

// The main checkout, also when the session runs in a worktree (.git is then a file).
function mainRoot(dir) {
  try {
    const dotGit = path.join(dir, '.git');
    if (fs.statSync(dotGit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
      const w = m && /^(.*)[\\/]\.git[\\/]worktrees[\\/]/.exec(m[1].trim());
      if (w) return w[1];
    }
  } catch {
    // Not a git checkout: log next to the project.
  }
  return dir;
}

function branch(dir) {
  try {
    let gitDir = path.join(dir, '.git');
    if (fs.statSync(gitDir).isFile()) {
      gitDir = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, 'utf8'))[1].trim();
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const m = /^ref: refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : head.slice(0, 7);
  } catch {
    return undefined;
  }
}

function who(agentType) {
  const a = typeof agentType === 'string' ? agentType.trim().toLowerCase() : '';
  return a ? clip(a, 60) : 'ORCHESTRATOR';
}

function relPath(p, dir) {
  if (typeof p !== 'string' || /\.env/i.test(p)) return undefined;
  const r = path.relative(dir, p).replace(/\\/g, '/');
  return clip(r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p.replace(/\\/g, '/'), 120);
}

// What the call works on, in one short line. Never a Bash command or file content.
function target(tool, input, dir) {
  const i = input && typeof input === 'object' ? input : {};
  switch (tool) {
    case 'Agent':
    case 'Task':
      return clip(noEnv(i.description), 120);
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return relPath(i.file_path, dir);
    case 'NotebookEdit':
      return relPath(i.notebook_path, dir);
    case 'Grep':
    case 'Glob':
      return clip(noEnv(i.pattern), 80);
    case 'Bash':
    case 'PowerShell':
      return clip(noEnv(i.description), 100);
    case 'WebFetch':
      try {
        return clip(noEnv(new URL(String(i.url)).hostname), 100); // never the path or query string
      } catch {
        return undefined;
      }
    default:
      return undefined; // Skill, WebSearch, MCP tools: the tool name is enough
  }
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function build(h) {
  const dir = h.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const ev = {
    t: Date.now(),
    ev: h.hook_event_name,
    sid: clip(h.session_id, 80),
    aid: clip(h.agent_id, 80),
    who: who(h.agent_type),
    branch: branch(dir),
  };
  const i = h.tool_input && typeof h.tool_input === 'object' ? h.tool_input : {};
  switch (h.hook_event_name) {
    case 'SessionStart':
      return { ...ev, source: clip(h.source, 20) };
    case 'UserPromptExpansion':
      return { ...ev, skill: clip(h.command_name, 60) };
    case 'PreToolUse': {
      const out = { ...ev, tool: clip(h.tool_name, 60), id: clip(h.tool_use_id, 80), target: target(h.tool_name, i, dir) };
      if (h.tool_name === 'Skill') out.skill = clip(i.skill, 60);
      if (h.tool_name === 'Agent' || h.tool_name === 'Task') out.subagent = clip(i.subagent_type, 60) || 'general-purpose';
      return out;
    }
    case 'PostToolUse':
      return { ...ev, tool: clip(h.tool_name, 60), id: clip(h.tool_use_id, 80), ms: num(h.duration_ms) };
    case 'PostToolUseFailure':
      return {
        ...ev, tool: clip(h.tool_name, 60), id: clip(h.tool_use_id, 80), ms: num(h.duration_ms),
        failed: true, interrupt: h.is_interrupt === true,
      };
    case 'Stop':
    case 'SessionEnd':
      return { ...ev, reason: clip(h.reason, 40) };
    case 'UserPromptSubmit':
    case 'SubagentStart':
    case 'SubagentStop':
      return ev;
    default:
      return null; // an event the room does not know is not logged
  }
}

function dayName(t) {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `events-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl`;
}

// Runs once, when a new day's file is created.
function prune(liveDir, now) {
  const cutoff = now - RETENTION_DAYS * 86400000;
  for (const name of fs.readdirSync(liveDir)) {
    const m = DAY_FILE.exec(name);
    if (!m) continue;
    if (new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() < cutoff) {
      try {
        fs.unlinkSync(path.join(liveDir, name));
      } catch {
        // Already pruned by a concurrent hook.
      }
    }
  }
}

function append(event, dir) {
  const liveDir = path.join(mainRoot(dir), '.live');
  const file = path.join(liveDir, dayName(event.t));
  fs.mkdirSync(liveDir, { recursive: true });
  let size = -1;
  try {
    size = fs.statSync(file).size;
  } catch {
    // First event of the day.
  }
  if (size < 0) prune(liveDir, event.t);
  else if (size >= MAX_FILE && event.ev !== 'Block') return; // over the cap: dropped
  fs.appendFileSync(file, JSON.stringify(event) + '\n');
}

// For guard.js. `event` must already be scrubbed by the caller (no command, no file name). Only the
// common fields and the fields listed for event.ev reach the log; `t` defaults to now. Returns
// nothing and throws on a write failure, so the caller wraps it in its own try/catch.
function writeEvent(event, projectDir) {
  const allowed = ALLOWED[event && event.ev];
  if (!allowed) return;
  const out = { t: Date.now() };
  for (const k of [...COMMON, ...allowed]) if (event[k] !== undefined) out[k] = event[k];
  append(out, projectDir);
}

function main() {
  process.on('uncaughtException', done);
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const h = JSON.parse(raw);
      const event = build(h);
      if (event) append(event, process.env.CLAUDE_PROJECT_DIR || h.cwd || process.cwd());
    } catch {
      // Observes only: a bad line is dropped, never reported as a failure.
    }
    done();
  });
}

if (require.main === module) main();
else module.exports = { build, target, mainRoot, branch, writeEvent, ALLOWED };
