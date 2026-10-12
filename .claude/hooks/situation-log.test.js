'use strict';
// Tests for situation-log.js, derived from .work/situation-room/spec.md (sections 1 and 4, criteria 1-17).
// Every test writes to a temp directory (CLAUDE_PROJECT_DIR), never to the real .live/.
// Test names carry the criterion number: "[C7]" asserts criterion 7 of the spec.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'situation-log.js');
const ROOT = path.join(__dirname, '..', '..');
const CAP = 5 * 1024 * 1024;

const made = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'situation-'));
  made.push(d);
  return d;
}
test.after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function run(input, dir) {
  return spawnSync(process.execPath, [SCRIPT], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
}

// One hook invocation with a JSON payload whose cwd is the temp project.
function fire(dir, payload) {
  return run(JSON.stringify({ session_id: 's1', cwd: dir, ...payload }), dir);
}

function liveFiles(dir) {
  const live = path.join(dir, '.live');
  return fs.existsSync(live) && fs.statSync(live).isDirectory() ? fs.readdirSync(live).map(n => path.join(live, n)) : [];
}
// Every byte of every file under .live, as one string.
function allBytes(dir) {
  return liveFiles(dir).map(f => fs.readFileSync(f, 'utf8')).join('');
}
function lines(dir) {
  return allBytes(dir).split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function only(dir) {
  const l = lines(dir);
  assert.strictEqual(l.length, 1, `expected exactly one line, got ${l.length}`);
  return l[0];
}
function p2(n) {
  return String(n).padStart(2, '0');
}
function todayFile() {
  const d = new Date();
  return `events-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.jsonl`;
}
function pre(dir, tool, tool_input, extra = {}) {
  return fire(dir, { hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: 'tu1', tool_input, ...extra });
}

const COMMON = ['t', 'ev', 'sid', 'aid', 'who', 'branch'];
// Section 1 of the spec, written out independently of the implementation.
const TABLE = {
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

// ---------- 1. never blocks, never prints ----------

test('[C1] valid, invalid, empty and unparseable input exit 0 with empty stdout and stderr', () => {
  const dir = tmp();
  const inputs = [
    JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }),
    JSON.stringify({ hook_event_name: 'NoSuchEvent', session_id: 's' }),
    JSON.stringify({}),
    JSON.stringify(null),
    JSON.stringify([1, 2]),
    JSON.stringify('str'),
    'not json',
    '{"hook_event_name":',
    '',
    '\u0000\u0001\u0002',
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: 'not-an-object' }),
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url: 42 } }),
    JSON.stringify({ hook_event_name: 'PostToolUse', duration_ms: 'NaN', tool_name: 5 }),
  ];
  for (const input of inputs) {
    const r = run(input, dir);
    assert.strictEqual(r.status, 0, `status for ${input.slice(0, 40)}`);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
  }
});

test('[C1] bad input writes no line', () => {
  const dir = tmp();
  run('not json', dir);
  run('', dir);
  assert.strictEqual(allBytes(dir), '');
});

test('[C1] an unwritable .live (a file where the directory should be) still exits 0 silently', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.live'), 'i am a file');
  const r = fire(dir, { hook_event_name: 'Stop' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr, '');
  assert.strictEqual(fs.readFileSync(path.join(dir, '.live'), 'utf8'), 'i am a file');
});

test('[C1] a valid event writes exactly one line to a per-day file named for the local date', () => {
  const dir = tmp();
  const r = fire(dir, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'critic' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const files = liveFiles(dir).map(f => path.basename(f));
  assert.deepStrictEqual(files, [todayFile()]);
  const e = only(dir);
  assert.strictEqual(e.ev, 'SubagentStart');
  assert.strictEqual(e.aid, 'a1');
  assert.strictEqual(e.who, 'critic');
  assert.strictEqual(e.sid, 's1');
  assert.ok(Math.abs(e.t - Date.now()) < 60000, 't is ms epoch');
});

// ---------- 2-3. no prompt, no assistant message ----------

test('[C2] UserPromptSubmit: the prompt is in no byte of the log and the line has no text field', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'UserPromptSubmit', prompt: 'SECRET-PROMPT-7', user_prompt: 'SECRET-PROMPT-7' });
  const e = only(dir);
  assert.strictEqual(e.ev, 'UserPromptSubmit');
  assert.ok(!('text' in e));
  assert.ok(!allBytes(dir).includes('SECRET-PROMPT-7'));
});

test('[C3] SubagentStop: the last assistant message is in no byte of the log and the line has no last field', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'critic', last_assistant_message: 'SECRET-MSG' });
  const e = only(dir);
  assert.strictEqual(e.ev, 'SubagentStop');
  assert.ok(!('last' in e));
  assert.ok(!allBytes(dir).includes('SECRET-MSG'));
});

// ---------- 4. Bash / PowerShell ----------

for (const tool of ['Bash', 'PowerShell']) {
  test(`[C4] ${tool} without a description: no target and the command is in no byte of the log`, () => {
    const dir = tmp();
    pre(dir, tool, { command: 'export T=SECRET-CMD' });
    const e = only(dir);
    assert.strictEqual(e.tool, tool);
    assert.ok(!('target' in e));
    assert.ok(!allBytes(dir).includes('SECRET-CMD'));
  });

  test(`[C4] ${tool} with a description: target equals it, the command is in no byte of the log`, () => {
    const dir = tmp();
    pre(dir, tool, { command: 'export T=SECRET-CMD', description: 'Run the build' });
    assert.strictEqual(only(dir).target, 'Run the build');
    assert.ok(!allBytes(dir).includes('SECRET-CMD'));
  });
}

// ---------- 5. Skill args ----------

test('[C5] Skill: line has the skill name and nothing from args', () => {
  const dir = tmp();
  pre(dir, 'Skill', { skill: 'srs-lookup', args: 'SECRET-ARGS' });
  const e = only(dir);
  assert.strictEqual(e.skill, 'srs-lookup');
  assert.ok(!('args' in e));
  assert.ok(!allBytes(dir).includes('SECRET-ARGS'));
});

test('[C5] UserPromptExpansion: line has the command name and nothing from command_args', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'UserPromptExpansion', command_name: 'feature', command_args: 'SECRET-ARGS' });
  const e = only(dir);
  assert.strictEqual(e.skill, 'feature');
  assert.ok(!('command_args' in e));
  assert.ok(!allBytes(dir).includes('SECRET-ARGS'));
});

// ---------- 6. URLs ----------

test('[C6] WebFetch: target is the hostname only, no path, query or fragment in any byte', () => {
  const dir = tmp();
  pre(dir, 'WebFetch', { url: 'https://example.com/p?token=SECRET-Q#f', prompt: 'SECRET-WFP' });
  const e = only(dir);
  assert.strictEqual(e.target, 'example.com');
  const bytes = allBytes(dir);
  assert.ok(!bytes.includes('SECRET-Q'));
  assert.ok(!bytes.includes('SECRET-WFP'));
  assert.ok(!bytes.includes('token='));
  assert.ok(!bytes.includes('/p'));
});

test('[C6] WebFetch with credentials in the URL logs the hostname only', () => {
  const dir = tmp();
  pre(dir, 'WebFetch', { url: 'https://user:SECRET-PW@example.com:8443/a/b' });
  assert.strictEqual(only(dir).target, 'example.com');
  assert.ok(!allBytes(dir).includes('SECRET-PW'));
});

test('[C6] WebFetch with an unparseable url writes the event without a target', () => {
  const dir = tmp();
  const r = pre(dir, 'WebFetch', { url: 'not a url SECRET-Q' });
  assert.strictEqual(r.status, 0);
  assert.ok(!('target' in only(dir)));
  assert.ok(!allBytes(dir).includes('SECRET-Q'));
});

test('[C6] WebSearch: no target, the query is in no byte of the log', () => {
  const dir = tmp();
  pre(dir, 'WebSearch', { query: 'SECRET-QUERY' });
  const e = only(dir);
  assert.ok(!('target' in e));
  assert.ok(!('query' in e));
  assert.ok(!allBytes(dir).includes('SECRET-QUERY'));
});

// ---------- 7. .env ----------

test('[C7] a .env token in any target omits target, still writes the event, and no line matches /\\.env/i', () => {
  const dir = tmp();
  const cases = [
    ['Read', { file_path: '.env' }],
    ['Write', { file_path: '.env.preview' }],
    ['Edit', { file_path: 'apps/web/.env.local' }],
    ['Read', { file_path: 'C:\\x\\.env.example' }],
    ['Read', { file_path: path.join(dir, 'apps', 'x', '.env') }],
    ['Read', { file_path: 'apps/web/.ENV.local' }],
    ['MultiEdit', { file_path: 'apps/web/.env.production' }],
    ['NotebookEdit', { notebook_path: 'a/.env/n.ipynb' }],
    ['Grep', { pattern: '**/.env*' }],
    ['Glob', { pattern: '**/.env*' }],
    ['Bash', { description: 'read .env.preview', command: 'cat .env.preview' }],
    ['Agent', { description: 'check .env handling', subagent_type: 'builder' }],
  ];
  for (const [tool, input] of cases) {
    const before = lines(dir).length;
    const r = pre(dir, tool, input);
    assert.strictEqual(r.status, 0);
    const l = lines(dir);
    assert.strictEqual(l.length, before + 1, `${tool} ${JSON.stringify(input)} still writes an event`);
    const e = l[l.length - 1];
    assert.strictEqual(e.ev, 'PreToolUse');
    assert.strictEqual(e.tool, tool);
    assert.ok(!('target' in e), `${tool} ${JSON.stringify(input)} must have no target`);
  }
  assert.ok(!/\.env/i.test(allBytes(dir)), 'no log byte matches /\\.env/i');
});

// ---------- 8. project-relative paths ----------

test('[C8] Read of a relative path keeps it; an absolute path inside the project becomes relative', () => {
  const rel = tmp();
  pre(rel, 'Read', { file_path: 'apps/web/src/a.tsx' });
  assert.strictEqual(only(rel).target, 'apps/web/src/a.tsx');

  const abs = tmp();
  pre(abs, 'Read', { file_path: path.join(abs, 'apps', 'web', 'src', 'a.tsx') });
  assert.strictEqual(only(abs).target, 'apps/web/src/a.tsx');
});

test('[C8] Grep and Glob log the pattern, clipped to 80', () => {
  const dir = tmp();
  pre(dir, 'Grep', { pattern: 'x'.repeat(500) });
  const e = only(dir);
  assert.ok(e.target.length <= 80 && e.target.length > 10);
});

test('[C8] an MCP tool and Skill have no target, the tool name is enough', () => {
  const dir = tmp();
  pre(dir, 'mcp__x__do', { file_path: 'a/b.ts', command: 'SECRET-MCP', url: 'https://e.com/x' });
  const e = only(dir);
  assert.strictEqual(e.tool, 'mcp__x__do');
  assert.ok(!('target' in e));
  assert.ok(!allBytes(dir).includes('SECRET-MCP'));
});

test('[C8] Agent: target is the description, subagent defaults to general-purpose, prompt never logged', () => {
  const a = tmp();
  pre(a, 'Agent', { subagent_type: 'builder', description: 'Implement part e', prompt: 'SECRET-AGENT-PROMPT' });
  const e = only(a);
  assert.strictEqual(e.subagent, 'builder');
  assert.strictEqual(e.target, 'Implement part e');
  assert.ok(!allBytes(a).includes('SECRET-AGENT-PROMPT'));

  const b = tmp();
  pre(b, 'Task', { description: 'Do a thing' });
  assert.strictEqual(only(b).subagent, 'general-purpose');
});

// ---------- 9. file content ----------

test('[C9] Write, Edit and MultiEdit content never reaches the log', () => {
  const dir = tmp();
  pre(dir, 'Write', { file_path: 'a.ts', content: 'MARK-CONTENT' });
  pre(dir, 'Edit', { file_path: 'a.ts', old_string: 'MARK-OLD', new_string: 'MARK-NEW' });
  pre(dir, 'MultiEdit', { file_path: 'a.ts', edits: [{ old_string: 'MARK-OLD2', new_string: 'MARK-NEW2' }] });
  pre(dir, 'NotebookEdit', { notebook_path: 'n.ipynb', new_source: 'MARK-NB' });
  assert.strictEqual(lines(dir).length, 4);
  const bytes = allBytes(dir);
  for (const m of ['MARK-CONTENT', 'MARK-OLD', 'MARK-NEW', 'MARK-NB']) assert.ok(!bytes.includes(m), m);
  for (const e of lines(dir)) {
    assert.ok(!('content' in e) && !('new_string' in e) && !('old_string' in e));
  }
});

// ---------- 10. property: only allowed keys, for every event name ----------

test('[C10] for every event name in the table, written keys are a subset of the allowed list and extra input never appears', () => {
  const JUNK = 'JUNK-MARKER-10';
  const extras = {};
  for (const k of ['prompt', 'text', 'last', 'last_assistant_message', 'args', 'command_args', 'query', 'bg',
    'transcript_path', 'error', 'message', 'content', 'extra', 'user_prompt', 'stop_hook_active']) extras[k] = JUNK;
  const toolInput = { command: JUNK, content: JUNK, new_string: JUNK, old_string: JUNK, args: JUNK, query: JUNK, prompt: JUNK, extra: JUNK };

  for (const name of Object.keys(TABLE)) {
    const dir = tmp();
    if (name === 'Block') {
      const { writeEvent } = require('./situation-log.js');
      writeEvent({ ev: 'Block', sid: 's1', who: 'critic', role: 'critic', tool: 'Bash', id: 't1', reason: 'r', ...extras, command: JUNK }, dir);
    } else {
      const r = fire(dir, {
        hook_event_name: name, agent_id: 'a1', agent_type: 'Critic', tool_name: 'Bash', tool_use_id: 't1',
        duration_ms: 12, is_interrupt: true, source: 'startup', reason: 'done', command_name: 'feature',
        tool_input: { ...toolInput, subagent_type: 'builder' }, ...extras,
      });
      assert.strictEqual(r.status, 0, name);
    }
    const l = lines(dir);
    assert.strictEqual(l.length, 1, `${name} writes one line`);
    const allowed = new Set([...COMMON, ...TABLE[name]]);
    for (const k of Object.keys(l[0])) assert.ok(allowed.has(k), `${name}: key "${k}" is not in the section 1 table`);
    assert.strictEqual(l[0].ev, name);
    assert.ok(!allBytes(dir).includes(JUNK), `${name}: junk input reached the log`);
  }
});

test('[C10] an event name outside the table is not written', () => {
  const dir = tmp();
  const r = fire(dir, { hook_event_name: 'SomethingNew', prompt: 'X' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(allBytes(dir), '');
});

// ---------- 11. who and branch ----------

test('[C11] who is the lower-cased agent_type, or ORCHESTRATOR when absent or empty', () => {
  const cases = [
    [{ agent_type: 'CRITIC' }, 'critic'],
    [{ agent_type: 'Test-Engineer' }, 'test-engineer'],
    [{ agent_type: '' }, 'ORCHESTRATOR'],
    [{ agent_type: '   ' }, 'ORCHESTRATOR'],
    [{}, 'ORCHESTRATOR'],
    [{ agent_type: null }, 'ORCHESTRATOR'],
  ];
  for (const [extra, expected] of cases) {
    const dir = tmp();
    fire(dir, { hook_event_name: 'Stop', ...extra });
    assert.strictEqual(only(dir).who, expected, JSON.stringify(extra));
  }
});

test('[C11] aid is present inside a subagent and absent otherwise', () => {
  const a = tmp();
  fire(a, { hook_event_name: 'Stop', agent_id: 'ag-9' });
  assert.strictEqual(only(a).aid, 'ag-9');
  const b = tmp();
  fire(b, { hook_event_name: 'Stop' });
  assert.ok(!('aid' in only(b)));
});

test('[C11] branch is read from .git/HEAD in a normal checkout, including nested names', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/ui-wave-1/part-e\n');
  fire(dir, { hook_event_name: 'Stop' });
  assert.strictEqual(only(dir).branch, 'ui-wave-1/part-e');
});

test('[C11] branch is read from the worktree gitdir HEAD', () => {
  const main = tmp();
  const wt = tmp();
  const gd = path.join(main, '.git', 'worktrees', 'x');
  fs.mkdirSync(gd, { recursive: true });
  fs.writeFileSync(path.join(gd, 'HEAD'), 'ref: refs/heads/tools/situation-room\n');
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gd}\n`);
  fire(wt, { hook_event_name: 'Stop' });
  assert.strictEqual(only(main).branch, 'tools/situation-room');
});

test('[C11] a detached HEAD yields a short SHA, not the ref text', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'd955d5c1e66ae70c83c65c2da8b16f6a0e2a0000\n');
  fire(dir, { hook_event_name: 'Stop' });
  const b = only(dir).branch;
  assert.ok(typeof b === 'string' && b.length >= 7 && b.length < 40 && 'd955d5c1e66ae70c83c65c2da8b16f6a0e2a0000'.startsWith(b));
});

test('[C11] outside git the branch field is absent', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'Stop' });
  assert.ok(!('branch' in only(dir)));
});

test('[C11] a .git directory without a HEAD does not break the event', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  const r = fire(dir, { hook_event_name: 'Stop' });
  assert.strictEqual(r.status, 0);
  assert.ok(!('branch' in only(dir)));
});

test('[C8][C11] a session whose cwd is a subdirectory still logs the root branch and root-relative paths', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/ui-wave-1/part-e\n');
  const sub = path.join(dir, 'apps', 'web');
  fs.mkdirSync(sub, { recursive: true });
  const parts = ['apps', 'web', 'src', 'a.tsx'];
  const r = run(JSON.stringify({
    session_id: 's1', cwd: sub, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 't',
    tool_input: { file_path: path.join(dir, ...parts) },
  }), dir);
  assert.strictEqual(r.status, 0);
  const e = only(dir);
  assert.strictEqual(e.branch, 'ui-wave-1/part-e');
  assert.strictEqual(e.target, parts.join('/'));
});

test('[C11][C13] control: a worktree session with a subdirectory cwd logs its own branch to the main checkout', () => {
  const main = tmp();
  const wt = tmp();
  fs.mkdirSync(path.join(main, '.git'));
  fs.writeFileSync(path.join(main, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const gd = path.join(main, '.git', 'worktrees', 'x');
  fs.mkdirSync(gd, { recursive: true });
  fs.writeFileSync(path.join(gd, 'HEAD'), 'ref: refs/heads/tools/wt-branch\n');
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gd}\n`);
  const sub = path.join(wt, 'apps', 'web');
  fs.mkdirSync(sub, { recursive: true });
  const parts = ['apps', 'web', 'src', 'a.tsx'];
  const r = run(JSON.stringify({
    session_id: 's1', cwd: sub, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 't',
    tool_input: { file_path: path.join(wt, ...parts) },
  }), wt);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(liveFiles(wt).length, 0);
  const e = only(main);
  assert.strictEqual(e.branch, 'tools/wt-branch');
  assert.strictEqual(e.target, parts.join('/'));
});

// ---------- 12. durations and failures ----------

test('[C12] PostToolUse carries ms; PostToolUseFailure carries failed:true, interrupt, ms and no error text', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 'tu1', duration_ms: 42, tool_response: 'SECRET-RESP' });
  fire(dir, {
    hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_use_id: 'tu2', duration_ms: 7,
    error: 'SECRET-ERR', is_interrupt: false,
  });
  const [ok, bad] = lines(dir);
  assert.strictEqual(ok.ev, 'PostToolUse');
  assert.strictEqual(ok.ms, 42);
  assert.strictEqual(ok.tool, 'Read');
  assert.strictEqual(ok.id, 'tu1');
  assert.ok(!('failed' in ok));
  assert.strictEqual(bad.ev, 'PostToolUseFailure');
  assert.strictEqual(bad.failed, true);
  assert.strictEqual(bad.interrupt, false);
  assert.strictEqual(bad.ms, 7);
  assert.ok(!('error' in bad));
  const bytes = allBytes(dir);
  assert.ok(!bytes.includes('SECRET-ERR'));
  assert.ok(!bytes.includes('SECRET-RESP'));
});

test('[C12] an interrupted failure is flagged interrupt:true', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_use_id: 't', duration_ms: 1, is_interrupt: true });
  assert.strictEqual(only(dir).interrupt, true);
});

test('[C12] a non-numeric duration is not logged as ms', () => {
  const dir = tmp();
  fire(dir, { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 't', duration_ms: 'fast' });
  const e = only(dir);
  assert.ok(!('ms' in e) || typeof e.ms === 'number');
});

// ---------- 13. worktree ----------

test('[C13] a worktree session logs to the main checkout, not to the worktree', () => {
  const main = tmp();
  const wt = tmp();
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'x')}\n`);
  const r = run(JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }), wt);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(lines(main).length, 1);
  assert.strictEqual(liveFiles(wt).length, 0);
});

// ---------- 14. concurrency ----------

function fireAsync(dir, id) {
  return new Promise(resolve => {
    const c = spawn(process.execPath, [SCRIPT], { env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, stdio: ['pipe', 'ignore', 'ignore'] });
    c.on('close', code => resolve(code));
    c.stdin.end(JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'Read', tool_use_id: id, duration_ms: 1, cwd: dir }));
  });
}

test('[C14] two concurrent writers x 50 events give 100 intact JSON lines', async () => {
  const dir = tmp();
  const writer = async w => {
    const codes = [];
    for (let i = 0; i < 50; i++) codes.push(await fireAsync(dir, `w${w}-${i}`));
    return codes;
  };
  const codes = (await Promise.all([writer(1), writer(2)])).flat();
  assert.ok(codes.every(c => c === 0));
  const raw = allBytes(dir);
  const ls = raw.split('\n');
  assert.strictEqual(ls.pop(), '', 'file ends with a newline');
  assert.strictEqual(ls.length, 100);
  const ids = ls.map(l => JSON.parse(l).id);
  assert.strictEqual(new Set(ids).size, 100, 'every event present exactly once');
});

// ---------- 15. size cap ----------

test('[C15] a day file at the cap does not grow for ordinary events; a Block event still appends', () => {
  const dir = tmp();
  const live = path.join(dir, '.live');
  fs.mkdirSync(live);
  const file = path.join(live, todayFile());
  const fill = Buffer.alloc(CAP, 'x');
  fill[CAP - 1] = 10; // ends with a newline
  fs.writeFileSync(file, fill);
  assert.strictEqual(fs.statSync(file).size, CAP);

  for (const name of ['Stop', 'SubagentStart', 'UserPromptSubmit']) {
    const r = fire(dir, { hook_event_name: name });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stderr, '');
  }
  pre(dir, 'Read', { file_path: 'a.ts' });
  assert.strictEqual(fs.statSync(file).size, CAP, 'file did not grow');

  const { writeEvent } = require('./situation-log.js');
  writeEvent({ ev: 'Block', sid: 's1', who: 'critic', role: 'critic', tool: 'Bash', id: 'b1', reason: 'blocked' }, dir);
  const size = fs.statSync(file).size;
  assert.ok(size > CAP, 'Block event appended past the cap');
  const tail = fs.readFileSync(file, 'latin1').trimEnd().split('\n').pop();
  assert.strictEqual(JSON.parse(tail).ev, 'Block');
});

test('[C15] after the cap is hit, no other file is created for dropped events', () => {
  const dir = tmp();
  const live = path.join(dir, '.live');
  fs.mkdirSync(live);
  const fill = Buffer.alloc(CAP, 'x');
  fs.writeFileSync(path.join(live, todayFile()), fill);
  fire(dir, { hook_event_name: 'Stop' });
  assert.deepStrictEqual(liveFiles(dir).map(f => path.basename(f)), [todayFile()]);
});

test('[Size] a new day file prunes day files older than 60 days and keeps newer ones', () => {
  const dir = tmp();
  const live = path.join(dir, '.live');
  fs.mkdirSync(live);
  const old = path.join(live, 'events-2020-01-01.jsonl');
  const d = new Date(Date.now() - 30 * 86400000);
  const recent = path.join(live, `events-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.jsonl`);
  const other = path.join(live, 'keep.txt');
  fs.writeFileSync(old, '{}\n');
  fs.writeFileSync(recent, '{}\n');
  fs.writeFileSync(other, 'x');
  fire(dir, { hook_event_name: 'Stop' });
  assert.ok(!fs.existsSync(old), 'old day file pruned');
  assert.ok(fs.existsSync(recent), 'recent day file kept');
  assert.ok(fs.existsSync(other), 'unrelated file untouched');
  assert.ok(fs.existsSync(path.join(live, todayFile())));
});

// ---------- 16. speed ----------

test('[C16] the median of 20 invocations is at most 300 ms', () => {
  const dir = tmp();
  const input = JSON.stringify({
    hook_event_name: 'PreToolUse', session_id: 's', cwd: dir, tool_name: 'Edit', tool_use_id: 't',
    tool_input: { file_path: 'a.ts', old_string: 'a', new_string: 'b' },
  });
  const times = [];
  for (let i = 0; i < 20; i++) {
    const t0 = process.hrtime.bigint();
    const r = run(input, dir);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    assert.strictEqual(r.status, 0);
  }
  times.sort((a, b) => a - b);
  const median = (times[9] + times[10]) / 2;
  assert.ok(median <= 300, `median ${median.toFixed(0)} ms`);
});

// ---------- 17. wiring ----------

const TEN = ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];

test('[C17] settings.json wires the hook on all ten events with timeout 2', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  for (const name of TEN) {
    const groups = settings.hooks && settings.hooks[name];
    assert.ok(Array.isArray(groups), `${name} has hooks`);
    const mine = groups.flatMap(g => g.hooks || []).filter(h => typeof h.command === 'string' && h.command.includes('situation-log.js'));
    assert.strictEqual(mine.length, 1, `${name} wires situation-log.js exactly once`);
    assert.strictEqual(mine[0].type, 'command');
    assert.strictEqual(mine[0].timeout, 2, `${name} timeout`);
  }
});

test('[C17] .gitignore ignores .live/', () => {
  const lines = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(l => l.trim());
  assert.ok(lines.includes('.live/'));
});

test('[C17] test:tools runs situation-log.test.js and the situation-room script exists', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['test:tools'].includes('.claude/hooks/situation-log.test.js'));
  assert.ok(typeof pkg.scripts['situation-room'] === 'string' && pkg.scripts['situation-room'].length > 0);
});
