#!/usr/bin/env node
// PreToolUse guard — WORKPLAN 7.2, decisions.md (2026-10-11, "hooks (7.2)").
//
// Usage: node guard.js <role> (called through guard-loader.js)   role: all | critic | test-engineer | builder
//   all            — wired in .claude/settings.json; runs for every agent, subagents included.
//   critic, test-engineer, builder — wired in that agent's frontmatter; runs only inside it.
//
// Reads the hook JSON on stdin. Exit 0 lets the tool call run; exit 2 blocks it and the
// reason on stderr goes back to the agent. Any other exit code would let the call through,
// so the guard fails closed: bad input, an unknown role, a command too long to check or any
// error inside the guard exits 2.
//
// Every block is appended to .claude/logs/blocks.jsonl (local, in .gitignore) as {time, role, tool, rule, reason,
// session} — the reason only, never the command, which may hold a secret. /wrap-up counts them. rule: reader (R1/R2
// and the CRITIC / TEST ENGINEER tool limits), r4-critical (.env, prod refs, force push, a secret), r4, builder.
// Only two things reach incidents.md (a line for Afik): an r4-critical block, and the third reader block of one
// role in one session — the signs of an agent probing the fence.
//
// CRITIC has no shell: every Bash call is blocked, and Read/Grep/Glob/Write are judged by path (symlinks resolved).
// TEST ENGINEER reads with Read/Grep/Glob only; its Bash is one test run on explicit files. That allowlist rests on
// its Write limit: no package.json, .npmrc, tsconfig or tool config. The two go together.
//
// A fence, not a vault: these are path and pattern checks on what the agent asked for.
// A determined agent can build an equivalent the patterns do not match. CRITIC review and
// CI stay behind it.

'use strict';

process.on('uncaughtException', () => {
  try {
    process.stderr.write('Blocked by .claude/hooks/guard.js: guard error\n');
  } finally {
    process.exit(2);
  }
});

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { NOTES_NAME } = require('./notes-name.js');

const ROLES = new Set(['all', 'critic', 'test-engineer', 'builder']);
const WIN = process.platform === 'win32';
const MAX_COMMAND = 50000;

// ---------- paths ----------

function slash(p) {
  return String(p).replace(/\\/g, '/');
}

// Git Bash writes C:\x as /c/x.
function fromGitBash(p) {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  return m ? `${m[1]}:/${m[2]}` : p;
}

function fold(p) {
  return WIN ? p.toLowerCase() : p;
}

function abs(p, cwd) {
  return path.resolve(cwd, fromGitBash(slash(p)));
}

// Project-relative, forward slashes, case-folded on Windows. '' is the root itself.
// A path outside the project comes back starting with '../'.
function rel(p, root, cwd) {
  const r = slash(path.relative(root, abs(p, cwd)));
  return fold(r);
}

function isInside(r, dir) {
  return r === dir || r.startsWith(dir + '/');
}

// r is the project root or above it ('', '..', '../..').
function isTop(r) {
  return r === '' || /^(\.\.(\/|$))+$/.test(r);
}

// r is the directory dir itself, or one of its ancestors (so a search there reaches into dir).
function reaches(r, dir) {
  return isTop(r) || isInside(dir, r);
}

// TEST ENGINEER never reads the implementation: app source and the Vercel adapter.
const APP_IMPL = /^apps\/[^/]+\/(src|api)(\/|$)/;
const TEST_AREAS = [/^apps\/[^/]+\/tests(\/|$)/, /^packages\/[^/]+\/tests(\/|$)/, /^e2e(\/|$)/, /^supabase\/tests(\/|$)/];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function isAppImpl(r) {
  return APP_IMPL.test(r);
}

// A search rooted at r reaches app implementation.
function reachesAppImpl(r) {
  return isAppImpl(r) || isTop(r) || r === 'apps' || /^apps\/[^/]+$/.test(r);
}

function isTestPath(r) {
  return TEST_AREAS.some((re) => re.test(r)) || TEST_FILE.test(r);
}

function isNotes(r) {
  return NOTES_NAME.test(path.posix.basename(r).split(':')[0]); // an NTFS stream suffix names the same file
}

// The literal directory a glob pattern starts in: "apps/web/src/**/*.ts" -> "apps/web/src".
function literalPrefix(pattern) {
  const out = [];
  for (const seg of slash(pattern).split('/')) {
    if (/[*?[\]{}!]/.test(seg)) break;
    out.push(seg);
  }
  return out.join('/');
}

// ---------- shell parsing ----------

// Drops heredoc bodies — they are data, such as a commit message. A heredoc starts at an
// unquoted `<<WORD` or `<<-WORD`; `<<<` is a here-string and is not one.
function dropHeredocs(command) {
  const kept = [];
  let delim = null;
  for (const line of String(command).split('\n')) {
    if (delim !== null) {
      if (line.trim() === delim) delim = null;
      continue;
    }
    kept.push(line);
    // Find `<<` outside quotes (quote contents masked, same length), then read the
    // delimiter — which may itself be quoted — from the original line.
    const masked = line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => q[0] + '_'.repeat(q.length - 2) + q[0]);
    const at = /(?:^|[^<])(<<)(?!<)/.exec(masked);
    if (at) {
      const m = /^<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(line.slice(at.index + at[0].length - 2));
      if (m) delim = m[1];
    }
  }
  return kept.join('\n');
}

// Splits a command into segments (on && || ; | & ( ) ` and newlines, outside quotes) of
// unquoted tokens. Strings handed to another shell — bash -c, sh -c, eval, powershell
// -Command, cmd /c — are parsed too, and their segments added.
function shellSegments(command, depth = 0) {
  const src = dropHeredocs(command);
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const pushToken = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const pushSegment = () => {
    pushToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < src.length) cur += src[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
      cur += src[++i];
      has = true;
    } else if (c === '|' && src[i - 1] === '>') {
      cur += c; // `>|` is a redirection, not a pipe
      has = true;
    } else if ('|;&()`\n'.includes(c)) {
      pushSegment();
    } else if (/\s/.test(c)) {
      pushToken();
    } else {
      cur += c;
      has = true;
    }
  }
  pushSegment();
  if (depth > 8) return segments;
  const nested = [];
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const name = path.posix.basename(slash(seg[i])).toLowerCase().replace(/\.exe$/, '');
      const next = (seg[i + 1] || '').toLowerCase();
      if (['bash', 'sh', 'zsh'].includes(name) && next === '-c' && seg[i + 2]) {
        nested.push(...shellSegments(seg[i + 2], depth + 1));
      } else if (['powershell', 'pwsh'].includes(name)) {
        const k = seg.findIndex((t, j) => j > i && /^-(c|command)$/i.test(t));
        if (k > 0) nested.push(...shellSegments(seg.slice(k + 1).join(' '), depth + 1));
      } else if (name === 'cmd' && next === '/c') {
        nested.push(...shellSegments(seg.slice(i + 2).join(' '), depth + 1));
      } else if (name === 'eval' && i === 0) {
        nested.push(...shellSegments(seg.slice(1).join(' '), depth + 1));
      }
    }
  }
  return segments.concat(nested);
}

// For a segment that runs git: the subcommand, what follows it, and a -C directory if given.
function gitCall(seg) {
  const i = seg.findIndex((t) => /^git(\.exe)?$/i.test(path.posix.basename(slash(t))));
  if (i < 0) return null;
  let dir = null;
  let j = i + 1;
  while (j < seg.length && seg[j].startsWith('-')) {
    if (seg[j] === '-C') dir = seg[j + 1] || null;
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(seg[j])) j++;
    j++;
  }
  if (j >= seg.length) return null;
  return { sub: seg[j], args: seg.slice(j + 1), dir };
}

function hasShortFlag(args, letter) {
  return args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));
}

// ---------- rules: everyone ----------

const ADD_ALL = new Set(['-A', '--all', '.', './', '*', ':', ':/', ':(top)', '--no-ignore-removal']);

function addsEverything(args) {
  return args.some((a) => ADD_ALL.has(a) || /^:\(.*(top|glob).*\)/.test(a) || /^(\.\/?)?\*+$/.test(a) || /(^|\/)\.\.?\/?$/.test(a)) ||
    hasShortFlag(args, 'A');
}

const CD = ['cd', 'pushd', 'set-location', 'sl', 'chdir'];

function commandName(seg) {
  return path.posix.basename(slash(seg[0] || '')).toLowerCase().replace(/\.exe$/, '');
}

// Pairs each segment with the directory it runs in, following cd from segment to segment.
function withCwd(segments, start) {
  let cwd = start;
  return segments.map((seg) => {
    const here = cwd;
    if (CD.includes(commandName(seg)) && seg[1]) cwd = abs(seg[1], cwd);
    return { seg, cwd: here };
  });
}

// Supabase projects no agent may reach from the shell: production — migrations to prod run only from CI after
// Afik's approval (decisions.md, 2026-10-11, "Working rules") — and the two retired projects of the first setup,
// opened by mistake in Asia and replaced by Frankfurt projects on 2026-10-11.
const BLOCKED_REFS = [
  'cihugbwafnaujsqabgyp', // nestly-prod (Frankfurt)
  'wnzwrkgnpvgincottwfm', // retired: the first nestly-prod
  'ncsxugphtawrwotimymp', // retired: the first nestly-preview
];

// The command without heredoc bodies that are only data — a commit message, a file being written. A body fed
// to an interpreter (bash, node, python…) is a script, so it is kept.
function commandText(command) {
  const lines = String(command).split('\n');
  const out = [];
  let delim = null;
  let keep = false;
  for (const line of lines) {
    if (delim !== null) {
      if (line.trim() === delim) delim = null;
      else if (keep) out.push(line);
      continue;
    }
    out.push(line);
    const m = /(?:^|[^<])<<-?\s*(?!<)['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(line);
    if (m) {
      delim = m[1];
      keep = /\b(bash|sh|zsh|node|python3?|perl|ruby|pwsh|powershell|deno|bun|eval|source)\b/i.test(line.slice(0, m.index + 1));
    }
  }
  return out.join('\n');
}

// An .env file named anywhere in a shell command — except a committed *.example template.
function namesEnvFile(command) {
  const text = fold(slash(commandText(command)));
  for (const m of text.matchAll(/(?:^|[\s"'=/<>|;&(`:])(\.env(?:\.[a-z0-9_-]+)*)(?=$|[\s"'`;|&)<>/])/g)) {
    if (!m[1].endsWith('.example')) return true;
  }
  return false;
}

// A block of the kind Afik is told about at once (logged as rule r4-critical).
const critical = (reason) => ({ reason, rule: 'r4-critical' });

function checkAll(tool, input, ctx) {
  if (tool !== 'Bash') return null;
  if (namesEnvFile(input.command)) {
    return critical('Shell commands do not touch .env files: they hold Afik\'s secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself.');
  }
  const text = fold(commandText(input.command));
  if (BLOCKED_REFS.some((ref) => text.includes(ref))) {
    return critical('nestly-prod (and the retired projects) are out of reach for agents. Production changes go through CI with Afik\'s approval.');
  }
  const calls = withCwd(shellSegments(input.command), ctx.cwd)
    .map(({ seg, cwd }) => {
      const call = gitCall(seg);
      return call && { ...call, cwd };
    })
    .filter(Boolean);

  for (const { sub, args } of calls) {
    if ((sub === 'add' || sub === 'stage') && addsEverything(args)) {
      return '`git add -A` and `git add .` are blocked. Stage the files by name.';
    }
    if (sub === 'push') {
      const force =
        args.some((a) => /^--(force|force-with-lease|force-if-includes|mirror|delete|prune)(=|$)/.test(a) || /^\+/.test(a) || /^:/.test(a)) ||
        hasShortFlag(args, 'f') || hasShortFlag(args, 'd');
      if (force) return critical('Force push, mirror push and remote deletes are blocked (decisions.md, 2026-10-11). Only Afik does these, by hand.');
    }
  }

  const commits = calls.filter((c) => c.sub === 'commit');
  if (commits.length) {
    if (calls.some((c) => ['add', 'stage', 'rm', 'mv', 'stash', 'apply', 'cherry-pick', 'restore', 'checkout'].includes(c.sub))) {
      return 'Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first.';
    }
    for (const c of commits) {
      const repo = c.dir ? abs(c.dir, c.cwd) : c.cwd;
      const reason = scanForSecrets(repo, commitTakesWorkingTree(c.args));
      if (reason) return reason;
    }
  }
  return null;
}

// Options of git commit that take a separate value.
const COMMIT_VALUE_OPTS = new Set(['-m', '-F', '-C', '-c', '-t', '--author', '--date', '--file', '--message', '--template',
  '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer', '-S', '--gpg-sign', '--pathspec-from-file']);

// Does this commit take content beyond the index — -a, --only, --include or a pathspec?
function commitTakesWorkingTree(args) {
  if (args.includes('--all') || hasShortFlag(args, 'a') || hasShortFlag(args, 'o') || hasShortFlag(args, 'i')) return true;
  if (args.some((a) => /^--(only|include|pathspec-from-file)(=|$)/.test(a))) return true;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') return k + 1 < args.length;
    if (/^\d?[<>]/.test(a)) continue;
    if (COMMIT_VALUE_OPTS.has(a)) {
      k++;
      continue;
    }
    if (/^-[A-Za-z]*[mFCct]$/.test(a)) {
      k++;
      continue;
    }
    if (!a.startsWith('-')) return true;
  }
  return false;
}

// Pieces are concatenated so this file does not match its own patterns.
const SECRET_PATTERNS = [
  ['a private key', new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY( BLOCK)?-----')],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['a Supabase secret key', new RegExp('\\bsb_' + 'secret_[A-Za-z0-9_-]{10,}')],
  ['a GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a Google API key', new RegExp('\\bAIza' + '[0-9A-Za-z_-]{35}')],
  ['an Anthropic API key', new RegExp('\\bsk-' + 'ant-[A-Za-z0-9_-]{20,}')],
  ['an OpenAI API key', new RegExp('\\bsk-' + '(proj-)?[A-Za-z0-9_-]{32,}')],
  ['a Slack token', new RegExp('\\bxox' + '[baprs]-[A-Za-z0-9-]{10,}')],
  ['a Stripe live key', new RegExp('\\b[rs]k_' + 'live_[A-Za-z0-9]{16,}')],
  ['a database URL with a password', /\bpostgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]+)@/],
];

const PLACEHOLDER = /^(password|pass|postgres|\*+|x+)$|^your-|[<[${]/i;

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
}

function hasHead(repo) {
  try {
    git(repo, ['rev-parse', '--verify', '-q', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function scanForSecrets(repo, workingTree) {
  const bases = [['diff', '--cached']];
  if (workingTree && hasHead(repo)) bases.push(['diff', 'HEAD']);
  for (const base of bases) {
    let names;
    let diff;
    try {
      names = git(repo, [...base, '--name-only', '--no-ext-diff']).split('\n').filter(Boolean);
      diff = git(repo, [...base, '--no-color', '--no-ext-diff', '-U0']);
    } catch {
      return 'Could not read the staged diff to check it for secrets, so the commit is blocked.';
    }
    for (const n of names) {
      const b = path.posix.basename(slash(n));
      if (/^\.env(rc|\..+)?$/.test(b) && !b.endsWith('.example')) return critical(`A .env file is staged (${n}). It must never be committed.`);
    }
    let header = false;
    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        header = true;
        continue;
      }
      if (line.startsWith('@@')) {
        header = false;
        continue;
      }
      if (header || !line.startsWith('+')) continue;
      for (const [what, re] of SECRET_PATTERNS) {
        const m = re.exec(line);
        if (!m) continue;
        if (what === 'a database URL with a password' && PLACEHOLDER.test(m[1])) continue;
        return critical(`The changes being committed contain what looks like ${what}. Remove it, and rotate it if it is real. The repo is public.`);
      }
    }
  }
  return null;
}

// ---------- rules: CRITIC and TEST ENGINEER (reading) ----------

// A path as the project sees it, two ways: as written, and with symlinks resolved (the longest existing prefix is
// resolved by the file system, the rest is kept). A rule must hold for both.
function realAbs(p) {
  const tail = [];
  let head = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return p;
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

function relBoth(p, ctx) {
  const a = abs(p, ctx.cwd);
  return [fold(slash(path.relative(ctx.root, a))), fold(slash(path.relative(realAbs(ctx.root), realAbs(a))))];
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Read, Grep and Glob of CRITIC (R1) and TEST ENGINEER (R1, R2) are judged by path alone.
function checkReadPath(role, tool, input, ctx) {
  const te = role === 'test-engineer';
  const who = te ? 'TEST ENGINEER' : 'CRITIC';
  const NO_IMPL = 'TEST ENGINEER does not read apps/*/src or apps/*/api. Test from the spec; packages/shared is the contract.';

  if (tool === 'Read' || tool === 'NotebookRead') {
    const forms = relBoth(input.file_path || input.notebook_path || '', ctx);
    if (forms.some(isNotes)) return `${who} does not read notes.md (the builder's own account).`;
    if (te && forms.some(isAppImpl)) return NO_IMPL;
    return null;
  }

  if (tool === 'Glob' && !te) return null; // file names only
  if (tool !== 'Grep' && tool !== 'Glob') return null;

  let target = abs(input.path || '.', ctx.cwd);
  if (tool === 'Glob' && input.pattern) {
    const prefix = literalPrefix(input.pattern);
    if (prefix) target = path.resolve(target, fromGitBash(prefix));
  }
  const forms = relBoth(target, ctx);
  if (te && forms.some(reachesAppImpl)) {
    return 'TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>.';
  }
  if (tool === 'Grep') {
    if (forms.some(isNotes)) return `${who} does not read notes.md.`;
    if (isFile(realAbs(target))) return null; // one existing file that is not a notes file
    // .work in any case: some file systems ignore case
    if (forms.some((r) => reaches(r.toLowerCase(), '.work') || isInside(r.toLowerCase(), '.work')) && !grepExcludesNotes(input)) {
      return `${who} does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path.`;
    }
  }
  return null;
}

const EDIT_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

// CRITIC has no shell (F6: a backstop beside the tools list) and writes only its findings.
const FINDINGS_FILE = /^\.work\/[^/]+\/([^/]+-)?findings\.md$/;

function checkCritic(tool, input, ctx) {
  if (tool === 'Bash') return 'CRITIC has no shell. Read .work/<slug>/review.diff (ORCHESTRATOR prepares it with node tools/critic-diff.mjs <slug>).';
  if (EDIT_TOOLS.includes(tool)) {
    const forms = relBoth(input.file_path || input.notebook_path || '', ctx);
    if (!forms.every((r) => FINDINGS_FILE.test(r))) return 'CRITIC writes only .work/<slug>/findings.md (or .work/<slug>/*-findings.md).';
    return null;
  }
  return checkReadPath('critic', tool, input, ctx);
}

// TEST ENGINEER writes tests and its own .work/<slug>/*.md — never an npm or tool config. The Bash allowlist below
// runs only explicit test files, and this rule is what keeps a config from changing what they do.
const TOOL_CONFIG = /^(package(-lock)?\.json|\.npmrc|tsconfig[^/]*\.json|(vitest|playwright)\.[^/]*|[^/]*\.config\.[^/]*)$/i;

function testEngineerMayWrite(r) {
  if (isAppImpl(r) || isNotes(r) || TOOL_CONFIG.test(path.posix.basename(r))) return false;
  return isTestPath(r) || /^\.work\/[^/]+\/[^/]+\.md$/.test(r);
}

// TEST ENGINEER's one shell use: a single test run on explicit files (round 4).
const RUNNERS = {
  vitest: {
    head: ['npx', 'vitest', 'run'],
    flags: [/^--reporter=(default|verbose|dot)$/, /^--bail=\d+$/, /^--no-color$/, /^--testNamePattern=.+$/],
  },
  playwright: {
    head: ['npx', 'playwright', 'test'],
    flags: [/^--project=.+$/, /^--grep=.+$/, /^--reporter=(list|line|dot)$/, /^--workers=\d+$/],
  },
  node: {
    head: ['node', '--test'],
    flags: [/^--test-name-pattern=.+$/, /^--test-reporter=(spec|dot|tap)$/],
  },
};

const BASH_FORMS =
  'TEST ENGINEER runs one test command at the project root, nothing else: `npx vitest run <files>`, `npx playwright test <files>` or `node --test <files>`. ' +
  'Files are explicit relative paths of existing *.test.* / *.spec.* files outside apps/*/src and apps/*/api; no globs, quotes, pipes, `cd` or variables. ' +
  'Flags (--name=value only): vitest --reporter=default|verbose|dot --bail=N --no-color --testNamePattern=X; playwright --project=X --grep=X --reporter=list|line|dot --workers=N; node --test-name-pattern=X --test-reporter=spec|dot|tap.';

function checkTestEngineerBash(command, ctx) {
  const s = String(command);
  if (!/^[A-Za-z0-9._/:=@+ -]+$/.test(s)) return BASH_FORMS;
  const tokens = s.split(' ').filter(Boolean);
  const runner = Object.values(RUNNERS).find((r) => r.head.every((t, i) => tokens[i] === t));
  if (!runner) return BASH_FORMS;
  if (realAbs(ctx.cwd) !== realAbs(ctx.root)) return `${BASH_FORMS} (the working directory is not the project root)`;
  const files = [];
  for (const t of tokens.slice(runner.head.length)) {
    if (t.startsWith('-')) {
      if (!runner.flags.some((re) => re.test(t))) return BASH_FORMS;
    } else {
      files.push(t);
    }
  }
  if (!files.length) return BASH_FORMS;
  for (const f of files) {
    if (path.isAbsolute(f) || /^[A-Za-z]:/.test(f) || f.split('/').includes('..') || !TEST_FILE.test(f)) return BASH_FORMS;
    const full = abs(f, ctx.root);
    if (!isFile(full)) return BASH_FORMS;
    if (relBoth(full, ctx).some((r) => isAppImpl(r) || isNotes(r))) {
      return 'TEST ENGINEER does not read apps/*/src or apps/*/api, nor run files that resolve there.';
    }
  }
  return null;
}

function checkTestEngineer(tool, input, ctx) {
  if (tool === 'Bash') return checkTestEngineerBash(input.command, ctx);
  if (EDIT_TOOLS.includes(tool)) {
    const forms = relBoth(input.file_path || input.notebook_path || '', ctx);
    if (!forms.every(testEngineerMayWrite)) {
      return 'TEST ENGINEER writes only test files (apps/*/tests, packages/*/tests, e2e, supabase/tests, *.test.* / *.spec.*) and .work/<slug>/*.md — never package.json, .npmrc, tsconfig or tool configs, nor notes.md.';
    }
    return null;
  }
  return checkReadPath('test-engineer', tool, input, ctx);
}

// True only if the Grep call cannot search notes.md. ripgrep treats a glob without a slash
// as a file-name match, a leading `!` as an exclusion, and several patterns as a union.
function grepExcludesNotes(input) {
  if (input.type) return !['md', 'markdown', 'all'].includes(String(input.type).toLowerCase());
  if (!input.glob) return false;
  const patterns = splitGlobs(String(input.glob)).filter((p) => !p.startsWith('!'));
  if (!patterns.length) return false;
  try {
    return patterns.every((p) => {
      const last = p.split('/').pop() || p;
      return !['notes.md', 'a/notes.md', '.work/a/notes.md'].some((t) => path.matchesGlob(t, p)) &&
        !path.matchesGlob('notes.md', last);
    });
  } catch {
    return false;
  }
}

// Splits on whitespace, and on commas outside braces.
function splitGlobs(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const c of s) {
    if (c === '{') depth++;
    if (c === '}') depth = Math.max(0, depth - 1);
    if (/\s/.test(c) || (c === ',' && depth === 0)) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- rules: BUILDER (writing) ----------

const WRITE_VERB =
  /^(tee|cp|mv|rm|rmdir|touch|mkdir|ln|dd|patch|unzip|tar|install|rsync|xcopy|robocopy|copy|move|del|erase|ren|ni|curl|wget|set-content|add-content|out-file|new-item|remove-item|copy-item|move-item|rename-item|truncate)$/i;
const RUNS_TESTS = /\b(vitest|jest|playwright)\b|\bnpm\s+(t|test|run\s+test[\w:-]*)\b/i;

function checkBuilder(tool, input, ctx) {
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const r = rel(input.file_path || input.notebook_path || '', ctx.root, ctx.cwd);
    if (isTestPath(r)) return 'BUILDER does not write tests. Test files belong to TEST ENGINEER.';
    return null;
  }
  if (tool !== 'Bash') return null;

  const raw = String(input.command || '');
  let cwd = ctx.cwd;
  for (const seg of shellSegments(raw)) {
    if (RUNS_TESTS.test(seg.join(' ')) && seg.some((a) => /^(-u|--update[\w-]*)(=.*)?$/.test(a))) {
      return 'BUILDER does not update test snapshots. Snapshots belong to TEST ENGINEER.';
    }
    const name = path.posix.basename(slash(seg[0] || '')).toLowerCase().replace(/\.exe$/, '');
    if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(name) && seg[1]) {
      cwd = abs(seg[1], cwd);
      continue;
    }
    const here = rel('.', ctx.root, cwd);
    const targets = [];
    // Redirections: > >> 1> 2> &> >| — the next token, or the rest of the same token.
    for (let k = 0; k < seg.length; k++) {
      // The redirection may sit anywhere in the token: `echo x>file` is one token.
      const m = /(?:^|[^<>&\d=-])(?:\d|&)?>>?\|?(.*)$/.exec(seg[k]);
      if (!m || m[1].startsWith('&')) continue;
      const t = m[1] || seg[k + 1];
      if (t) targets.push(t);
    }
    for (const t of targets) {
      if (isTestPath(rel(t, ctx.root, cwd))) return 'BUILDER does not write tests. Test files belong to TEST ENGINEER.';
    }
    const writes =
      WRITE_VERB.test(name) ||
      (name === 'sed' && seg.some((a) => /^(-[a-z]*i|--in-place)/.test(a))) ||
      (['node', 'python', 'python3', 'perl', 'ruby', 'deno', 'bun'].includes(name) && seg.some((a) => /^-(e|c|p|-eval|-print)$/.test(a))) ||
      (name === 'git' && seg.some((a) => ['checkout', 'restore', 'rm', 'mv', 'apply', 'stash', 'clean'].includes(a))) ||
      (name === 'git' && seg.includes('reset') && seg.includes('--hard'));
    if (!writes) continue;
    if (isTestPath(here)) return 'BUILDER does not change files inside a test folder.';
    const text = fold(slash(seg.join(' ')));
    if (/(^|[\s"'=/:])(apps\/[^/\s]+\/tests|packages\/[^/\s]+\/tests|e2e|supabase\/tests)(\/|\s|["']|$)/.test(text) ||
        /\.(test|spec)\.[cm]?[jt]sx?\b/.test(text) ||
        seg.slice(1).some((a) => !a.startsWith('-') && isTestPath(rel(a, ctx.root, cwd)))) {
      return 'BUILDER does not change test files from the shell. Test files belong to TEST ENGINEER.';
    }
  }
  return null;
}

// ---------- main ----------


const defaultRule = (role) => (role === 'builder' ? 'builder' : role === 'all' ? 'r4' : 'reader');

// A verdict is null (allowed), or { reason, rule }.
function check(role, tool, input, ctx) {
  const v = checkRole(role, tool, input, ctx);
  if (!v) return null;
  return typeof v === 'string' ? { reason: v, rule: defaultRule(role) } : v;
}

function checkRole(role, tool, input, ctx) {
  if (typeof input.command !== 'undefined' && typeof input.command !== 'string') return 'malformed command';
  if (typeof input.command === 'string' && input.command.length > MAX_COMMAND) {
    return `command longer than ${MAX_COMMAND} characters; too long to check. Split it.`;
  }
  if (role === 'all') return checkAll(tool, input, ctx);
  if (role === 'critic') return checkCritic(tool, input, ctx);
  if (role === 'test-engineer') return checkTestEngineer(tool, input, ctx);
  if (role === 'builder') return checkBuilder(tool, input, ctx);
  return `unknown role ${role}`;
}

// A line in incidents.md, for Afik. The reason only, never the command.
function escalate(root, role, tool, reason) {
  try {
    const file = path.join(root, 'incidents.md');
    if (!fs.existsSync(file)) return;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const line = `${stamp} | hook blocked ${tool} (${role}): ${String(reason).replace(/\s+/g, ' ')} | the call did not run | state: contained | ORCHESTRATOR reports to Afik\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    // The block stands even when it cannot be logged.
  }
}

// Every block goes to the local log. incidents.md gets a line only for r4-critical, and for the third reader block
// of one role in one session (the count includes this block, so it is exactly 3 once).
function report(root, session, role, tool, v) {
  let reader = 0;
  try {
    const dir = path.join(root, '.claude', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'blocks.jsonl');
    const entry = { time: new Date().toISOString(), role, tool, rule: v.rule, reason: String(v.reason).replace(/\s+/g, ' '), session };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    if (v.rule === 'reader') {
      for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
        try {
          const e = JSON.parse(l);
          if (e.rule === 'reader' && e.role === role && e.session === session) reader++;
        } catch {
          // a damaged line counts for nothing
        }
      }
    }
  } catch {
    // The block stands even when it cannot be logged.
  }
  if (v.rule === 'r4-critical') escalate(root, role, tool, v.reason);
  else if (reader === 3) escalate(root, role, tool, `third reader block by ${role} in one session (the fence is being probed): ${v.reason}`);
}

function block(v, root, session, role, tool) {
  if (root) report(root, session, role, tool, v);
  process.stderr.write(`Blocked by .claude/hooks/guard.js: ${v.reason}\n`);
  process.exit(2);
}

function main() {
  let role = process.argv[2];
  if (!ROLES.has(role)) return block({ reason: `unknown role "${role}"`, rule: 'reader' });
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return block({ reason: 'could not parse the hook input', rule: defaultRule(role) });
  }
  if (!data || typeof data.tool_name !== 'string' || !data.tool_input || typeof data.tool_input !== 'object') {
    return block({ reason: 'malformed hook input', rule: defaultRule(role) });
  }
  let root = null;
  let verdict;
  try {
    if (typeof data.cwd !== 'undefined' && typeof data.cwd !== 'string') throw new Error('malformed cwd');
    root = path.resolve(process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd());
    const cwd = path.resolve(data.cwd || root);
    // The settings hook (role "all") also applies the calling agent's own rules, named by
    // agent_type — so a role is enforced even where frontmatter hooks do not run.
    const roles = [role];
    const agent = typeof data.agent_type === 'string' ? data.agent_type.toLowerCase() : '';
    if (role === 'all' && ROLES.has(agent) && agent !== 'all') roles.push(agent);
    for (const r of roles) {
      verdict = check(r, data.tool_name, data.tool_input, { root, cwd });
      if (verdict) {
        role = r;
        break;
      }
    }
  } catch (e) {
    verdict = { reason: `guard error (${e && e.message ? e.message : 'unknown'})`, rule: defaultRule(role) };
  }
  // Both layers run inside a role's agent: its frontmatter hook and the settings hook. The
  // settings hook logs the block; the frontmatter one stays quiet when agent_type says the
  // settings hook has seen the same call, so a block is reported once.
  const agentType = data && typeof data.agent_type === 'string' ? data.agent_type.toLowerCase() : '';
  const loggedElsewhere = process.argv[2] !== 'all' && agentType === process.argv[2];
  const session = typeof data.session_id === 'string' ? data.session_id : '';
  if (verdict) return block(verdict, loggedElsewhere ? null : root, session, role, data.tool_name);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { main, shellSegments, gitCall, literalPrefix, rel, commitTakesWorkingTree, grepExcludesNotes };
