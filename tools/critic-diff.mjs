// Prepares what CRITIC reads: the branch diff without any notes.md — stage1-guard.md (a, F7, R2-2).
// Usage: node tools/critic-diff.mjs <slug> [base]      base defaults to main
// Writes .work/<slug>/review.diff. Fails closed: on any doubt it exits 1 and writes nothing.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { NOTES_NAME } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'hooks', 'notes-name.js'));

function die(why) {
  process.stderr.write(`critic-diff: ${why}; nothing written.\n`);
  process.exit(1);
}

const [slug, base = 'main'] = process.argv.slice(2);
if (!slug || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..')) die('usage: node tools/critic-diff.mjs <slug> [base]; bad slug');
if (base.startsWith('-')) die('bad base');

// A failed run must leave no review.diff behind: remove an earlier one before anything else.
try {
  const top0 = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  fs.rmSync(path.join(top0, '.work', slug, 'review.diff'), { force: true });
} catch {
  die('could not clear the old review.diff (not a git repository, or the file is locked)');
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

let top;
let diff;
let kept;
try {
  top = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  git(top, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  const names = git(top, ['-c', 'core.quotepath=false', 'diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', `${base}...HEAD`])
    .split('\0')
    .filter(Boolean);
  const specs = new Set(['spec', 'schema', 'bug', 'findings'].map((n) => `.work/${slug}/${n}.md`));
  kept = names.filter((n) => {
    if (NOTES_NAME.test(path.posix.basename(n))) return false;
    return !n.toLowerCase().startsWith('.work/') || specs.has(n);
  });
  if (!kept.length) die('no reviewable files in the change set');
  diff = git(top, ['--literal-pathspecs', '-c', 'core.quotepath=false', 'diff', '--no-renames', '--no-ext-diff', '--no-color', `${base}...HEAD`, '--', ...kept]);
} catch {
  die('git failed (unknown base, not a repository, or the diff could not be read)');
}

// A real header is a line that starts with it; a code line that looks like one carries a +, - or space in front.
const paths = [];
for (const line of diff.split('\n')) {
  if (!line.startsWith('diff --git ')) continue;
  const rest = line.slice('diff --git '.length);
  if (rest.split(/[\s/"]+/).some((seg) => NOTES_NAME.test(seg))) die('a notes file is in the diff');
  const len = (rest.length - 5) / 2;
  const p = rest.slice(2, 2 + len);
  if (!Number.isInteger(len) || rest !== `a/${p} b/${p}`) die('could not read a diff header');
  paths.push(p);
}
if (paths.length !== kept.length || !kept.every((k) => paths.includes(k))) die('the files in the diff differ from the files chosen');

const dir = path.join(top, '.work', slug);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'review.diff'), diff, 'utf8');
process.stdout.write(`critic-diff: ${kept.length} files, .work/${slug}/review.diff\n`);
