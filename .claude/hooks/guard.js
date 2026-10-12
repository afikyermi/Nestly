#!/usr/bin/env node
// PreToolUse guard — WORKPLAN 7.2, decisions.md (2026-10-11, "hooks (7.2)").
//
// Usage: node guard.js <role>   role: all | critic | test-engineer | builder
//   all            — wired in .claude/settings.json; runs for every agent, subagents included.
//   critic, test-engineer, builder — wired in that agent's frontmatter; runs only inside it.
//
// Reads the hook JSON on stdin. Exit 0 lets the tool call run; exit 2 blocks it and the
// reason on stderr goes back to the agent. Any other exit code would let the call through,
// so the guard fails closed: bad input, an unknown role, a command too long to check or any
// error inside the guard exits 2. A block is appended to incidents.md (CLAUDE.md: "a hook
// blocked an action" is always reported) — the reason only, never the command, which may
// hold a secret.
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

// r is the directory dir itself, or one of its ancestors (so a search there reaches into dir).
function reaches(r, dir) {
  return r === '' || isInside(dir, r);
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
  return isAppImpl(r) || r === '' || r === 'apps' || /^apps\/[^/]+$/.test(r);
}

function isTestPath(r) {
  return TEST_AREAS.some((re) => re.test(r)) || TEST_FILE.test(r);
}

const NOTES_NAME = /^(notes\.md\.*|notes~\d+\.md)$/i;

function isNotes(r) {
  return NOTES_NAME.test(path.posix.basename(r));
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

function checkAll(tool, input, ctx) {
  if (tool !== 'Bash') return null;
  if (namesEnvFile(input.command)) {
    return 'Shell commands do not touch .env files: they hold Afik\'s secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself.';
  }
  const text = fold(commandText(input.command));
  if (BLOCKED_REFS.some((ref) => text.includes(ref))) {
    return 'nestly-prod (and the retired projects) are out of reach for agents. Production changes go through CI with Afik\'s approval.';
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
      if (force) return 'Force push, mirror push and remote deletes are blocked (decisions.md, 2026-10-11). Only Afik does these, by hand.';
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
      if (/^\.env(rc|\..+)?$/.test(b) && !b.endsWith('.example')) return `A .env file is staged (${n}). It must never be committed.`;
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
        return `The changes being committed contain what looks like ${what}. Remove it, and rotate it if it is real. The repo is public.`;
      }
    }
  }
  return null;
}

// ---------- rules: CRITIC and TEST ENGINEER (reading) ----------

// A shell segment that reads files recursively.
function recursiveSearch(seg) {
  const name = path.posix.basename(slash(seg[0] || '')).toLowerCase().replace(/\.exe$/, '');
  const rest = seg.slice(1);
  if (['grep', 'egrep', 'fgrep'].includes(name)) {
    return rest.some((a) => /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a) || /^--(recursive|dereference-recursive)$/.test(a));
  }
  if (['rg', 'ag', 'ack', 'xargs', 'select-string', 'sls'].includes(name)) return true;
  if (name === 'findstr') return rest.some((a) => /^\/s$/i.test(a));
  if (name === 'find') return rest.some((a) => /^-(exec|execdir|ok|fprint)/.test(a));
  return false;
}

// Exclusion pathspecs (":(exclude)…", ":!…", ":^…") are what keeps notes.md out; they are not a read of it.
function withoutExclusions(s) {
  return s.replace(/['"]?:(\(exclude[^)]*\)|!|\^)[^\s'"]*['"]?/g, '');
}

const GIT_READS_CONTENT = new Set(['diff', 'diff-tree', 'diff-index', 'diff-files', 'range-diff', 'show', 'blame', 'annotate',
  'grep', 'difftool', 'format-patch', 'whatchanged', 'cat-file', 'archive']);

// Flags that make log, reflog or stash print patches.
function showsPatch(args) {
  return args.some((a) =>
    /^-[A-Za-z0-9]*[pu][A-Za-z0-9]*$/.test(a) || /^-[cLGS]/.test(a) ||
    /^--(patch|cc|combined|full-diff|word-diff|color-words|binary|raw)/.test(a));
}

function gitReadsContent({ sub, args }) {
  return GIT_READS_CONTENT.has(sub) ||
    (['log', 'reflog'].includes(sub) && showsPatch(args)) ||
    (sub === 'stash' && args.includes('show'));
}

// Exclusion pathspecs that cover every .work/<slug>/notes.md. Without the glob magic a
// pathspec wildcard crosses '/', so '*notes.md' covers them; with it, it does not.
const COVERS_NOTES = new Set(['.work', '.work/', '.work/*', '.work/**', '.work/*/notes.md', '.work/**/notes.md', '**/notes.md']);
const COVERS_NOTES_LITERAL = new Set([...COVERS_NOTES, '*notes.md', '*/notes.md']);

// A git read whose pathspec excludes all of .work, or every notes.md, cannot show notes.md.
function excludesNotes(args) {
  return args.some((a) => {
    const m = /^:(?:\(([^)]*)\)|([!^]))(.*)$/.exec(a);
    if (!m) return false;
    const magic = (m[1] || '').toLowerCase().split(',').map((s) => s.trim());
    if (!m[2] && !magic.includes('exclude')) return false;
    const spec = fold(slash(m[3]));
    return (magic.includes('glob') ? COVERS_NOTES : COVERS_NOTES_LITERAL).has(spec);
  });
}

function checkReader(role, tool, input, ctx) {
  const te = role === 'test-engineer';
  const who = te ? 'TEST ENGINEER' : 'CRITIC';

  if (tool === 'Read' || tool === 'NotebookRead') {
    const r = rel(input.file_path || input.notebook_path || '', ctx.root, ctx.cwd);
    if (isNotes(r)) return `${who} does not read notes.md (the builder's own account).`;
    if (te && isAppImpl(r)) return 'TEST ENGINEER does not read apps/*/src or apps/*/api. Test from the spec; packages/shared is the contract.';
    return null;
  }

  if (tool === 'Grep' || tool === 'Glob') {
    let scope = rel(input.path || '.', ctx.root, ctx.cwd);
    if (tool === 'Glob' && input.pattern) {
      const prefix = literalPrefix(input.pattern);
      if (prefix) scope = rel(path.posix.join(scope === '' ? '.' : scope, prefix), ctx.root, ctx.root);
    }
    if (te && reachesAppImpl(scope)) {
      return 'TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>.';
    }
    if (tool === 'Grep') {
      if (isNotes(scope)) return `${who} does not read notes.md.`;
      if (reaches(scope, '.work') || isInside(scope, '.work')) {
        if (!grepExcludesNotes(input)) {
          return `${who} does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path.`;
        }
      }
    }
    return null;
  }

  if (tool === 'Bash') {
    const raw = String(input.command || '');
    const segments = shellSegments(raw);
    const flat = fold(slash(segments.map((s) => s.join(' ')).join('\n')));
    const both = withoutExclusions(fold(slash(raw)) + '\n' + flat);
    if (/notes\.md|notes~\d/.test(both)) return `${who} does not read notes.md.`;
    if (/\.work\/[^\s"']*[*?[{]/.test(both)) return `${who}: name the .work/ files you read; a wildcard there could reach notes.md.`;

    const located = withCwd(segments, ctx.cwd);
    for (const { seg, cwd } of located) {
      if (CD.includes(commandName(seg)) && seg[1]) {
        const target = rel(seg[1], ctx.root, cwd);
        if (isInside(target, '.work')) return `${who}: do not cd into .work/; name the files you read.`;
        if (te && (target === 'apps' || /^apps\/[^/]+$/.test(target) || isAppImpl(target))) {
          return 'TEST ENGINEER does not cd into an app. Use apps/<app>/tests paths from the root.';
        }
      }
    }

    for (const call of segments.map(gitCall).filter(Boolean)) {
      if (!gitReadsContent(call)) continue;
      if (te) return 'TEST ENGINEER does not read the implementation through git (diff, show, log -p, blame, grep).';
      if (!excludesNotes(call.args)) {
        return "CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`.";
      }
    }

    for (const seg of segments) {
      if (!recursiveSearch(seg)) continue;
      if (te) return 'TEST ENGINEER does not search recursively from the shell. Use the Grep tool with an allowed path.';
      return 'CRITIC does not search recursively from the shell (it could reach notes.md). Use the Grep tool with a glob or type.';
    }

    if (te) {
      const NO_IMPL = 'TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths.';
      // Every path-like argument, resolved where it runs; a glob is judged by where it starts.
      for (const { seg, cwd } of located) {
        for (const raw of seg.slice(1)) {
          // Parameter expansions are removed first ($?, $X, ${E}): their `?` is not a glob, and an unset one
          // expands to nothing, so what is left is what the shell reads. The left-over is then checked in full.
          const a = raw.replace(/\$(\{[^}]*\}|[?#@*!$0-9-]|\w+)/g, '');
          if (!a || a.startsWith('-') || /^[a-z]+:\/\//i.test(a)) continue;
          const glob = /[*?[\]{}]/.test(a);
          const r = rel(glob ? literalPrefix(a) || '.' : a, ctx.root, cwd);
          if (isAppImpl(r) || (glob && reachesAppImpl(r))) return NO_IMPL;
        }
      }
      // Paths inside strings (node -e "...") and other spellings, normalised.
      for (const m of both.matchAll(/apps\/[^\s"'`;|&()]+/g)) {
        const p = path.posix.normalize(m[0]);
        if (isAppImpl(p) || /^apps\/[^/]+\/[^/]*[*?[\]{}]/.test(p)) return NO_IMPL;
      }
    }
    return null;
  }
  return null;
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

function check(role, tool, input, ctx) {
  if (typeof input.command !== 'undefined' && typeof input.command !== 'string') return 'malformed command';
  if (typeof input.command === 'string' && input.command.length > MAX_COMMAND) {
    return `command longer than ${MAX_COMMAND} characters; too long to check. Split it.`;
  }
  if (role === 'all') return checkAll(tool, input, ctx);
  if (role === 'critic' || role === 'test-engineer') return checkReader(role, tool, input, ctx);
  if (role === 'builder') return checkBuilder(tool, input, ctx);
  return `unknown role ${role}`;
}

function report(root, role, tool, reason) {
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

// The hook input of the call being judged, for the situation room's Block line. Set in main().
let current = null;

// The reason with anything variable removed: a staged file's name, an unknown role's name, an error's text.
function scrubReason(reason) {
  const r = String(reason);
  if (r.startsWith('A .env file is staged')) return 'A .env file is staged. It must never be committed.';
  if (r.startsWith('unknown role')) return 'unknown role';
  if (r.startsWith('guard error')) return 'guard error';
  return r.replace(/\s+/g, ' ');
}

// One Block line in the situation room's log (decisions.md, "Situation room"). Observes only: the logger is required
// lazily inside the try, so a missing or broken logger can never crash the guard, and nothing here changes the exit
// code or the message.
function live(root, role, tool, reason) {
  try {
    const log = require('./situation-log.js');
    const h = current || {};
    const who = typeof h.agent_type === 'string' && h.agent_type ? h.agent_type.toLowerCase() : 'ORCHESTRATOR';
    log.writeEvent(
      {
        ev: 'Block',
        sid: typeof h.session_id === 'string' ? h.session_id : undefined,
        aid: typeof h.agent_id === 'string' ? h.agent_id : undefined,
        who,
        branch: log.branch(root),
        role,
        tool,
        id: typeof h.tool_use_id === 'string' ? h.tool_use_id : undefined,
        reason: scrubReason(reason),
      },
      root,
    );
  } catch {
    // The block stands even when the room cannot be told.
  }
}

function block(reason, root, role, tool) {
  if (root) {
    report(root, role, tool, reason);
    live(root, role, tool, reason);
  }
  process.stderr.write(`Blocked by .claude/hooks/guard.js: ${reason}\n`);
  process.exit(2);
}

function main() {
  let role = process.argv[2];
  if (!ROLES.has(role)) return block(`unknown role "${role}"`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return block('could not parse the hook input');
  }
  if (!data || typeof data.tool_name !== 'string' || !data.tool_input || typeof data.tool_input !== 'object') {
    return block('malformed hook input');
  }
  current = data;
  let root = null;
  let reason;
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
      reason = check(r, data.tool_name, data.tool_input, { root, cwd });
      if (reason) {
        role = r;
        break;
      }
    }
  } catch (e) {
    reason = `guard error (${e && e.message ? e.message : 'unknown'})`;
  }
  // Both layers run inside a role's agent: its frontmatter hook and the settings hook. The
  // settings hook logs the block; the frontmatter one stays quiet when agent_type says the
  // settings hook has seen the same call, so a block is reported once.
  const agentType = data && typeof data.agent_type === 'string' ? data.agent_type.toLowerCase() : '';
  const loggedElsewhere = process.argv[2] !== 'all' && agentType === process.argv[2];
  if (reason) return block(reason, loggedElsewhere ? null : root, role, data.tool_name);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { shellSegments, gitCall, literalPrefix, rel, commitTakesWorkingTree, grepExcludesNotes, scrubReason };
