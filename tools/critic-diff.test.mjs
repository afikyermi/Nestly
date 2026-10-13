// Tests for tools/critic-diff.mjs (spec: .work/agent-slim/stage1-guard.md, round 1 a, F7, R2-2).
// The script runs with the temp repo as cwd. Run: node --test tools/critic-diff.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'critic-diff.mjs');
const SECRET = 'SECRET-NOTES-CONTENT';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-diff-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  const w = (rel, body) => {
    const f = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  };
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  w('src/a.ts', 'export const a = 1;\n');
  w('README.md', 'hi\n');
  g('add', '.');
  g('commit', '-q', '-m', 'base');
  g('checkout', '-q', '-b', 'feature');
  w('src/a.ts', 'export const a = 2;\n// +diff --git a/x/notes.md b/x/notes.md (a code comment, not a header)\n');
  g('add', '.');
  g('commit', '-q', '-m', 'code');
  w('.work/s/notes.md', `${SECRET} lower\n`);
  w('.work/s/spec.md', 'SPEC-CONTENT\n');
  w('.work/s/schema.md', 'SCHEMA-CONTENT\n');
  w('.work/s/bug.md', 'BUG-CONTENT\n');
  w('.work/s/findings.md', 'FINDINGS-CONTENT\n');
  w('.work/s/other.md', 'OTHER-SLUG-FILE-CONTENT\n');
  w('.work/t/spec.md', 'OTHER-SLUG-SPEC-CONTENT\n');
  w('.work/s/sub/Notes.md', `${SECRET} nested mixed case\n`);
  w('docs/release-notes.md', 'RELEASE-NOTES-CONTENT\n');
  g('add', '.');
  g('commit', '-q', '-m', 'work files');
  // a second commit touching notes again, in upper case, and a plain notes edit
  w('.work/s/NOTES.md', `${SECRET} upper\n`);
  w('.work/s/notes.md', `${SECRET} lower, edited\n`);
  g('add', '.');
  g('commit', '-q', '-m', 'notes again');
  return { dir, g };
}

function run(dir, ...args) {
  assert.ok(fs.existsSync(SCRIPT), 'tools/critic-diff.mjs is missing');
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
}
const headers = (text) => text.split('\n').filter((l) => l.startsWith('diff --git '));
const baseName = (h) => h.split(' b/').pop().split('/').pop();

test('[a,R2-2] the produced diff holds code, spec and docs/release-notes.md, and no notes.md in any case', () => {
  const { dir } = repo();
  const r = run(dir, 's', 'main');
  assert.strictEqual(r.status, 0, r.stderr);
  const out = path.join(dir, '.work', 's', 'review.diff');
  assert.ok(fs.existsSync(out), 'review.diff is written');
  const text = fs.readFileSync(out, 'utf8');
  const hs = headers(text);
  assert.ok(hs.some((h) => h.endsWith(' b/src/a.ts')), 'a.ts');
  assert.ok(hs.some((h) => h.endsWith(' b/.work/s/spec.md')), 'spec.md');
  assert.ok(hs.some((h) => h.endsWith(' b/docs/release-notes.md')), 'release-notes.md passes (basename test, not substring)');
  assert.match(text, /RELEASE-NOTES-CONTENT/);
  assert.match(text, /SPEC-CONTENT/);
  for (const h of hs) assert.notStrictEqual(baseName(h).toLowerCase(), 'notes.md', h);
  assert.doesNotMatch(text, new RegExp(SECRET), 'no notes content');
});

test('[a] .work files other than this slug\'s spec/schema/bug/findings are dropped', () => {
  const { dir } = repo();
  assert.strictEqual(run(dir, 's', 'main').status, 0);
  const text = fs.readFileSync(path.join(dir, '.work', 's', 'review.diff'), 'utf8');
  for (const keep of ['SPEC-CONTENT', 'SCHEMA-CONTENT', 'BUG-CONTENT', 'FINDINGS-CONTENT']) assert.match(text, new RegExp(keep));
  assert.doesNotMatch(text, /OTHER-SLUG-FILE-CONTENT/);
  assert.doesNotMatch(text, /OTHER-SLUG-SPEC-CONTENT/);
});

test('[a] a code line that looks like a notes diff header is content, not a header: the script still succeeds and keeps it', () => {
  const { dir } = repo();
  const r = run(dir, 's', 'main');
  assert.strictEqual(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(dir, '.work', 's', 'review.diff'), 'utf8');
  assert.match(text, /a code comment, not a header/);
});

test('[a] base defaults to main', () => {
  const { dir } = repo();
  assert.strictEqual(run(dir, 's').status, 0);
  const text = fs.readFileSync(path.join(dir, '.work', 's', 'review.diff'), 'utf8');
  assert.ok(headers(text).some((h) => h.endsWith(' b/src/a.ts')));
});

test('[a] running twice does not feed the previous review.diff back in, and still has no notes', () => {
  const { dir } = repo();
  assert.strictEqual(run(dir, 's', 'main').status, 0);
  const first = fs.readFileSync(path.join(dir, '.work', 's', 'review.diff'), 'utf8');
  assert.strictEqual(run(dir, 's', 'main').status, 0);
  const second = fs.readFileSync(path.join(dir, '.work', 's', 'review.diff'), 'utf8');
  assert.strictEqual(second, first);
});

test('[F7] a notes file anywhere in the change set (nested, any case) is excluded, including a notes-only branch', () => {
  const { dir, g } = repo();
  g('checkout', '-q', 'main');
  g('checkout', '-q', '-b', 'notes-only');
  fs.mkdirSync(path.join(dir, '.work', 'n'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.work', 'n', 'Notes.MD'), `${SECRET}\n`);
  g('add', '.');
  g('commit', '-q', '-m', 'only notes');
  const r = run(dir, 'n', 'main');
  const out = path.join(dir, '.work', 'n', 'review.diff');
  const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  assert.doesNotMatch(text, new RegExp(SECRET));
  for (const h of headers(text)) assert.notStrictEqual(baseName(h).toLowerCase(), 'notes.md', h);
  assert.notStrictEqual(r.status, null);
});

test('[a] fails closed: a missing slug or an unknown base exits non-zero and writes no review.diff', () => {
  const { dir } = repo();
  const r1 = run(dir);
  assert.notStrictEqual(r1.status, 0);
  const r2 = run(dir, 's', 'no-such-branch');
  assert.notStrictEqual(r2.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.work', 's', 'review.diff')), 'no file on failure');
});

test('[a] a hostile slug does not escape .work/<slug>/', () => {
  const { dir } = repo();
  const r = run(dir, '../../evil', 'main');
  assert.notStrictEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '..', 'evil', 'review.diff')));
  assert.ok(!fs.existsSync(path.join(path.dirname(dir), 'evil', 'review.diff')));
});

test('[F7] notes-name.js exports NOTES_NAME, and it matches notes.md in any case but not release-notes.md', async () => {
  const mod = await import('node:module').then((m) => m.createRequire(import.meta.url)(path.join(path.dirname(SCRIPT), '..', '.claude', 'hooks', 'notes-name.js')));
  assert.ok(mod.NOTES_NAME, 'NOTES_NAME exported');
  const asRe = mod.NOTES_NAME instanceof RegExp ? mod.NOTES_NAME : null;
  if (asRe) {
    for (const n of ['notes.md', 'NOTES.md', 'Notes.MD']) assert.ok(asRe.test(n), n);
    assert.ok(!asRe.test('release-notes.md'));
  } else {
    assert.strictEqual(String(mod.NOTES_NAME).toLowerCase(), 'notes.md');
  }
});
