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
// CI stay behind it. The one exception to "patterns" is the reading rules of CRITIC and TEST
// ENGINEER: there an allowlist is the base (a call that could reach the protected file is
// blocked unless it matches an allowed form) and the specific messages only give the reason.

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
// Case-insensitive on every platform: macOS and Windows file systems ignore case by default (G.17).
const APP_IMPL = /^apps\/[^/]+\/(src|api)(\/|$)/i;
const TEST_AREAS = [/^apps\/[^/]+\/tests(\/|$)/, /^packages\/[^/]+\/tests(\/|$)/, /^e2e(\/|$)/, /^supabase\/tests(\/|$)/];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// apps/ itself, or one app's directory.
function isAppsDir(r) {
  return /^apps(\/[^/]+)?$/i.test(r);
}

function isAppImpl(r) {
  return APP_IMPL.test(r);
}

// A search rooted at r reaches app implementation.
function reachesAppImpl(r) {
  return isAppImpl(r) || r === '' || isAppsDir(r);
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
// -Command, cmd /c — are parsed too, and their segments added (flagged `nested`). Each
// segment also carries `pat` — its tokens with every quoted or escaped glob character
// backslash-escaped, so what the shell would expand can be told from literal text — and
// `before` / `after`, the separators on either side of it.
function shellSegments(command, depth = 0) {
  const src = dropHeredocs(command);
  const segments = [];
  let tokens = [];
  let pats = [];
  let cur = '';
  let pat = '';
  let has = false;
  let quote = null;
  let before = '';
  const lit = (ch) => (/[*?[\]{}\\]/.test(ch) ? '\\' + ch : ch);
  const pushToken = () => {
    if (has) {
      tokens.push(cur);
      pats.push(pat);
    }
    cur = '';
    pat = '';
    has = false;
  };
  const pushSegment = (sep = '') => {
    pushToken();
    if (tokens.length) {
      tokens.pat = pats;
      tokens.before = before;
      tokens.after = sep;
      segments.push(tokens);
      before = sep;
    } else if (sep !== '\n') {
      before = sep;
    }
    tokens = [];
    pats = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < src.length) {
        cur += src[++i];
        pat += lit(src[i]);
      } else {
        cur += c;
        pat += lit(c);
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
      cur += src[++i];
      pat += lit(src[i]);
      has = true;
    } else if (c === '|' && src[i - 1] === '>') {
      cur += c; // `>|` is a redirection, not a pipe
      pat += c;
      has = true;
    } else if (c === '&' && (src[i - 1] === '>' || src[i - 1] === '<' || src[i + 1] === '>')) {
      cur += c; // `2>&1`, `<&3` and `&>file` are redirections, not a background separator
      pat += c;
      has = true;
    } else if ('|;&()`\n'.includes(c)) {
      const twice = (c === '&' || c === '|') && src[i + 1] === c;
      if (twice) i++;
      pushSegment(twice ? c + c : c);
    } else if (/\s/.test(c)) {
      pushToken();
    } else if (c === '$' && /[?*]/.test(src[i + 1] || '')) {
      cur += c + src[++i]; // $? and $* cannot name a path: not a glob
      pat += c + lit(src[i]);
      has = true;
    } else {
      cur += c;
      pat += c;
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
  for (const n of nested) n.nested = true;
  return segments.concat(nested);
}

// For a segment that runs git: the subcommand, what follows it, a -C directory if given, and the global options
// before the subcommand.
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
  return { sub: seg[j], args: seg.slice(j + 1), dir, globals: seg.slice(i + 1, j) };
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
// to an interpreter (bash, node, python…) is a script, so it is kept. With mode 'expanding' the body of a heredoc
// whose delimiter is not quoted is kept too: the shell expands $(…) in it.
function commandText(command, mode = '') {
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
    const m = /(?:^|[^<])<<-?\s*(?!<)(['"]?)([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(line);
    if (m) {
      delim = m[2];
      keep = /\b(bash|sh|zsh|node|python3?|perl|ruby|pwsh|powershell|deno|bun|eval|source)\b/i.test(line.slice(0, m.index + 1)) ||
        (mode === 'expanding' && !m[1]);
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
  if (['rg', 'ag', 'ack', 'select-string', 'sls'].includes(name)) return true;
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
    /^-[A-Za-z0-9]*[pu][A-Za-z0-9]*$/.test(a) || /^-[cLGSU]/.test(a) ||
    /^--(patch|cc|combined|full-diff|word-diff|color-words|binary|raw|unified|remerge-diff)/.test(a));
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
    const spec = slash(m[3]); // git matches pathspecs case-sensitively, on every platform
    return (magic.includes('glob') ? COVERS_NOTES : COVERS_NOTES_LITERAL).has(spec);
  });
}

// ---- the allowlist: what a call may be, whatever it is spelled like ----

// The path with every symlink in it resolved and `..` read after the link — what the kernel opens. A part that does
// not exist is kept as written.
function physical(p, depth = 0) {
  const { root } = path.parse(p);
  let cur = root;
  for (const part of p.slice(root.length).split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') {
      cur = path.dirname(cur);
      continue;
    }
    const next = path.join(cur, part);
    let link = null;
    try {
      if (depth < 16 && fs.lstatSync(next).isSymbolicLink()) link = fs.readlinkSync(next);
    } catch {
      // not there: it stays as written
    }
    cur = link === null ? next : physical(path.resolve(cur, link), depth + 1);
  }
  return cur;
}

// Like rel(), but through symlinks.
function relReal(p, root, cwd) {
  return fold(slash(path.relative(physical(root), physical(abs(p, cwd)))));
}

function inWork(r) {
  return isInside(r.toLowerCase(), '.work');
}

// A glob character the shell would expand: * ? [..] and a brace list or range. Quoted ones are escaped in `pat`.
const WILD = /[*?]|\[[^\]]+\]|\{[^{}]*(,|\.\.)[^{}]*\}/;
const unescape = (s) => s.replace(/\\(.)/g, '$1');
const isWild = (pat) => WILD.test(pat.replace(/\\./g, ''));
const wildSeg = (seg) => /[*?[{]/.test(seg.replace(/\\./g, ''));

// {a,b} -> a, b (nested too). A brace without a comma is literal.
function expandBraces(s, out = []) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
    } else if (s[i] === '{') {
      if (depth++ === 0) start = i;
    } else if (s[i] === '}' && depth > 0 && --depth === 0) {
      const parts = [];
      let d = 0;
      let from = start + 1;
      for (let k = start + 1; k < i; k++) {
        if (s[k] === '\\') k++;
        else if (s[k] === '{') d++;
        else if (s[k] === '}') d--;
        else if (s[k] === ',' && d === 0) {
          parts.push(s.slice(from, k));
          from = k + 1;
        }
      }
      parts.push(s.slice(from, i));
      if (parts.length > 1 && out.length < 256) {
        for (const p of parts) expandBraces(s.slice(0, start) + p + s.slice(i + 1), out);
        return out;
      }
    }
  }
  out.push(s);
  return out;
}

// Does the glob segment match this name? Like bash: a leading * ? [ does not match a leading dot.
function segMatches(seg, name) {
  let re = /[*?[]/.test(seg[0] || '') ? '(?!\\.)' : '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    const close = c === '[' ? seg.indexOf(']', i + 2) : -1;
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (close > 0) {
      re += '[' + seg.slice(i + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']';
      i = close;
    } else if (c === '\\' && i + 1 < seg.length) re += seg[++i].replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    else re += c.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
  }
  try {
    return new RegExp('^' + re + '$', 'i').test(name);
  } catch {
    return true; // a pattern that does not compile is assumed to match: the stricter reading
  }
}

// Could this pattern (project-relative, braces expanded) match something under apps/<app>/src or apps/<app>/api?
function globMayReachImpl(g) {
  const segs = g.split('/');
  const walk = (i, state) => {
    if (state === 3) return true;
    if (i >= segs.length) return false;
    if (segs[i] === '**') return walk(i + 1, state) || walk(i, state + 1);
    const ok = state === 1 || segMatches(segs[i], state === 0 ? 'apps' : 'src') || (state === 2 && segMatches(segs[i], 'api'));
    return ok && walk(i + 1, state + 1);
  };
  return walk(0, 0);
}

// A glob argument as project-relative patterns: its literal directory read as written and through symlinks,
// the rest appended, braces expanded.
function globPatterns(pat, cwd, ctx) {
  const segs = pat.split('/');
  const k = segs.findIndex(wildSeg);
  const dir = unescape(segs.slice(0, k).join('/')) || (k > 0 ? '/' : '.');
  const rest = segs.slice(k).join('/');
  return [rel(dir, ctx.root, cwd), relReal(dir, ctx.root, cwd)].flatMap((d) => expandBraces(path.posix.join(d, rest)));
}

const NOTES_EXCLUSIONS = new Set([':(exclude).work/*/notes.md', ':!.work/*/notes.md', ':^.work/*/notes.md', ':(exclude).work']);
const COPIERS = /^(cp|mv|copy|move|xcopy|robocopy|rsync|tar|zip|unzip|7z|install|scp|dd|copy-item|move-item)$/i;

// The values of git commit -m: text, not paths.
function commitMessages(seg) {
  const idx = new Set();
  const texts = [];
  const call = gitCall(seg);
  if (!call || call.sub !== 'commit') return { idx, texts };
  const base = seg.length - call.args.length;
  call.args.forEach((a, k) => {
    let v = null;
    if (/^-[A-Za-z]*m$|^--message$/.test(a)) {
      idx.add(base + k + 1);
      v = call.args[k + 1];
    } else if (a.startsWith('--message=')) {
      idx.add(base + k);
      v = a.slice('--message='.length);
    }
    if (v) texts.push(v);
  });
  return { idx, texts };
}

// The arguments of a segment that can name a file: flags and commit messages are not, the value of --opt=value is.
function pathArgs(seg) {
  const skip = commitMessages(seg).idx;
  const out = [];
  for (let i = 1; i < seg.length; i++) {
    if (skip.has(i)) continue;
    let text = seg[i];
    let pat = seg.pat[i];
    if (text.startsWith('-')) {
      if (!text.includes('=')) continue;
      text = text.slice(text.indexOf('=') + 1);
      pat = pat.slice(pat.indexOf('=') + 1);
    }
    const redirect = /^\d*[<>]+&?/.exec(text);
    if (redirect) {
      text = text.slice(redirect[0].length);
      pat = pat.slice(redirect[0].length);
    }
    if (!text || /^[a-z]+:\/\//i.test(text) || NOTES_EXCLUSIONS.has(text)) continue;
    out.push({ text, pat });
  }
  return out;
}

// $name, ${…}, $(…), a backtick, <(…), ~ and $'…' build names the checks cannot see; $? $# $$ $! $- $@ $* and
// $0-$9 cannot name a path. Single quotes are literal. A # comment can hide a quote from the parser.
function expansionReason(who, command) {
  const text = commandText(command, 'expanding');
  const hit = (what) => `${who}: ${what} builds a name the guard cannot read. Write the path out; inside single quotes it is literal text.`;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1] || '';
    if (quote === "'") {
      if (c === "'") quote = null;
      continue;
    }
    if (c === '\\') {
      i++;
    } else if (c === '"') {
      quote = quote ? null : '"';
    } else if (c === '`') {
      return hit('a backtick substitution');
    } else if (c === '$') {
      if (/[?#$!0-9@*-]/.test(n)) i++;
      else if (/[A-Za-z_{([]/.test(n) || (quote === null && /['"]/.test(n))) return hit('a shell expansion ($…)');
    } else if (quote === null) {
      const word = i === 0 || /[\s;&|()=:<>]/.test(text[i - 1]);
      if (c === "'") quote = "'";
      else if ((c === '<' || c === '>') && n === '(') return hit('a process substitution');
      else if (c === '~' && word) return hit('a ~ expansion');
      else if (c === '#' && word) return `${who}: a # comment cannot be checked; leave it out.`;
    }
  }
  return null;
}

// What the segments are allowed to do at all: nothing nested, no scripts on stdin, no links, a cd the parser can follow.
function shapeReason(who, raw, segments) {
  if (commandText(raw) !== dropHeredocs(raw)) return `${who}: a script fed to a command through a heredoc cannot be checked. Run the command itself.`;
  if (segments.some((s) => s.nested)) return `${who}: bash -c, eval, powershell -Command and cmd /c cannot be checked. Run the command directly.`;
  const plain = (sep) => ['', ';', '\n', '&&'].includes(sep);
  for (const seg of segments) {
    const name = commandName(seg);
    if (['ln', 'mklink', 'popd'].includes(name)) return `${who} does not use ${name}: a link or a directory stack hides where a path leads.`;
    if (CD.includes(name) && (seg.length !== 2 || seg[1].startsWith('-') || !plain(seg.before) || !plain(seg.after))) {
      return `${who}: write cd as \`cd <dir> && …\` (one plain path, then && or ;), so the guard knows where the rest runs.`;
    }
  }
  return null;
}

// A wildcard may start only in a directory below the project root and outside .work: from the root, or from a
// directory above it, it can reach into .work/.
function wildcardReason(who, pat, cwd, ctx) {
  const segs = pat.split('/');
  const k = segs.findIndex(wildSeg);
  if (!fs.existsSync(cwd)) return `${who}: a wildcard after a cd into a directory that does not exist cannot be checked.`;
  const dir = relReal(unescape(segs.slice(0, k).join('/')) || (k > 0 ? '/' : '.'), ctx.root, cwd);
  if (inWork(dir)) return `${who}: name the .work/ files you read; a wildcard there could reach notes.md.`;
  if (dir === '' || /^\.\.(\/\.\.)*$/.test(dir)) {
    return `${who}: a wildcard that starts at the project root or above could reach .work/notes.md. Start it in a subdirectory (docs/*.md) or name the files.`;
  }
  if (expandBraces(segs.slice(k).join('/')).some((alt) => alt.split('/').some((s) => segMatches(s, '..')))) {
    return `${who}: a wildcard that can match .. could leave its directory. Name the files you read.`;
  }
  return null;
}

// The path-like arguments of every segment, resolved where the segment runs and through symlinks.
function argReason(role, located, ctx) {
  const te = role === 'test-engineer';
  const who = te ? 'TEST ENGINEER' : 'CRITIC';
  for (const { seg, cwd } of located) {
    for (const { text, pat } of pathArgs(seg)) {
      if (isWild(pat)) {
        if (te && globPatterns(pat, cwd, ctx).some(globMayReachImpl)) return NO_IMPL;
        const reason = wildcardReason(who, pat, cwd, ctx);
        if (reason) return reason;
        continue;
      }
      for (const r of [rel(text, ctx.root, cwd), relReal(text, ctx.root, cwd)]) {
        if (isNotes(r)) return `${who} does not read notes.md.`;
        if (te && isAppImpl(r)) return NO_IMPL;
        if (inWork(r) && COPIERS.test(commandName(seg))) return `${who}: do not copy, move or archive from .work/; name the files you read.`;
      }
    }
  }
  return null;
}

const NO_IMPL = 'TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths.';

// ---- git ----

// Subcommands that never show file content (Addendum 13.10). log and reflog qualify without a patch option;
// diff and show with a stat-like option and no patch option.
const GIT_FREE = new Set(['status', 'branch', 'ls-files', 'ls-tree', 'rev-parse', 'remote', 'fetch', 'add', 'commit', 'push', 'switch', 'merge-base']);
const GIT_STAT = new Set(['--stat', '--shortstat', '--numstat', '--name-only', '--name-status', '--quiet']);
const DISPLAY_OPT = new RegExp('^(--(stat|stat=\\d+(,\\d+){0,2}|shortstat|numstat|name-only|name-status|patch|patch-with-stat|oneline|no-color|color|no-ext-diff|cached|staged|' +
  'graph|decorate|abbrev-commit|no-merges|merges|reverse|ignore-all-space|ignore-space-change|quiet|unified=\\d+|max-count=\\d+|(format|pretty)=.*)|-(p|w|b|\\d+|U\\d+|n\\d+))$');
const HEX = /^[0-9a-f]{4,40}$/i;
const REF = /^[A-Za-z0-9_][A-Za-z0-9_./-]*(?:[~^]\d*)*$/;

// A ref name, HEAD, ~n and ^n suffixes, and a..b / a...b; a hex commit id only inside a range.
function plainRevision(a) {
  const at = a.indexOf('..');
  const side = (s) => REF.test(s) && !s.includes('..') && !s.includes('//');
  if (at < 0) return side(a) && !HEX.test(a.replace(/(?:[~^]\d*)+$/, ''));
  const dots = a.startsWith('...', at) ? 3 : 2;
  return side(a.slice(0, at)) && side(a.slice(at + dots));
}

// Display options, revisions, the `--` separator and the pathspecs; `bad` says what falls outside the allowed form.
function parseGitArgs(args) {
  const out = { paths: [], sep: false, bad: null };
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (out.sep) out.paths.push(a);
    else if (a === '--') out.sep = true;
    else if (a === '-n' && /^\d+$/.test(args[k + 1] || '')) k++;
    else if (a.startsWith('-')) {
      if (!DISPLAY_OPT.test(a)) out.bad = out.bad || 'an option outside the list of display options';
    } else if (!plainRevision(a)) out.bad = out.bad || 'a revision that is not a ref name, HEAD or a range of them';
  }
  return out;
}

function gitContentFree(call) {
  const { sub, args } = call;
  if (['add', 'commit'].includes(sub)) return !args.some((a) => /^(-[A-Za-z]*[pie]|--(patch|interactive|edit))$/.test(a));
  if (GIT_FREE.has(sub)) return true;
  if (['log', 'reflog'].includes(sub)) return !showsPatch(args);
  if (['diff', 'show'].includes(sub)) return args.some((a) => GIT_STAT.has(a) || /^--stat=\d+(,\d+){0,2}$/.test(a)) && !showsPatch(args) && !parseGitArgs(args).bad;
  return false;
}

// The one form in which CRITIC may read content through git: diff, log or show, at the project root, no global
// option, plain revisions, display options only, and exactly one exclusion that keeps notes.md out.
function fixedGitReason(call, cwd, ctx) {
  const no = (why) => `CRITIC: ${why}. A git command that shows file content has one form, run at the project root: ` +
    "`git diff|log|show <revisions> -- . ':(exclude).work/*/notes.md'` (notes.md must be excluded, in this exact case).";
  if (!['diff', 'log', 'show'].includes(call.sub)) return no('git shows content only through diff, log or show');
  if (!fs.existsSync(cwd) || relReal('.', ctx.root, cwd) !== '') return no('git runs at the project root only');
  const parsed = parseGitArgs(call.args);
  if (parsed.bad) return no(parsed.bad);
  if (!parsed.sep) return no('the `--` separator and the exclusion are missing');
  const magic = parsed.paths.filter((a) => a.startsWith(':'));
  if (magic.length !== 1 || !NOTES_EXCLUSIONS.has(magic[0])) return no('exactly one exclusion of notes.md is needed, and no other pathspec magic');
  return null;
}

// Redirections (`2>&1`, `> file`, `< file`, `<<EOF`) are not arguments of the command they sit beside.
const REDIRECT = /^(?:\d*|&)[<>]/;
const REDIRECT_OP = /^(?:\d*|&)(?:<<?<?|>>?|>\||<>|[<>]&)-?$/;

function withoutRedirects(args) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    if (REDIRECT_OP.test(args[k])) k++;
    else if (!REDIRECT.test(args[k])) out.push(args[k]);
  }
  return out;
}

// What a content-free subcommand may be given. Each takes only the options listed (so --upload-pack, --receive-pack,
// --exec and the rest that run a command are outside every list); a positional with `::` (ext::, fd::) is a remote
// that runs a command. log, reflog, diff and show are judged by showsPatch and parseGitArgs instead.
const GIT_FREE_OPTS = {
  status: /^(-s|-b|-z|-u|-uno|-unormal|-uall|--short|--branch|--porcelain(=v?[12])?|--long|--show-stash|--ahead-behind|--no-ahead-behind|--renames|--no-renames|--ignore-submodules(=\w+)?|--untracked-files(=(no|normal|all))?)$/,
  branch: /^(-a|-r|-v|-vv|-l|-i|--all|--remotes|--verbose|--list|--show-current|--ignore-case|--no-color|--color(=\w+)?|--column|--no-column|--merged|--no-merged|--contains|--no-contains|--points-at|--abbrev=\d+|--format=.*|--sort=.*)$/,
  'ls-files': /^(-c|-o|-m|-d|-s|-u|-k|-i|-z|-t|-v|--cached|--others|--modified|--deleted|--stage|--unmerged|--killed|--ignored|--exclude-standard|--full-name|--error-unmatch|--directory|--no-empty-directory|--eol|--deduplicate|--abbrev(=\d+)?)$/,
  'ls-tree': /^(-d|-r|-t|-l|-z|--name-only|--name-status|--long|--full-name|--full-tree|--object-only|--abbrev(=\d+)?)$/,
  'rev-parse': /^(--abbrev-ref(=\w+)?|--short(=\d+)?|--show-toplevel|--git-dir|--absolute-git-dir|--git-common-dir|--is-inside-work-tree|--is-bare-repository|--show-prefix|--show-cdup|--verify|-q|--quiet|--symbolic|--symbolic-full-name|--revs-only|--no-revs|--all|--branches|--tags|--remotes)$/,
  remote: /^(-v|--verbose)$/,
  fetch: /^(--all|--prune|-p|--prune-tags|--tags|-t|--no-tags|-q|--quiet|-v|--verbose|--dry-run|--no-recurse-submodules|--depth=\d+|--unshallow)$/,
  push: /^(--tags|--follow-tags|-u|--set-upstream|-q|--quiet|-v|--verbose|--dry-run|-n|--no-verify|--verify|--atomic|--progress)$/,
  add: /^(-v|--verbose|-n|--dry-run|-f|--force|-u|--update|-N|--intent-to-add|--renormalize|--ignore-errors|--refresh)$/,
  switch: /^(-c|--create|-d|--detach|-q|--quiet|--no-guess|-t|--track|--no-track)$/,
  'merge-base': /^(--is-ancestor|--fork-point|--all|-a|--octopus|--independent)$/,
};
const COMMIT_OPT = /^(--(all|signoff|no-verify|quiet|amend|no-edit|allow-empty|allow-empty-message|no-gpg-sign|reset-author|author=.+|date=.+|message=.*|file=.+|cleanup=\w+)|-[asnq]+)$/;
// Global options that cannot change what git reads or runs.
const GIT_SAFE_GLOBAL = new Set(['--no-pager', '--no-optional-locks']);

// Why this content-free git call is outside its fixed form, or null.
function gitFreeReason(who, call) {
  const no = (why) => `${who}: ${why}. A git call that shows no content takes only the options on its allowed list ` +
    '(and no global option except -C <dir>, --no-pager, --no-optional-locks).';
  for (let k = 0; k < call.globals.length; k++) {
    if (call.globals[k] === '-C') k++;
    else if (!GIT_SAFE_GLOBAL.has(call.globals[k])) return no(`the git option ${call.globals[k]} can change what git reads or runs`);
  }
  const { sub, args } = call;
  if (args.some((a) => a.includes('::'))) return no('a remote such as ext:: or fd:: runs a command');
  if (['log', 'reflog'].includes(sub)) {
    return sub === 'reflog' && args.some((a) => ['expire', 'delete'].includes(a)) ? no('reflog expire and delete change the repository') : null;
  }
  if (['diff', 'show'].includes(sub)) return null;
  const allowed = GIT_FREE_OPTS[sub];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') break;
    if (sub === 'commit') {
      if (/^(-[asnq]*m|--message|-F|--file)$/.test(a)) {
        k++;
        continue;
      }
      if (a.startsWith('-') && !COMMIT_OPT.test(a)) return no(`the option ${a} of git commit is not on the allowed list`);
    } else if (a.startsWith('-') && !(allowed && allowed.test(a))) {
      return no(`the option ${a} of git ${sub} is not on the allowed list`);
    }
  }
  if (sub === 'remote' && args.some((a) => !a.startsWith('-'))) return no('git remote takes no subcommand here');
  return null;
}

// GIT_ as a word (an environment variable that changes what git does), outside a commit message value.
const GIT_VAR = new RegExp('\\bGIT_', WIN ? 'i' : '');

function gitReason(role, call0, cwd, raw, ctx, segments) {
  const te = role === 'test-engineer';
  const who = te ? 'TEST ENGINEER' : 'CRITIC';
  const call = { ...call0, args: withoutRedirects(call0.args) };
  // A call that shows no content is judged on its own list; the ban below is for the ones that read.
  if (gitContentFree(call)) return gitFreeReason(who, call);
  if (call.globals.length || GIT_VAR.test(textWithoutMessages(raw, segments))) {
    return `${who}: git runs with no global option (-C, -c, --git-dir…) and no GIT_ variable named in the command: they change what it reads.`;
  }
  if (te) {
    return gitReadsContent(call)
      ? 'TEST ENGINEER does not read the implementation through git (diff, show, log -p, blame, grep).'
      : 'TEST ENGINEER runs only git commands that show no file content (status, log, branch, add, commit…).';
  }
  if (gitReadsContent(call) && !excludesNotes(call.args)) {
    return "CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`.";
  }
  return fixedGitReason(call, cwd, ctx);
}

// ---- the command-name allowlist (G.16) ----

// For CRITIC and TEST ENGINEER the command name is the key: every shell segment runs a command on this list, in the
// form given, or the call is blocked. A command that can run code, read files by a route the guard cannot see, or
// start another shell (bash -lc, env, xargs, timeout, awk, python, perl, ruby, deno, bun, source, `.`) is not on it.
const FREE_READERS = new Set(['cat', 'head', 'tail', 'ls', 'uniq', 'cut', 'tr', 'echo', 'printf', 'pwd', 'true', 'false', 'test', '[', 'jq',
  'mktemp', 'mkdir']);
const ALLOWED_LIST = 'cat, head, tail, wc, ls, diff, sort, uniq, cut, tr, echo, printf, pwd, true, false, test, [, jq, mktemp, mkdir, cd, ' +
  'sed -n (line ranges and p), grep (not recursive), find (no -exec, -delete, -fprint), npm (test, ci, install, run <script>, ls), ' +
  'npx (vitest, playwright, tsc, eslint, prettier), node (--test, or a script file), git (its own rules)';
const ALLOWED_COMMANDS = new Set([...FREE_READERS, ...CD, 'wc', 'diff', 'sort', 'sed', 'grep', 'find', 'npm', 'npx', 'node', 'git']);

// Variables a command may be given in front of it (`CI=1 npm test`). Any other, PATH, NODE_OPTIONS and GIT_* among
// them, changes what runs.
const SAFE_ENV = new Set(['CI', 'NODE_ENV', 'FORCE_COLOR', 'NO_COLOR', 'TZ', 'LANG', 'LC_ALL', 'TERM']);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

// The command word as the shell would look it up: a bare name only (a path to a program is not on the list).
function commandWord(token) {
  if (/[\\/]/.test(token)) return null;
  const name = fold(token);
  return WIN ? name.replace(/\.exe$/, '') : name;
}

// The first option of the arguments (before `--`) that `bad` rejects, or null. A short option is rejected by
// `badShort`, a long one unless `goodLong` matches: long options may be abbreviated, so only a known spelling is safe.
function badOption(args, { goodLong, badShort }) {
  for (const a of args) {
    if (a === '--') return null;
    if (a.startsWith('--')) {
      if (goodLong && !goodLong.test(a)) return a;
    } else if (a.length > 1 && a.startsWith('-') && badShort && badShort.test(a)) {
      return a;
    }
  }
  return null;
}

const GREP_LONG = new RegExp('^--(ignore-case|no-ignore-case|invert-match|word-regexp|line-regexp|count|files-with-matches|files-without-match|line-number|' +
  'no-filename|with-filename|only-matching|quiet|silent|no-messages|fixed-strings|extended-regexp|basic-regexp|perl-regexp|null|text|binary|' +
  'initial-tab|byte-offset|null-data|no-group-separator|color(=\\w+)?|colour(=\\w+)?|no-color|(max-count|after-context|before-context|context|' +
  'regexp|include|exclude|label|binary-files|devices)=.+)$');
const SED_RANGE = /^(\d+|\$)(,(\d+|\$))?p$/;
const WC_LONG = /^--(lines|words|bytes|chars|max-line-length)$/;
const SORT_LONG = new RegExp('^--(reverse|numeric-sort|unique|ignore-case|version-sort|stable|human-numeric-sort|month-sort|general-numeric-sort|' +
  'ignore-leading-blanks|dictionary-order|ignore-nonprinting|check|merge|zero-terminated|(field-separator|key|buffer-size)=.+)$');
const DIFF_LONG = new RegExp('^--(brief|text|unified(=\\d+)?|context(=\\d+)?|ignore-case|ignore-space-change|ignore-all-space|ignore-blank-lines|' +
  'ignore-trailing-space|strip-trailing-cr|side-by-side|report-identical-files|new-file|normal|expand-tabs|initial-tab|minimal|' +
  'suppress-common-lines|left-column|color(=\\w+)?|width=\\d+)$');
const FIND_BAD = /^-(exec|ok|delete|fprint|fls|files0-from)/;
const NPM_VALUED = new Set(['--prefix', '-w', '--workspace']);
const NPM_OPT = /^(--(prefix|workspace)=.+|--(workspaces|if-present|silent|no-audit|no-fund|ignore-scripts|json|all|long|legacy-peer-deps)|--depth=\d+|-s|-a)$/;
const NPX_TOOLS = new Set(['vitest', 'playwright', 'tsc', 'eslint', 'prettier']);

// Why this call is outside the form its command is allowed in, or null. `args` has no redirections.
const FORMS = {
  wc: (args) => badOption(args, { goodLong: WC_LONG }) && 'wc takes only its counting options',
  sort: (args) => badOption(args, { goodLong: SORT_LONG, badShort: /^-[^-]*o/ }) && 'sort writes no file and runs no program: no -o, --output, --compress-program, --files0-from',
  diff: (args) => badOption(args, { goodLong: DIFF_LONG, badShort: /^-[^-]*r/ }) && 'diff is not recursive (no -r, --recursive)',
  grep: (args) => badOption(args, { goodLong: GREP_LONG, badShort: /^-[^-]*[rRdf]/ }) && 'grep is not recursive and reads no pattern file (no -r, -R, -d, --directories, --recursive, -f)',
  find: (args) => args.some((a) => FIND_BAD.test(a)) && 'find takes no -exec, -execdir, -ok, -okdir, -delete, -fprint*, -fls',
  sed(args) {
    let quiet = false;
    const scripts = [];
    let positional = false;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === '-n') quiet = true;
      else if (a === '-e') scripts.push(args[++k] || '');
      else if (a.startsWith('-')) return 'sed takes only -n and -e';
      else if (!positional && !scripts.length) {
        positional = true;
        scripts.push(a);
      }
    }
    const ok = quiet && scripts.length > 0 && scripts.every((sc) => sc.split(';').every((part) => SED_RANGE.test(part.trim())));
    return ok ? null : 'sed is allowed as `sed -n \'<from>,<to>p\' <file>` only: -n and line ranges with p (no s///, e, w, r, R, W, -i)';
  },
  npm(args) {
    const rest = [];
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === '--') break;
      if (NPM_VALUED.has(a)) k++;
      else if (a.startsWith('-')) {
        if (!NPM_OPT.test(a)) return `npm takes no option ${a} here`;
      } else rest.push(a);
    }
    const [sub, ...more] = rest;
    if (!['test', 't', 'ci', 'install', 'run', 'ls'].includes(sub)) return 'npm runs test, t, ci, install, run <script> and ls only';
    if (sub === 'run' && (more.length !== 1)) return 'npm run takes one script name';
    if (['ci', 'install'].includes(sub) && more.length) return `npm ${sub} installs no named package here`;
    return null;
  },
  npx: (args) => (NPX_TOOLS.has(args[0]) ? null : 'npx runs vitest, playwright, tsc, eslint and prettier only, and its tool comes first'),
  node(args) {
    if (args[0] === '--test') return args.slice(1).some((a) => a.startsWith('-')) ? 'node --test takes file arguments only' : null;
    if (!args[0] || args[0].startsWith('-')) return 'node runs `--test <files>` or a script file (never -e, -p, --eval, --print, -r, --require, --import or -)';
    return null;
  },
};

// Blocks the first segment whose command is not on the list, or is on it but outside its form.
function allowlistReason(who, located) {
  const no = (why) => `${who}: ${why} Commands on the allowed list: ${ALLOWED_LIST}. Use the Read, Grep and Glob tools for the rest.`;
  for (const { seg } of located) {
    let i = 0;
    while (i < seg.length && ENV_ASSIGN.test(seg[i])) {
      const name = seg[i].slice(0, seg[i].indexOf('='));
      if (!SAFE_ENV.has(WIN ? name.toUpperCase() : name)) return no(`setting ${name} in front of a command can change what runs, so it is not allowed.`);
      i++;
    }
    if (i === seg.length) continue;
    const name = commandWord(seg[i]);
    if (name === null || !ALLOWED_COMMANDS.has(name)) return no(`\`${seg[i]}\` is not on the list of allowed commands.`);
    if (i > 0 && CD.includes(name)) return no('write cd on its own, without a variable in front of it.');
    if (name === 'git') {
      if (!gitCall(seg)) return no('git needs a subcommand.');
      continue;
    }
    const form = FORMS[name];
    const why = form && form(withoutRedirects(seg.slice(i + 1)));
    if (why) return no(`\`${name}\` is allowed only in a fixed form: ${why}.`);
  }
  return null;
}

// The command text without the values of git commit -m: a commit message is text, not a read. `norm` is applied to
// the text and to each quoted message before they are compared.
function textWithoutMessages(raw, segments, norm = (x) => x) {
  let text = norm(commandText(raw));
  for (const seg of segments) {
    for (const msg of commitMessages(seg).texts) {
      for (const q of ['"', "'"]) {
        const quoted = norm(q + msg + q);
        if (text.split(quoted).length === 2) text = text.replace(quoted, ' ');
      }
    }
  }
  return text;
}

function checkReader(role, tool, input, ctx) {
  const te = role === 'test-engineer';
  const who = te ? 'TEST ENGINEER' : 'CRITIC';

  if (tool === 'Read' || tool === 'NotebookRead') {
    const file = input.file_path || input.notebook_path || '';
    for (const r of [rel(file, ctx.root, ctx.cwd), relReal(file, ctx.root, ctx.cwd)]) {
      if (isNotes(r)) return `${who} does not read notes.md (the builder's own account).`;
      if (te && isAppImpl(r)) return 'TEST ENGINEER does not read apps/*/src or apps/*/api. Test from the spec; packages/shared is the contract.';
    }
    return null;
  }

  if (tool === 'Grep' || tool === 'Glob') {
    // Where the search starts, as written and through symlinks.
    const base = input.path || '.';
    let scopes = [rel(base, ctx.root, ctx.cwd), relReal(base, ctx.root, ctx.cwd)];
    if (tool === 'Glob' && input.pattern) {
      const prefix = literalPrefix(input.pattern);
      if (prefix) {
        scopes = scopes.flatMap((s) => {
          const joined = path.posix.join(s === '' ? '.' : s, prefix);
          return [rel(joined, ctx.root, ctx.root), relReal(joined, ctx.root, ctx.root)];
        });
      }
    }
    for (const scope of scopes) {
      if (te && reachesAppImpl(scope)) {
        return 'TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>.';
      }
      if (tool === 'Grep') {
        if (isNotes(scope)) return `${who} does not read notes.md.`;
        // .work in any case: some file systems ignore case
        if (reaches(scope.toLowerCase(), '.work') || isInside(scope.toLowerCase(), '.work')) {
          if (!grepExcludesNotes(input)) {
            return `${who} does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path.`;
          }
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

    // The specific reasons first: they say what was wrong where the guard can tell. The allowlist behind them is
    // what actually decides — a call that matches none of the allowed forms is blocked even if no reason fits.
    if (/notes\.md|notes~\d/i.test(both)) return `${who} does not read notes.md.`;
    if (/\.work\/[^\s"']*[*?[{]/i.test(both)) return `${who}: name the .work/ files you read; a wildcard there could reach notes.md.`;

    const expansion = expansionReason(who, raw);
    if (expansion) return expansion;
    const shape = shapeReason(who, raw, segments);
    if (shape) return shape;

    const located = withCwd(segments, ctx.cwd);
    for (const { seg, cwd } of located) {
      if (CD.includes(commandName(seg)) && seg[1]) {
        for (const target of [rel(seg[1], ctx.root, cwd), relReal(seg[1], ctx.root, cwd)]) {
          if (inWork(target)) return `${who}: do not cd into .work/; name the files you read.`;
          if (te && (isAppsDir(target) || isAppImpl(target))) {
            return 'TEST ENGINEER does not cd into an app. Use apps/<app>/tests paths from the root.';
          }
        }
      }
    }

    for (const { seg, cwd } of located) {
      const call = gitCall(seg);
      const reason = call && gitReason(role, call, cwd, raw, ctx, segments);
      if (reason) return reason;
    }

    for (const seg of segments) {
      if (!recursiveSearch(seg)) continue;
      if (te) return 'TEST ENGINEER does not search recursively from the shell. Use the Grep tool with an allowed path.';
      return 'CRITIC does not search recursively from the shell (it could reach notes.md). Use the Grep tool with a glob or type.';
    }

    const arg = argReason(role, located, ctx);
    if (arg) return arg;

    if (te) {
      // Paths inside strings (node -e "...") and other spellings, normalised.
      const text = textWithoutMessages(raw, segments, (x) => fold(slash(x)));
      for (const m of text.matchAll(/apps\/[^\s"'`;|&()]+/gi)) {
        const p = path.posix.normalize(m[0]);
        if (isAppImpl(p) || /^apps\/[^/]+\/[^/]*[*?[\]{}]/i.test(p)) return NO_IMPL;
      }
    }

    // The base: a command that is not on the list is blocked, whatever it is spelled like (G.16).
    return allowlistReason(who, located);
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

function block(reason, root, role, tool) {
  if (root) report(root, role, tool, reason);
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

module.exports = { shellSegments, gitCall, literalPrefix, rel, commitTakesWorkingTree, grepExcludesNotes };
