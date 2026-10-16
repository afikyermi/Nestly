// F1.8 P1 (.work/google-sign-in/spec.md criteria 1-2): TEST ENGINEER may write e2e-preview/<name>.flow.ts, nothing else new.
// Run: node --test .claude/hooks/guard-flow.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-flow-'));
fs.writeFileSync(path.join(ROOT, 'incidents.md'), '# Incidents\n');
const P = (...s) => path.join(ROOT, ...s);

function run(role, tool, input) {
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd: ROOT }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}
function blocks(role, tool, input) {
  const r = run(role, tool, input);
  assert.strictEqual(r.status, 2, `should be blocked: ${role} ${tool} ${JSON.stringify(input)}`);
  assert.doesNotMatch(r.stderr, /guard error/, r.stderr);
}
function allows(role, tool, input) {
  const r = run(role, tool, input);
  assert.strictEqual(r.status, 0, `should be allowed: ${role} ${tool} ${JSON.stringify(input)}\n${r.stderr}`);
}
const w = (rel) => [
  ['Write', { file_path: P(...rel.split('/')), content: '' }],
  ['Edit', { file_path: P(...rel.split('/')), old_string: 'a', new_string: 'b' }],
];

test('F1.8 P1 criterion 1: test-engineer may write e2e-preview/<name>.flow.ts', () => {
  for (const rel of ['e2e-preview/google-sign-in.flow.ts', 'e2e-preview/other.flow.ts']) {
    for (const [tool, input] of w(rel)) allows('test-engineer', tool, input);
  }
});

test('F1.8 P1 criterion 1: test-engineer is denied every other e2e-preview path and look-alike', () => {
  for (const rel of [
    'e2e-preview/support/test-user.ts',
    'e2e-preview/playwright.config.ts',
    'e2e-preview/a.flow.ts.bak',
    'e2e-preview/sub/a.flow.ts',
    'x/e2e-preview/a.flow.ts',
    'apps/web/src/a.flow.ts',
  ]) {
    for (const [tool, input] of w(rel)) blocks('test-engineer', tool, input);
  }
});

test('F1.8 P1 criterion 2: paths denied to test-engineer before stay denied', () => {
  for (const rel of ['package.json', 'apps/web/src/main.tsx', 'e2e/playwright.config.ts', '.work/feat/notes.md', 'tsconfig.json']) {
    for (const [tool, input] of w(rel)) blocks('test-engineer', tool, input);
  }
  // existing allowances unchanged
  for (const rel of ['e2e/a.spec.ts', 'apps/web/tests/a.test.tsx', '.work/feat/spec.md']) {
    for (const [tool, input] of w(rel)) allows('test-engineer', tool, input);
  }
});

test('F1.8 P1 criterion 2: critic gains no allowance on a flow file; builder stays barred from test files and notes', () => {
  for (const [tool, input] of w('e2e-preview/google-sign-in.flow.ts')) blocks('critic', tool, input);
  for (const rel of ['e2e/a.spec.ts', 'apps/web/tests/a.test.tsx']) {
    for (const [tool, input] of w(rel)) blocks('builder', tool, input);
  }
  blocks('critic', 'Read', { file_path: P('.work', 'feat', 'notes.md') });
});
