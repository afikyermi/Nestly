// Regression tests for .work/guard-notes-case/bug.md: CRITIC's notes.md rule must not depend on
// letter case or on the host platform. Every case runs under win32, linux and darwin through a
// --require preload that overrides process.platform. Run: node --test .claude/hooks/guard-case.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');
const PRELOAD = path.join(__dirname, 'force-platform.js');

// A throwaway project root, so blocked calls log to its incidents.md and not to the real one.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-case-'));
fs.writeFileSync(path.join(ROOT, 'incidents.md'), '# Incidents\n');

function run(platform, tool, input) {
  const r = spawnSync(process.execPath, ['--require', PRELOAD, GUARD, 'critic'], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd: ROOT }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, FORCE_PLATFORM: platform },
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

// A block must come from a rule, not from the guard failing closed on its own error.
function blocks(platform, tool, input) {
  const r = run(platform, tool, input);
  const what = `[${platform}] ${JSON.stringify(input)}`;
  assert.strictEqual(r.status, 2, `should be blocked: ${what}`);
  assert.doesNotMatch(r.stderr, /guard error/, `blocked by a guard error, not a rule: ${what}\n${r.stderr}`);
}
function allows(platform, tool, input) {
  const r = run(platform, tool, input);
  assert.strictEqual(r.status, 0, `should be allowed: [${platform}] ${JSON.stringify(input)}\n${r.stderr}`);
}

for (const platform of ['win32', 'linux', 'darwin']) {
  test(`bug.md-1 [${platform}]: a git exclusion in the wrong case does not exclude notes.md, so the read is blocked`, () => {
    for (const c of [
      "git diff main -- . ':(exclude).WORK/*/notes.md'",
      "git diff main -- . ':(exclude).work/*/NOTES.MD'",
      "git diff main -- . ':(exclude).Work/*/Notes.md'",
      "git diff main -- . ':!.WORK/*/notes.md'",
      "git log -p -3 -- . ':(exclude)*NOTES.MD'",
      "git diff main...HEAD -- . ':(exclude,glob).WORK/**/notes.md'",
    ]) {
      blocks(platform, 'Bash', { command: c });
    }
  });

  test(`bug.md-2 [${platform}]: case never opens a path to notes.md (Bash wildcard, cd, Grep path)`, () => {
    blocks(platform, 'Bash', { command: 'cat .WORK/f/*' });
    blocks(platform, 'Bash', { command: 'cd .WORK/f && cat *' });
    blocks(platform, 'Grep', { pattern: 'x', path: '.WORK' });
    // Other spellings of the same thing.
    blocks(platform, 'Bash', { command: 'cat .Work/f/*' });
    blocks(platform, 'Bash', { command: 'cd .Work/f && cat n*' });
    blocks(platform, 'Grep', { pattern: 'x', path: '.Work' });
    blocks(platform, 'Read', { file_path: path.join(ROOT, '.WORK', 'f', 'NOTES.MD') });
    blocks(platform, 'Bash', { command: 'cat .WORK/f/NOTES.MD' });
  });

  test(`bug.md-3 [${platform}]: what is allowed today in exact case stays allowed`, () => {
    for (const c of [
      "git diff main...HEAD -- . ':(exclude).work/*/notes.md'",
      "git diff main...HEAD -- . ':(exclude).work'",
      "git log -p -3 -- . ':!.work/*/notes.md'",
      "git log -p -- . ':^.work/*/notes.md'",
      'git log --oneline -5',
      'git status',
      'find .work -type f',
      'cat .work/f/spec.md',
      'npm run ci',
    ]) {
      allows(platform, 'Bash', { command: c });
    }
    allows(platform, 'Grep', { pattern: 'x', path: '.work', glob: '*.ts', output_mode: 'content' });
    allows(platform, 'Grep', { pattern: 'x', glob: '*.ts' });
    allows(platform, 'Grep', { pattern: 'x', type: 'ts' });
    allows(platform, 'Read', { file_path: path.join(ROOT, '.work', 'f', 'spec.md') });
  });

  test(`bug.md-3 [${platform}]: exact-case notes.md access is still blocked`, () => {
    blocks(platform, 'Bash', { command: 'cat .work/f/*' });
    blocks(platform, 'Bash', { command: 'cd .work/f && cat *' });
    blocks(platform, 'Grep', { pattern: 'x', path: '.work' });
    blocks(platform, 'Bash', { command: "git diff main -- . ':(exclude).work/x/spec.md'" });
  });
}

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
