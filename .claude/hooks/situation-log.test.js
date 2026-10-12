'use strict';
// Tests for situation-log.js: it never blocks a call, and it never logs a Bash command.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { build } = require('./situation-log.js');

const SCRIPT = path.join(__dirname, 'situation-log.js');

function run(input, dir) {
  return spawnSync(process.execPath, [SCRIPT], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'situation-'));
}

test('appends one line per event and exits 0 silently', () => {
  const dir = tmp();
  const r = run(JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 's', agent_id: 'a1', agent_type: 'critic' }), dir);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const lines = fs.readFileSync(path.join(dir, '.live', 'events.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(
    (({ ev, aid, atype }) => ({ ev, aid, atype }))(JSON.parse(lines[0])),
    { ev: 'SubagentStart', aid: 'a1', atype: 'critic' },
  );
});

test('bad input still exits 0 and writes nothing', () => {
  const dir = tmp();
  const r = run('not json', dir);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(fs.existsSync(path.join(dir, '.live', 'events.jsonl')), false);
});

test('a Bash call is logged by its description, never its command', () => {
  const ev = build({
    hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_use_id: 't',
    tool_input: { command: 'export TOKEN=secret123 && run', description: 'Run the build' },
  });
  assert.strictEqual(ev.target, 'Run the build');
  assert.ok(!JSON.stringify(ev).includes('secret123'));
});

test('Skill and Agent calls carry the skill name and the subagent type', () => {
  const skill = build({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Skill', tool_use_id: 't', tool_input: { skill: 'srs-lookup' } });
  assert.strictEqual(skill.skill, 'srs-lookup');
  const agent = build({
    hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Agent', tool_use_id: 't',
    tool_input: { subagent_type: 'builder', description: 'Implement part e', prompt: 'long' },
  });
  assert.strictEqual(agent.subagent, 'builder');
  assert.strictEqual(agent.target, 'Implement part e');
  assert.strictEqual(agent.prompt, undefined);
});

test('a worktree session logs to the main checkout', () => {
  const main = tmp();
  const wt = tmp();
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'x')}\n`);
  const r = run(JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }), wt);
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(main, '.live', 'events.jsonl')));
});
